import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError, apiRequest, type User } from "../../lib/api";

const adminLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;
type AdminIdentity = Pick<User, "id" | "email" | "name" | "emailVerified"> & { role: "ADMIN" };

function getAdminLoginError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return "The email or password is incorrect. Check your details and try again.";
  }
  if (error instanceof ApiError && error.status === 403) {
    return "Verify your email address before signing in.";
  }
  if (error instanceof ApiError && error.status === 0) {
    return "We couldn’t connect to IMARA. Check your internet connection and try again.";
  }
  if (error instanceof ApiError && error.status === 503) {
    return "The IMARA sign-in service is temporarily unavailable. Please try again shortly.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "IMARA couldn’t complete sign-in. Please check that the API and its database are available, then try again.";
  }
  return "Administrator sign-in could not be completed. Please try again.";
}

function getAdminIdentityError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "This account is not an active platform administrator. Ask an authorised operator to provision or reactivate it.";
  }
  if (error instanceof ApiError && error.status === 0) {
    return "We couldn’t connect to IMARA to verify administrator access. Check your connection and try again.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "Your credentials were accepted, but IMARA couldn’t verify the administrator profile. Ask the operator to check the platform-admin database migration and API logs.";
  }
  if (error instanceof ApiError && error.status === 401) {
    return "Your sign-in session could not be verified. Please sign in again.";
  }
  return "IMARA couldn’t verify administrator access. Please try again.";
}

export function AdminLoginPage() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginValues>({ resolver: zodResolver(adminLoginSchema) });

  if (loading) {
    return <main className="full-state"><span className="loader" />Checking your current session…</main>;
  }
  if (user?.role === "ADMIN") return <Navigate to="/admin" replace />;
  if (user) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-card" aria-labelledby="admin-access-title">
          <span className="admin-login-icon"><ShieldCheck size={24} /></span>
          <span className="eyebrow">Administrator sign-in</span>
          <h1 id="admin-access-title">This account isn’t an administrator.</h1>
          <p>Platform administrator access is provisioned separately. Sign out before signing in with an authorised admin account.</p>
          {formError && <p className="form-alert" role="alert">{formError}</p>}
          <button className="button button-dark button-wide" type="button" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? "Signing out…" : "Sign out of this account"}
          </button>
          <Link className="admin-login-back" to="/">Back to IMARA</Link>
        </section>
      </main>
    );
  }

  async function signOut() {
    setSigningOut(true);
    setFormError("");
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
      setUser(null);
    } catch {
      setFormError("We couldn’t sign out this account. Please refresh the page and try again.");
    } finally {
      setSigningOut(false);
    }
  }

  async function onSubmit(values: AdminLoginValues) {
    setFormError("");
    try {
      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: values.email.trim(), password: values.password }),
      });
    } catch (error) {
      setFormError(getAdminLoginError(error));
      return;
    }

    try {
      const admin = await apiRequest<AdminIdentity>("/admin/me");
      if (admin.role !== "ADMIN") {
        setFormError("This account does not have platform administrator access.");
        await apiRequest<void>("/auth/logout", { method: "POST" });
        return;
      }
      setUser(admin);
      navigate("/admin", { replace: true });
    } catch (error) {
      const message = getAdminIdentityError(error);
      try {
        await apiRequest<void>("/auth/logout", { method: "POST" });
      } catch {
        setFormError(`${message} We couldn’t clear the sign-in session; refresh the page before trying another account.`);
        return;
      }
      setFormError(message);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <Link to="/" className="brand-lockup admin-login-brand" aria-label="IMARA home">
          <span className="brand-mark">i</span>IMARA<span className="brand-dot">.</span>
        </Link>
        <span className="admin-login-icon"><KeyRound size={23} /></span>
        <span className="eyebrow">Restricted access</span>
        <h1 id="admin-login-title">Administrator sign-in</h1>
        <p>Sign in with an account that has been authorised for platform administration.</p>

        <form className="admin-login-form" noValidate onSubmit={handleSubmit(onSubmit)}>
          <label className="field">
            Email address
            <input type="email" autoComplete="username" placeholder="admin@example.com" aria-invalid={Boolean(errors.email)} {...register("email")} />
            {errors.email && <span className="field-error" role="alert">{errors.email.message}</span>}
          </label>
          <label className="field">
            Password
            <input type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} {...register("password")} />
            {errors.password && <span className="field-error" role="alert">{errors.password.message}</span>}
          </label>
          {formError && <p className="form-alert" role="alert">{formError}</p>}
          <button className="button button-green button-wide" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying access…" : "Sign in as administrator"}
            {!isSubmitting && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </form>

        <p className="admin-provisioning-note">
          Admin accounts cannot be created here. Ask an authorised operator to provision your verified account.
        </p>
        <Link className="admin-login-back" to="/">Back to IMARA</Link>
      </section>
    </main>
  );
}

export default AdminLoginPage;
