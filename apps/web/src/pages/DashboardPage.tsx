
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BellRing,
  Building2,
  Camera,
  CalendarDays,
  ClipboardCheck,
  Cloud,
  CloudDownload,
  FileSignature,
  FileText,
  Folder,
  FolderPlus,
  LockKeyhole,
  ListTodo,
  MailPlus,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Upload,
  Video,
  WandSparkles,
  Clock3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, apiRequest, downloadFile, type DashboardRecentItem, type DashboardSummary } from "../lib/api";
import { StorageOverviewCard } from "./dashboard/StorageOverviewCard";
import { FileViewerModal } from "../components/FileViewerModal";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { workspaceHref, type Workspace } from "../workspaces/types";

interface WeeklyInsights {
  period: {
    startsAt: string;
    endsAt: string;
    durationDays: number;
  };
  filesCreated: number;
  activeFileRequests: number;
  upcomingExpiry: {
    supported: boolean;
    items: Array<{
      id: string;
      name: string;
      expiresAt: string;
    }>;
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
  const date = new Date(
    value.length === 10 ? `${value}T12:00:00` : value
  );

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#20AD43]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#172B3A] sm:text-xl">
          {title}
        </h2>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const businessTools = [
  { title: "Business workspace", path: "/workspace", icon: Building2 },
  { title: "Shared notes", path: "/workspace/notes", icon: NotebookPen },
  { title: "Shared tasks", path: "/workspace/tasks", icon: ListTodo },
  { title: "Meetings", path: "/workspace/meetings", icon: Video },
  { title: "Forms", path: "/workspace/forms", icon: ClipboardCheck },
  { title: "Shared files", path: "/workspace", icon: FileText },
  { title: "Team calendar", path: "/workspace/calendar", icon: CalendarDays },
  { title: "Private files", path: "/workspace/file-deliveries", icon: LockKeyhole },
  { title: "Signatures", path: "/workspace/signatures", icon: FileSignature },
  { title: "Approvals", path: "/workspace/approvals", icon: ClipboardCheck },
  { title: "Reminders", path: "/workspace/reminders", icon: BellRing },
  { title: "Team chat", path: "/workspace/chat", icon: MessageCircle },
];

function DashboardBusinessTools({ workspace }: { workspace: Workspace }) {
  return (
    <section className="dashboard-business-tools overflow-hidden rounded-2xl border border-[#DDEBE0] bg-white p-4 shadow-[0_3px_18px_rgba(16,43,70,0.025)] sm:p-5 lg:p-6">
      <SectionHeading eyebrow="BUSINESS WORKSPACE" title={workspace.name} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {businessTools.map(({ title, path, icon: Icon }) => (
          <Link
            key={path}
            to={workspaceHref(path, workspace.id)}
            className="dashboard-business-tool group flex min-w-0 items-center gap-2.5 rounded-xl border border-[#E8EFE9] bg-[#F8FBF8] p-3 transition hover:border-[#B9DCC1] hover:bg-[#F1F9F3] sm:p-3.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF7ED] text-[#168D34]">
              <Icon size={17} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#34495B]">{title}</span>
            <ArrowRight size={14} className="hidden shrink-0 text-[#9AA7B5] transition group-hover:translate-x-0.5 group-hover:text-[#20AD43] sm:block" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* Quick access tools */

const quickTools = [
  {
    title: "Files",
    description: "Browse and manage your files",
    icon: Folder,
    iconBg: "bg-[#EEF3FF]",
    iconColor: "text-[#5278D9]",
    to: "/files",
  },
  {
    title: "IMARA Notes",
    description: "Capture your thoughts",
    icon: NotebookPen,
    iconBg: "bg-[#EAF7ED]",
    iconColor: "text-[#20AD43]",
    to: "/notes",
  },
  {
    title: "Tasks",
    description: "Track work and deadlines",
    icon: ListTodo,
    iconBg: "bg-[#EEF3FF]",
    iconColor: "text-[#5278D9]",
    to: "/tasks",
  },
  {
    title: "Meetings",
    description: "Capture decisions and actions",
    icon: Video,
    iconBg: "bg-[#FFF1E8]",
    iconColor: "text-[#E78A4B]",
    to: "/meetings",
  },
  {
    title: "File requests",
    description: "Collect files by link",
    icon: MailPlus,
    iconBg: "bg-[#EEF3FF]",
    iconColor: "text-[#5278D9]",
    to: "/file-requests",
  },
  {
    title: "Document tools",
    description: "Convert and create",
    icon: WandSparkles,
    iconBg: "bg-[#F5EEFF]",
    iconColor: "text-[#9461C8]",
    to: "/document-tools",
  },
  {
    title: "Forms & documents",
    description: "Create and share",
    icon: FileText,
    iconBg: "bg-[#EAF7ED]",
    iconColor: "text-[#20AD43]",
    to: "/documents",
  },
  {
    title: "Shared galleries",
    description: "Bring memories together",
    icon: Camera,
    iconBg: "bg-[#FFF1E8]",
    iconColor: "text-[#E78A4B]",
    to: "/events",
  },
  {
    title: "Calendar",
    description: "Keep important dates",
    icon: CalendarDays,
    iconBg: "bg-[#EAF5FC]",
    iconColor: "text-[#3992C6]",
    to: "/calendar",
  },
];

function DashboardQuickTools({ online }: { online: boolean }) {
  return (
    <section className="dashboard-quick-tools overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white p-4 shadow-[0_3px_18px_rgba(16,43,70,0.025)] sm:p-5 lg:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#20AD43]">
            WORKSPACE
          </p>
          <h2 className="mt-1 text-base font-bold text-[#172B3A] sm:text-lg">
            Quick access
          </h2>
        </div>

        <span className="text-[11px] text-[#89969B] sm:text-xs">
          Your everyday tools
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-4">
        {quickTools.map((tool) => {
          const Icon = tool.icon;

          return (
            <Link
              key={tool.title}
              to={tool.to}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-xl border border-transparent bg-[#F8FAF9] p-2 text-center transition hover:border-[#DDEFE2] hover:bg-[#F1F9F3] sm:items-start sm:p-3 lg:p-4"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${tool.iconBg}`}
              >
                <Icon size={18} className={tool.iconColor} />
              </div>

              <div className="min-w-0 w-full">
                <p className="line-clamp-2 min-h-7 text-[10px] font-bold leading-tight text-[#172B3A] sm:text-xs lg:text-sm">
                  {tool.title}
                </p>
                <p className="mt-1 hidden truncate text-[11px] text-[#89969B] sm:block">
                  {tool.description}
                </p>
              </div>

              <ArrowRight
                size={15}
                className="hidden shrink-0 text-[#A0AEC0] transition group-hover:translate-x-1 group-hover:text-[#20AD43] sm:block sm:self-end"
              />
            </Link>
          );
        })}
      </div>

      {!online && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <CloudDownload size={17} />
            <p>
              <strong>You’re offline.</strong> Saved copies are still available.
            </p>
          </div>

          <Link
            to="/offline-files"
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-800"
          >
            Offline access <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </section>
  );
}

/* Loading state */

function LoadingDashboard({ online }: { online: boolean }) {
  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:space-y-7 sm:p-6 lg:p-8">
      <DashboardQuickTools online={online} />

      <div className="animate-pulse space-y-3">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-8 w-64 max-w-full rounded-lg bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>

      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </main>
  );
}

/* Error state */

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
          ? "Your sign-in session has expired. Sign in again to continue."
          : message}
      </p>

      {authenticationRequired ? (
        <Link
          to="/login"
          state={{ from: "/dashboard" }}
          onClick={onLogin}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-6 text-sm font-semibold text-white transition hover:bg-[#189638]"
        >
          Go to login <ArrowRight size={16} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-6 text-sm font-semibold text-white transition hover:bg-[#189638]"
        >
          Try again <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

/* Recent cloud library */

function RecentLibrary({
  items,
  onOpenFile,
}: {
  items: DashboardRecentItem[];
  onOpenFile: (file: Extract<DashboardRecentItem, { type: "file" }>) => void;
}) {
  const recentItems = items.slice(0, 6);

  if (!recentItems.length) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center sm:py-14">
        <div className="mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] border border-[#DDEFE2] bg-[#F0F8F2]">
          <Cloud size={32} strokeWidth={1.5} className="text-[#20AD43]" />
        </div>
        <h3 className="text-base font-bold text-[#172B3A] sm:text-lg">Nothing recent yet</h3>
        <p className="mt-2 max-w-sm text-xs leading-6 text-[#718096] sm:text-sm">
          Files and folders you add or update in your personal library will show up here.
        </p>
        <Link
          to="/files"
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#189638]"
        >
          <Upload size={16} />
          Open file library
          <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {recentItems.map((item) => {
        const isFolder = item.type === "folder";
        const Icon = isFolder ? Folder : FileText;
        const details = item.type === "folder"
          ? "Folder"
          : item.folderName ?? `${item.mimeType.split("/").pop()?.toUpperCase() ?? "File"} file`;
        const content = (
          <>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isFolder ? "bg-[#FFF5E7] text-[#C7862C]" : "bg-[#EAF7ED] text-[#20AD43]"}`}>
              <Icon size={18} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-semibold text-[#263B4A]">{item.name}</strong>
              <small className="mt-1 block truncate text-[10px] text-[#89969B]">{details}</small>
            </span>
            <span className="shrink-0 text-[9px] font-medium text-[#89969B]">
              {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(item.updatedAt))}
            </span>
          </>
        );
        const className = "group flex min-w-0 items-center gap-3 rounded-xl border border-[#EDF1F5] bg-[#FCFDFC] p-3 text-left transition hover:border-[#CFE8D4] hover:bg-[#F6FBF7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#20AD43]";

        return item.type === "folder" ? (
          <Link className={className} key={`${item.type}-${item.id}`} to={`/files?folder=${encodeURIComponent(item.id)}`}>
            {content}
          </Link>
        ) : (
          <button className={className} key={`${item.type}-${item.id}`} type="button" onClick={() => onOpenFile(item)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

/* Weekly insights */

function OrganisationInsights({
  insightsQuery,
}: {
  insightsQuery: ReturnType<
    typeof useQuery<WeeklyInsights>
  >;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 shadow-[0_3px_18px_rgba(16,43,70,0.025)] sm:p-6">
      <SectionHeading
        eyebrow="YOUR WEEK"
        title="Organisation insights"
        action={
          <Link
            to="/notes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]"
          >
            <NotebookPen size={14} />
            Open Notes
          </Link>
        }
      />

      {insightsQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : insightsQuery.isError ? (
        <div
          className="rounded-xl bg-[#F7F9FC] p-4 text-sm text-[#718096]"
          role="status"
        >
          <p>
            {insightsQuery.error instanceof Error
              ? insightsQuery.error.message
              : "Weekly insights could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => void insightsQuery.refetch()}
            className="mt-2 font-semibold text-[#168B37]"
          >
            Try again
          </button>
        </div>
      ) : insightsQuery.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

          {/* Files created */}
          <div className="rounded-xl border border-[#EDF1F5] bg-[#FAFCFA] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#89969B]">
                Files added
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EAF7ED]">
                <FileText size={16} className="text-[#20AD43]" />
              </div>
            </div>

            <strong className="mt-3 block text-3xl font-bold tracking-tight text-[#172B3A]">
              {insightsQuery.data.filesCreated}
            </strong>

            <p className="mt-1 text-xs text-[#89969B]">
              New documents · Last 7 days
            </p>
          </div>

          {/* File requests */}
          <Link
            to="/file-requests"
            className="group rounded-xl border border-[#EDF1F5] bg-[#FAFCFA] p-4 transition hover:border-[#CFE8D4] hover:bg-[#F3FAF4]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#89969B]">
                Open requests
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EEF3FF]">
                <MailPlus size={16} className="text-[#5278D9]" />
              </div>
            </div>

            <strong className="mt-3 block text-3xl font-bold tracking-tight text-[#172B3A]">
              {insightsQuery.data.activeFileRequests}
            </strong>

            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-[#89969B]">
                Active upload links
              </p>
              <ArrowRight
                size={14}
                className="text-[#20AD43] transition group-hover:translate-x-1"
              />
            </div>
          </Link>

          {/* Expiry */}
          <div className="rounded-xl border border-[#EDF1F5] bg-[#FAFCFA] p-4 sm:col-span-2 xl:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#89969B]">
                Upcoming expiry
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF5E8]">
                <Clock3 size={16} className="text-[#D69B36]" />
              </div>
            </div>

            {insightsQuery.data.upcomingExpiry.supported &&
            insightsQuery.data.upcomingExpiry.items.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {insightsQuery.data.upcomingExpiry.items
                  .slice(0, 2)
                  .map((item) => (
                    <li
                      key={item.id}
                      className="min-w-0 truncate text-sm font-semibold text-[#172B3A]"
                    >
                      {item.name}
                      <span className="ml-1 text-xs font-normal text-[#89969B]">
                        · {formatInsightDate(item.expiresAt)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[#172B3A]">
                {insightsQuery.data.upcomingExpiry.supported
                  ? "None in the next 30 days"
                  : "Not tracked yet"}
              </p>
            )}

            <div className="mt-2 text-xs text-[#89969B]">
              {insightsQuery.data.upcomingExpiry.supported ? (
                <Link
                  to="/files"
                  className="font-semibold text-[#168B37] hover:underline"
                >
                  Manage expiry dates
                </Link>
              ) : (
                insightsQuery.data.upcomingExpiry.reason
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* Main dashboard */

export function DashboardPage() {
  const { setUser } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [viewingRecentFile, setViewingRecentFile] = useState<Extract<DashboardRecentItem, { type: "file" }> | null>(null);
  const [recentFileError, setRecentFileError] = useState("");
  const { workspace } = useWorkspaceScope();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () =>
      apiRequest<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 30_000,
  });

  const insightsQuery = useQuery<WeeklyInsights>({
    queryKey: ["weekly-insights"],
    queryFn: () =>
      apiRequest<WeeklyInsights>("/insights/weekly"),
    refetchInterval: 60_000,
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

  if (isLoading) {
    return <LoadingDashboard online={online} />;
  }

  if (isError || !data) {
    const authenticationRequired =
      (error instanceof ApiError && error.status === 401) ||
      (error instanceof Error &&
        /authentication required/i.test(error.message));

    return (
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <DashboardQuickTools online={online} />

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
      </div>
    );
  }

  const firstName =
    data.user.name.trim().split(/\s+/)[0] || data.user.name;

  async function downloadRecentFile(file: Extract<DashboardRecentItem, { type: "file" }>) {
    setRecentFileError("");
    try {
      await downloadFile(`/files/${file.id}/download`, file.name);
    } catch (reason) {
      setRecentFileError(reason instanceof Error ? reason.message : "Unable to download this file.");
    }
  }

  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="dashboard-overview mx-auto w-full min-w-0 max-w-[1500px] space-y-5 overflow-x-clip pb-8 sm:space-y-7">

      {/* Header */}
      <header
        data-tour="organize"
        className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
            <span className="text-[11px] font-semibold text-[#89969B]">
              {today}
            </span>
          </div>

          <h1 className="break-words text-2xl font-bold tracking-tight text-[#172B3A] sm:text-3xl lg:text-[36px]">
            {getGreeting()}, {firstName}
            <span className="text-[#20AD43]">.</span>
          </h1>

          <p className="dashboard-welcome-copy mt-2 max-w-lg text-xs leading-6 text-[#718096] sm:text-sm">
            Your files and tools, at a glance.
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Link
            to="/files?createFolder=1"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5EAF0] bg-white px-3 text-xs font-semibold text-[#172B3A] transition hover:bg-slate-50 sm:px-4 sm:text-sm"
          >
            <FolderPlus size={15} />
            New folder
          </Link>

          <Link
            to="/files"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#189638] sm:text-sm"
          >
            <Upload size={16} />
            Upload file
          </Link>
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Storage */}
        <div data-tour="storage" className="min-w-0 xl:col-span-2">
          <StorageOverviewCard
            storage={data.subscription.storage}
            plan={data.subscription.plan}
          />
        </div>

        {/* Cloud library banner - wide screens only */}
        <section
          data-tour="get-started"
          className="relative hidden min-h-[270px] min-w-0 flex-col justify-between overflow-hidden rounded-[24px] bg-[#102B46] p-6 xl:col-span-3 xl:flex xl:p-8 2xl:p-10"
        >
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[38px] border-white/[0.045]" />

          <div className="pointer-events-none absolute -bottom-36 right-40 h-72 w-72 rounded-full border-[38px] border-white/[0.035]" />

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-white/80">
              <Cloud size={13} className="text-[#7DE69A]" />
              YOUR PERSONAL CLOUD
            </div>

            <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              Your files.
              <br />
              One organised space.
            </h2>

            <p className="mt-3 max-w-md text-xs leading-6 text-white/65 sm:text-sm">
              Keep your important documents together. Upload, organise and
              access your files whenever you need them.
            </p>
          </div>

          <div className="relative z-10 mt-7 flex flex-wrap items-center gap-4">
            <Link
              to="/files"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#189638]"
            >
              Explore my files
              <ArrowRight size={16} />
            </Link>

            <div className="inline-flex items-center gap-2 text-xs text-white/60">
              <ShieldCheck size={15} />
              Secure cloud storage
            </div>
          </div>

          {/* Decorative cloud file illustration */}
          <div className="pointer-events-none absolute bottom-8 right-12 hidden h-44 w-48 items-center justify-center lg:flex">
            <div className="absolute h-32 w-24 rotate-[-16deg] rounded-2xl border border-white/15 bg-white/10 shadow-xl" />

            <div className="absolute h-36 w-28 rotate-[12deg] rounded-2xl border border-white/20 bg-white/10 shadow-xl" />

            <div className="absolute flex h-36 w-28 rotate-[-3deg] flex-col gap-3 rounded-2xl border border-white/30 bg-white p-4 shadow-2xl">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EAF7ED]">
                <FileText size={16} className="text-[#20AD43]" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="h-1.5 w-4/5 rounded-full bg-slate-200" />
              <div className="h-1.5 w-full rounded-full bg-slate-200" />
              <div className="mt-1 h-7 rounded-lg bg-[#EAF7ED]" />
            </div>
          </div>
        </section>
      </section>

      {/* Quick tools */}
      <DashboardQuickTools online={online} />

      {workspace && <DashboardBusinessTools workspace={workspace} />}

      {/* File library */}
      <section
        data-tour="library"
        className="min-w-0 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white p-4 shadow-[0_3px_18px_rgba(16,43,70,0.025)] sm:p-6"
      >
        <SectionHeading
          eyebrow="YOUR CLOUD LIBRARY"
          title="Recently worked on"
          action={
            <Link
              to="/files"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]"
            >
              View all <ArrowRight size={14} />
            </Link>
          }
        />

        <RecentLibrary items={data.overview.recentActivity} onOpenFile={setViewingRecentFile} />
        {recentFileError && <p className="mt-3 text-xs text-[#A35449]" role="alert">{recentFileError}</p>}
      </section>
      {viewingRecentFile && (
        <FileViewerModal
          file={viewingRecentFile}
          readUrl={`/files/${viewingRecentFile.id}/download`}
          saveUrl={`/files/${viewingRecentFile.id}/content`}
          onClose={() => setViewingRecentFile(null)}
          onSaved={async () => { await refetch(); }}
          canEdit
          canDownload
          onDownload={() => { void downloadRecentFile(viewingRecentFile); }}
        />
      )}

      {/* Organisation insights */}
      <OrganisationInsights insightsQuery={insightsQuery} />

      {/* Storage information */}
      <div className="flex min-w-0 items-start gap-2 border-t border-[#E5EAF0] pt-4">
        <ShieldCheck
          size={15}
          className="mt-0.5 shrink-0 text-[#20AD43]"
        />

        <p className="text-[11px] leading-5 text-[#A0AEC0]">
          Storage updates from your account; uploads count toward your quota.
        </p>
      </div>
    </main>
  );
}

export default DashboardPage;
