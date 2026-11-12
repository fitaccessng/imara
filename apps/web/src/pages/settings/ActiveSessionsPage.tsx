import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Laptop, Monitor, Smartphone, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError, apiRequest, type AuthSession } from "../../lib/api";

function formatSessionDate(value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function ActiveSessionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions"],
    queryFn: () => apiRequest<{ sessions: AuthSession[] }>("/auth/sessions"),
  });
  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => apiRequest<void>(
      `/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    ),
    onSuccess: async (_result, sessionId) => {
      const session = sessionsQuery.data?.sessions.find((item) => item.id === sessionId);
      if (session?.current) {
        setUser(null);
        navigate("/login", {
          replace: true,
          state: { notice: "This device has been signed out." },
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
    },
  });
  const authenticationRequired = sessionsQuery.error instanceof ApiError
    ? sessionsQuery.error.status === 401
    : false;
  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">ACCOUNT · SECURITY</span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#172B3A] sm:text-3xl">Active sessions</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#718096]">
            Review devices signed in to your account and revoke access you no longer recognize.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#E5EAF0] bg-white px-3 py-2 text-xs font-semibold text-[#526579]">
          <Clock3 size={15} />
          {sessionsQuery.data?.sessions.length ?? 0} devices
        </span>
      </header>

      {sessionsQuery.isLoading ? (
        <div className="flex min-h-36 items-center justify-center gap-3 rounded-2xl border border-[#E5EAF0] bg-white text-sm text-[#718096]">
          <span className="loader" /> Loading active sessions…
        </div>
      ) : sessionsQuery.isError ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-red-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 text-sm text-red-700">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <strong>{authenticationRequired ? "Your session has expired." : "Sessions couldn’t load."}</strong>
              <p className="mt-1 text-xs leading-5 text-red-600">
                {authenticationRequired
                  ? "Sign in again to review your active devices."
                  : sessionsQuery.error instanceof Error ? sessionsQuery.error.message : "Please try again."}
              </p>
            </div>
          </div>
          {authenticationRequired ? (
            <Link className="button button-green button-small" to="/login" state={{ from: "/settings/sessions" }}>Go to login</Link>
          ) : (
            <button className="button button-outline button-small" onClick={() => void sessionsQuery.refetch()}>Try again</button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const userAgent = session.userAgent || "Browser session";
            const DeviceIcon = /mobile|android|iphone|ipad/i.test(userAgent) ? Smartphone : Monitor;
            return (
              <article key={session.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#E5EAF0] bg-white p-4 sm:flex-row sm:items-center sm:p-5">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${session.current ? "bg-[#EAF7ED] text-[#20AD43]" : "bg-[#F1F5F9] text-[#718096]"}`}>
                  <DeviceIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 break-words text-sm font-bold text-[#263B4D]">{userAgent}</h2>
                    {session.current && <span className="rounded-full bg-[#EAF7ED] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#168A35]">This device</span>}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#718096]">Last active {formatSessionDate(session.lastSeenAt, true)}</p>
                  <p className="text-[11px] text-[#94A3B8]">Signed in {formatSessionDate(session.createdAt)}</p>
                </div>
                {session.current ? (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#F0FAF2] px-3 py-2 text-xs font-semibold text-[#168A35]">
                    <CheckCircle2 size={14} /> Current session
                  </span>
                ) : (
                  <button
                    className="button button-outline button-small danger-button w-full sm:w-auto"
                    type="button"
                    disabled={revokeSession.isPending}
                    onClick={() => {
                      if (window.confirm("Revoke this session? The device will need to sign in again.")) {
                        revokeSession.mutate(session.id);
                      }
                    }}
                  >
                    <X size={14} />
                    {revokeSession.isPending && revokeSession.variables === session.id ? "Revoking…" : "Revoke access"}
                  </button>
                )}
              </article>
            );
          })}
          {sessions.length === 0 && (
            <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-[#DCE3EA] bg-white px-4 py-12 text-center">
              <Laptop size={24} className="text-[#94A3B8]" />
              <strong className="text-sm text-[#263B4D]">No active sessions found</strong>
              <span className="text-xs text-[#718096]">Your signed-in devices will appear here.</span>
            </div>
          )}
        </div>
      )}
      {revokeSession.isError && (
        <p className="form-alert" role="alert">
          {revokeSession.error instanceof Error ? revokeSession.error.message : "Unable to revoke this session."}
        </p>
      )}
      <Link to="/settings/profile" className="subtle-link">Back to account settings</Link>
    </section>
  );
}

export default ActiveSessionsPage;
