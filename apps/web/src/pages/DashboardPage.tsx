
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  Cloud,
  Compass,
  CalendarDays,
  CloudDownload,
  FileText,
  FolderPlus,
  LockKeyhole,
  MailPlus,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, apiRequest, type DashboardSummary } from "../lib/api";
import { StorageOverviewCard } from "./dashboard/StorageOverviewCard";

interface WeeklyInsights {
  period: { startsAt: string; endsAt: string; durationDays: number };
  filesCreated: number;
  activeFileRequests: number;
  upcomingExpiry: {
    supported: boolean;
    items: Array<{ id: string; name: string; expiresAt: string }>;
    reason?: string;
  };
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatInsightDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#20AD43] sm:text-[11px]">
          {eyebrow}
        </p>
        <h2 className="mt-1 break-words text-lg font-bold tracking-tight text-[#172B3A] sm:text-xl">
          {title}
        </h2>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100 lg:col-span-2" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  onLogin,
  authenticationRequired = false,
}: {
  message: string;
  onRetry: () => void;
  onLogin?: () => void;
  authenticationRequired?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <Activity size={24} className="text-red-500" />
      </div>

      <h2 className="mt-5 text-xl font-bold text-[#172B3A]">
        We couldn't load your dashboard
      </h2>

      <p className="mt-2 max-w-sm text-sm leading-6 text-[#718096]">
        {authenticationRequired
          ? "Your sign-in session has expired. Sign in again to continue to your dashboard."
          : message}
      </p>

      {authenticationRequired ? (
        <Link
          to="/login"
          state={{ from: "/dashboard" }}
          onClick={onLogin}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-6 text-sm font-semibold text-white transition hover:bg-[#189638]"
        >
          Go to login
          <ArrowRight size={16} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-6 text-sm font-semibold text-white transition hover:bg-[#189638]"
        >
          Try again
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

function EmptyLibrary({
  documentCount,
}: {
  documentCount: number;
}) {
  const hasDocuments = documentCount > 0;

  return (
    <div className="flex flex-col items-center px-4 py-9 text-center sm:py-12">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#F0F7F2]">
        <FileText size={35} strokeWidth={1.5} className="text-[#20AD43]" />

        <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-white bg-[#20AD43] text-white">
          <Sparkles size={12} />
        </span>
      </div>

      <h3 className="text-base font-bold text-[#172B3A] sm:text-lg">
        {hasDocuments
          ? `${documentCount} documents saved`
          : "Your library starts here"}
      </h3>

      <p className="mt-2 max-w-sm text-xs leading-6 text-[#718096] sm:text-sm">
        {hasDocuments
          ? "Your documents are waiting in your file library. Open it to continue."
          : "Keep your important documents organised in one secure place. Upload your first file to get started."}
      </p>

      <Link
        to="/files"
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#189638]"
      >
        {hasDocuments ? "Open file library" : "Upload your first file"}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const { setUser } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiRequest<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);
  const insightsQuery = useQuery({
    queryKey: ["weekly-insights"],
    queryFn: () => apiRequest<WeeklyInsights>("/insights/weekly"),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <LoadingDashboard />;
  }

  if (isError || !data) {
    const authenticationRequired = (error instanceof ApiError && error.status === 401)
      || (error instanceof Error && /authentication required/i.test(error.message));
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "Please check your internet connection and try again."
        }
        onRetry={() => void refetch()}
        onLogin={() => setUser(null)}
        authenticationRequired={authenticationRequired}
      />
    );
  }

  const firstName =
    data.user.name.trim().split(/\s+/)[0] || data.user.name;

  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <>
    <main className="mx-auto w-full min-w-0 max-w-[1500px] space-y-6 overflow-x-clip pb-8 sm:space-y-8">

      {/* Page heading */}
      <header data-tour="organize" className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
            <span className="text-[11px] font-semibold text-[#718096]">
              {today}
            </span>
          </div>

          <h1 className="break-words text-2xl font-bold tracking-tight text-[#172B3A] sm:text-3xl lg:text-[34px]">
            {getGreeting()}, {firstName}
            <span className="text-[#20AD43]">.</span>
          </h1>

          <p className="mt-2 max-w-lg text-xs leading-6 text-[#718096] sm:text-sm">
            Welcome to your personal space. Everything important, all in one
            place.
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("imara:start-product-tour"))}
            className="dashboard-quick-action inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5EAF0] bg-white px-3 py-2 text-xs font-semibold text-[#172B3A] transition hover:bg-slate-50 sm:flex-none sm:px-4 sm:text-sm"
          >
            <Compass size={15} />
            Take a tour
          </button>
          <Link
            to="/files?createFolder=1"
            className="dashboard-quick-action inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E5EAF0] bg-white px-3 py-2 text-xs font-semibold text-[#172B3A] transition hover:bg-slate-50 sm:flex-none sm:px-4 sm:text-sm"
          >
            <FolderPlus size={15} />
            New folder
          </Link>

          <Link
            to="/files"
            className="dashboard-quick-action inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#189638] sm:flex-none sm:px-4 sm:text-sm"
          >
            <Upload size={15} />
            Upload file
          </Link>
        </div>
      </header>

      {/* Main dashboard cards */}
      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">

        {/* Storage card */}
        <div data-tour="storage" className="min-w-0 xl:col-span-2">
          <StorageOverviewCard
            storage={data.subscription.storage}
            plan={data.subscription.plan}
          />
        </div>

        {/* Welcome card */}
        <div data-tour="get-started" className="relative flex min-h-[260px] min-w-0 flex-col justify-between overflow-hidden rounded-2xl bg-[#102B46] p-5 sm:min-h-[280px] sm:p-7 xl:col-span-3">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[35px] border-white/[0.04]" />
          <div className="pointer-events-none absolute -bottom-28 right-28 h-56 w-56 rounded-full border-[30px] border-white/[0.04]" />

          <div className="relative z-10 max-w-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-white/80">
              <Sparkles size={13} className="text-[#7DE69A]" />
              YOUR SPACE, YOUR PACE
            </div>

            <h2 className="mt-5 text-3xl font-bold leading-[1.15] tracking-tight text-white sm:text-4xl">
              Everything
              <br />
              has a place.
            </h2>

            <p className="mt-3 max-w-sm text-xs leading-6 text-white/65 sm:text-sm">
              Your private file library is ready. Organise documents, create
              folders and keep everything important close.
            </p>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/files"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#189638]"
            >
              Open file library
              <ArrowRight size={16} />
            </Link>

            <div className="inline-flex items-center gap-2 text-xs text-white/60">
              <Cloud size={15} />
              Secure cloud storage
            </div>
          </div>

          {/* Decorative document illustration */}
          <div className="pointer-events-none absolute bottom-8 right-8 hidden h-40 w-40 items-center justify-center opacity-80 sm:flex lg:right-12">
            <div className="absolute h-28 w-20 rotate-[-18deg] rounded-xl border border-white/20 bg-white/10 shadow-xl" />
            <div className="absolute h-32 w-24 rotate-[10deg] rounded-xl border border-white/20 bg-white/10 shadow-xl" />

            <div className="absolute flex h-32 w-24 rotate-[-4deg] flex-col gap-3 rounded-xl border border-white/30 bg-white p-4 shadow-2xl">
              <div className="h-2 w-10 rounded-full bg-[#20AD43]" />
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="h-1.5 w-4/5 rounded-full bg-slate-200" />
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="mt-1 h-7 rounded-md bg-[#EAF7ED]" />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-tools-panel" aria-labelledby="dashboard-tools-title">
        <div className="dashboard-tools-heading">
          <div>
            <span className="dashboard-tools-eyebrow">YOUR WORKSPACE</span>
            <h2 id="dashboard-tools-title">Quick tools</h2>
          </div>
          <span>Everyday actions, one click away</span>
        </div>
        <div className="dashboard-tools-grid">
          <Link to="/notes" className="dashboard-tool-card">
            <span className="dashboard-tool-icon dashboard-tool-notes"><NotebookPen size={19} /></span>
            <span><strong>IMARA Notes</strong><small>Capture a thought</small></span>
            <ArrowRight size={15} className="dashboard-tool-arrow" />
          </Link>
          <Link to="/file-requests" className="dashboard-tool-card">
            <span className="dashboard-tool-icon dashboard-tool-requests"><MailPlus size={19} /></span>
            <span><strong>Request files</strong><small>Collect files by link</small></span>
            <ArrowRight size={15} className="dashboard-tool-arrow" />
          </Link>
          <Link to="/document-tools" className="dashboard-tool-card">
            <span className="dashboard-tool-icon dashboard-tool-documents"><WandSparkles size={19} /></span>
            <span><strong>Document tools</strong><small>Convert and create</small></span>
            <ArrowRight size={15} className="dashboard-tool-arrow" />
          </Link>
          <Link to="/events" className="dashboard-tool-card">
            <span className="dashboard-tool-icon dashboard-tool-events"><Camera size={19} /></span>
            <span><strong>Events</strong><small>Manage shared galleries</small></span>
            <ArrowRight size={15} className="dashboard-tool-arrow" />
          </Link>
          <Link to="/calendar" className="dashboard-tool-card">
            <span className="dashboard-tool-icon dashboard-tool-calendar"><CalendarDays size={19} /></span>
            <span><strong>Calendar</strong><small>Keep dates in view</small></span>
            <ArrowRight size={15} className="dashboard-tool-arrow" />
          </Link>
        </div>
        {!online && (
          <div className="dashboard-offline-notice" role="status">
            <CloudDownload size={18} />
            <p><strong>You’re offline.</strong> Saved copies are still available on this device.</p>
            <Link to="/offline-files">Offline access <ArrowRight size={14} /></Link>
          </div>
        )}
      </section>

      {/* Library and account */}
      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">

        {/* Recently added */}
        <div data-tour="library" className="min-w-0 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-6 xl:col-span-3">
          <SectionTitle
            eyebrow="YOUR LIBRARY"
            title="Recently added"
            action={
              <Link
                to="/files"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]"
              >
                View library <ArrowRight size={14} />
              </Link>
            }
          />

          <EmptyLibrary documentCount={data.overview.documentsCount} />
        </div>

        {/* Account security */}
        <aside data-tour="account" className="flex min-w-0 flex-col rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-6 xl:col-span-2">
          <SectionTitle
            eyebrow="ACCOUNT CARE"
            title="Your account matters."
          />

          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F7F2]">
            <ShieldCheck size={27} className="text-[#20AD43]" />
          </div>

          <h3 className="mt-5 text-base font-bold text-[#172B3A]">
            Keep your details current.
          </h3>

          <p className="mt-2 text-xs leading-6 text-[#718096] sm:text-sm">
            Your account is protected by secure sign-in. Review your personal
            details and update your password whenever necessary.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#F7F9FC] p-3">
            <LockKeyhole size={16} className="shrink-0 text-[#20AD43]" />
            <span className="text-xs font-medium text-[#4A5568]">
              Secure account access
            </span>
            <CheckCircle2 size={15} className="ml-auto shrink-0 text-[#20AD43]" />
          </div>

          <Link
            to="/settings/profile"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-[#E5EAF0] px-4 py-2.5 text-sm font-semibold text-[#172B3A] transition hover:border-[#20AD43] hover:text-[#168B37]"
          >
            Account settings
            <ArrowRight size={15} />
          </Link>
        </aside>
      </section>

      <section className="rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-6">
        <SectionTitle
          eyebrow="YOUR WEEK"
          title="Organisation insights"
          action={
            <Link to="/notes" className="inline-flex items-center gap-1 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]">
              <NotebookPen size={14} /> Open Notes
            </Link>
          }
        />
        {insightsQuery.isPending ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : insightsQuery.isError ? (
          <div className="rounded-xl bg-[#F7F9FC] p-4 text-sm text-[#718096]" role="status">
            <p>{insightsQuery.error instanceof Error ? insightsQuery.error.message : "Weekly insights could not be loaded."}</p>
            <button type="button" onClick={() => void insightsQuery.refetch()} className="mt-2 font-semibold text-[#168B37]">Try again</button>
          </div>
        ) : insightsQuery.data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#F7F9FC] p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#718096]">Files added · 7 days</span>
              <strong className="mt-2 block text-2xl font-bold text-[#172B3A]">{insightsQuery.data.filesCreated}</strong>
              <span className="mt-1 block text-xs text-[#718096]">New personal documents</span>
            </div>
            <Link to="/file-requests" className="rounded-xl bg-[#F7F9FC] p-4 transition hover:bg-[#EFF8F1]">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#718096]">Open file requests</span>
              <strong className="mt-2 block text-2xl font-bold text-[#172B3A]">{insightsQuery.data.activeFileRequests}</strong>
              <span className="mt-1 block text-xs text-[#718096]">Live upload request links</span>
            </Link>
            <div className="rounded-xl bg-[#F7F9FC] p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#718096]">Upcoming expiry</span>
              {insightsQuery.data.upcomingExpiry.supported && insightsQuery.data.upcomingExpiry.items.length ? (
                <ul className="mt-2 space-y-1">
                  {insightsQuery.data.upcomingExpiry.items.slice(0, 2).map((item) => (
                    <li key={item.id} className="truncate text-sm font-semibold text-[#172B3A]">{item.name} · {formatInsightDate(item.expiresAt)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm font-semibold text-[#172B3A]">{insightsQuery.data.upcomingExpiry.supported ? "None in the next 30 days" : "Not tracked yet"}</p>
              )}
              <span className="mt-1 block text-xs text-[#718096]">{insightsQuery.data.upcomingExpiry.supported ? <Link to="/files" className="font-semibold text-[#168B37] hover:underline">Manage expiry dates in your files</Link> : insightsQuery.data.upcomingExpiry.reason}</span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Storage note */}
      <div className="flex min-w-0 items-start gap-2 border-t border-[#E5EAF0] pt-4">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#20AD43]" />
        <p className="text-[11px] leading-5 text-[#A0AEC0]">
          Storage figures are updated from your account. In-progress uploads
          count against your available storage quota.
        </p>
      </div>
    </main>
    </>
  );
}

export default DashboardPage;
