import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError, apiRequest, type User } from "../../lib/api";
import { AdminDashboard } from "./AdminDashboard";

type AdminRole =
  | "SUPER_ADMIN"
  | "USER_MANAGEMENT_ADMIN"
  | "FINANCE_ADMIN"
  | "SUPPORT_ADMIN"
  | "MARKETING_ADMIN"
  | "OPERATIONS_ADMIN"
  | "SECURITY_ADMIN";

type AdminIdentity = Pick<User, "id" | "email" | "name" | "emailVerified"> & {
  role: "ADMIN";
  platformAdminRole: AdminRole;
};

export function AdminPortal() {
  const { user, loading, loadError, refresh, signOut } = useAuth();
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [retryingSession, setRetryingSession] = useState(false);
  const adminIdentity = useQuery({
    queryKey: ["platform-admin-identity", user?.id],
    queryFn: () => apiRequest<AdminIdentity>("/admin/me"),
    enabled: Boolean(user?.role === "ADMIN"),
    retry: false,
  });

  async function handleSignOut() {
    setSignOutError("");
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "We couldn’t sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function retrySession() {
    setRetryingSession(true);
    try {
      await refresh();
    } catch {
      // AuthProvider stores the user-facing failure in loadError.
    } finally {
      setRetryingSession(false);
    }
  }

  if (loading) return <main className="full-state"><span className="loader" />Checking administrator access…</main>;
  if (retryingSession) return <main className="full-state"><span className="loader" />Checking administrator access…</main>;
  if (loadError) {
    return (
      <main className="full-state">
        <section className="admin-login-card">
          <h1>We couldn’t verify your access.</h1>
          <p>{loadError}</p>
          <button className="button button-dark" type="button" onClick={() => void retrySession()}>Try again</button>
        </section>
      </main>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "ADMIN") {
    return (
      <main className="full-state">
        <section className="admin-login-card">
          <span className="eyebrow">Restricted access</span>
          <h1>Administrator access required.</h1>
          <p>This account is not authorised to access platform administration.</p>
          <Link className="button button-dark" to="/admin/login">Use an admin account</Link>
        </section>
      </main>
    );
  }
  if (adminIdentity.isPending) return <main className="full-state"><span className="loader" />Verifying administrator access…</main>;
  if (adminIdentity.isError || !adminIdentity.data) {
    const forbidden = adminIdentity.error instanceof ApiError && adminIdentity.error.status === 403;
    const offline = adminIdentity.error instanceof ApiError && adminIdentity.error.status === 0;
    const unauthorized = adminIdentity.error instanceof ApiError && adminIdentity.error.status === 401;
    const unavailable = adminIdentity.error instanceof ApiError && adminIdentity.error.status >= 500;
    return (
      <main className="full-state">
        <section className="admin-login-card">
          <span className="eyebrow">Administrator access</span>
          <h1>
            {forbidden
              ? "Administrator access is no longer available."
              : unauthorized
                ? "Your admin session has expired."
                : unavailable
                  ? "We couldn’t verify your administrator profile."
                  : "We couldn’t verify your access."}
          </h1>
          <p>
            {forbidden
              ? "Sign in with an authorised administrator account."
              : unauthorized
                ? "Return to admin sign-in and authenticate again."
                : unavailable
                  ? "The API could not confirm the admin profile. Ask the operator to check the platform-admin database migration and API logs."
                  : offline
                    ? "We couldn’t connect to IMARA. Check your connection and try again."
                    : "Please try again, or return to admin sign-in."}
          </p>
          <div className="admin-portal-error-actions">
            {!forbidden && <button className="button button-dark" type="button" disabled={adminIdentity.isFetching} onClick={() => void adminIdentity.refetch()}>{adminIdentity.isFetching ? "Checking…" : "Try again"}</button>}
            <Link className="button button-outline" to="/admin/login">Return to admin sign-in</Link>
          </div>
        </section>
      </main>
    );
  }

  return <AdminDashboard
    identity={adminIdentity.data}
    onSignOut={() => void handleSignOut()}
    signingOut={signingOut}
    signOutError={signOutError}
  />;
}

export default AdminPortal;
