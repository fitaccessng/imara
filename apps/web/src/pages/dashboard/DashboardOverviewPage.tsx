
import {
  Activity,
  ArrowRight,
  Cloud,
  File,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  MoreHorizontal,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { PageShell } from "../PageShell";

const BRAND = "#20AD43";

const stats = [
  {
    label: "Total files",
    value: "0",
    description: "Your files will appear here",
    icon: FileText,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    label: "Folders",
    value: "0",
    description: "Organise your documents",
    icon: Folder,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Shared files",
    value: "0",
    description: "Files shared with others",
    icon: Users,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    label: "Storage used",
    value: "0 GB",
    description: "Your storage overview",
    icon: HardDrive,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
  },
];

const fileTypes = [
  { label: "Documents", size: "0 GB", color: "bg-blue-500", width: "0%" },
  { label: "Images", size: "0 GB", color: "bg-purple-500", width: "0%" },
  { label: "Spreadsheets", size: "0 GB", color: "bg-amber-500", width: "0%" },
  { label: "Other files", size: "0 GB", color: "bg-slate-400", width: "0%" },
];

const recentFiles = [
  {
    name: "No files uploaded yet",
    type: "Your documents will appear here",
    date: "—",
    size: "—",
    icon: FileText,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
];

const activities = [
  {
    title: "Welcome to IMARA",
    description: "Your secure document workspace is ready.",
    time: "Just now",
    icon: ShieldCheck,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
  },
];

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-base font-bold tracking-tight text-[#172B3A]">
          {title}
        </h2>

        {description && (
          <p className="mt-1 break-words text-xs leading-5 text-[#718096] sm:text-sm">
            {description}
          </p>
        )}
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center px-3 py-8 text-center sm:px-5 sm:py-10">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0F7F2]">
        <Icon size={22} className="text-[#20AD43]" />
      </div>

      <h3 className="text-sm font-semibold text-[#172B3A]">{title}</h3>

      <p className="mt-1 max-w-xs text-xs leading-5 text-[#718096]">
        {description}
      </p>
    </div>
  );
}

export function DashboardOverviewPage() {
  return (
    <PageShell
      eyebrow="Workspace"
      title="Overview"
      description="A clear view of your files, storage and recent activity."
    >
      <div className="w-full min-w-0 space-y-5 overflow-hidden pb-8 sm:space-y-7">

        {/* Welcome banner */}
        <section className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-[#102B46] px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border-[28px] border-white/[0.04] sm:h-64 sm:w-64 sm:border-[35px]" />

          <div className="pointer-events-none absolute -bottom-28 right-12 h-48 w-48 rounded-full border-[28px] border-white/[0.04] sm:right-32 sm:h-64 sm:w-64 sm:border-[35px]" />

          <div className="relative z-10 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 max-w-xl">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#20AD43]" />
                Your workspace
              </div>

              <h2 className="max-w-full break-words text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl lg:text-3xl">
                Everything in its right place.
              </h2>

              <p className="mt-2 max-w-md text-xs leading-6 text-white/65 sm:text-sm">
                Store, organise and access your important documents securely
                from one simple workspace.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap lg:w-auto lg:shrink-0">
              <a
                href="/dashboard/files"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#189638] sm:w-auto sm:px-5"
              >
                <Upload size={16} className="shrink-0" />
                Upload files
              </a>

              <a
                href="/dashboard/folders"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto sm:px-5"
              >
                <FolderPlus size={16} className="shrink-0" />
                New folder
              </a>
            </div>
          </div>
        </section>

        {/* Statistics */}
        <section className="min-w-0">
          <SectionHeading
            title="Your workspace at a glance"
            description="A summary of your account."
          />

          <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.label}
                  className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 transition hover:border-[#20AD43]/30 hover:shadow-sm sm:p-5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.iconBg}`}
                    >
                      <Icon size={19} className={stat.iconColor} />
                    </div>

                    <button
                      type="button"
                      aria-label={`More about ${stat.label}`}
                      className="rounded-lg p-1.5 text-[#A0AEC0] hover:bg-slate-50 hover:text-[#172B3A]"
                    >
                      <MoreHorizontal size={19} />
                    </button>
                  </div>

                  <p className="mt-4 text-xs font-medium text-[#718096] sm:text-sm">
                    {stat.label}
                  </p>

                  <p className="mt-1 break-words text-2xl font-bold tracking-tight text-[#172B3A]">
                    {stat.value}
                  </p>

                  <p className="mt-2 break-words text-[11px] leading-5 text-[#A0AEC0] sm:text-xs">
                    {stat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Storage overview */}
        <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 sm:p-5 lg:p-6 xl:col-span-3">
            <SectionHeading
              title="Storage overview"
              description="Monitor how your storage space is being used."
              action={
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#F0F7F2] px-2.5 py-1.5 text-[11px] font-semibold text-[#168B37] sm:px-3 sm:text-xs">
                  <Cloud size={14} />
                  Cloud storage
                </div>
              }
            />

            <div className="flex min-w-0 flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="relative h-36 w-36 shrink-0 sm:h-40 sm:w-40">
                <svg
                  viewBox="0 0 160 160"
                  className="h-full w-full -rotate-90"
                  role="img"
                  aria-label="Storage usage: zero percent"
                >
                  <circle
                    cx="80"
                    cy="80"
                    r="66"
                    fill="none"
                    stroke="#EDF1F5"
                    strokeWidth="13"
                  />

                  <circle
                    cx="80"
                    cy="80"
                    r="66"
                    fill="none"
                    stroke={BRAND}
                    strokeWidth="13"
                    strokeLinecap="round"
                    strokeDasharray="0 415"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold text-[#172B3A]">0%</p>
                  <p className="mt-0.5 text-[11px] text-[#718096]">Used</p>
                </div>
              </div>

              <div className="w-full min-w-0 flex-1">
                <p className="text-xs text-[#718096] sm:text-sm">
                  Available storage
                </p>

                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-2xl font-bold tracking-tight text-[#172B3A] sm:text-3xl">
                    5 GB
                  </span>
                  <span className="text-xs text-[#A0AEC0]">
                    total capacity
                  </span>
                </div>

                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#EDF1F5]">
                  <div className="h-full w-0 rounded-full bg-[#20AD43]" />
                </div>

                <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
                  <span className="text-[#718096]">0 GB used</span>
                  <span className="font-semibold text-[#172B3A]">
                    5 GB free
                  </span>
                </div>

                <div className="mt-4 flex min-w-0 items-start gap-2 rounded-xl bg-[#F7F9FC] p-3">
                  <ShieldCheck
                    size={17}
                    className="mt-0.5 shrink-0 text-[#20AD43]"
                  />
                  <p className="min-w-0 text-xs leading-5 text-[#718096]">
                    Your documents are stored in your secure cloud workspace.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* File type breakdown */}
          <div className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 sm:p-5 lg:p-6 xl:col-span-2">
            <SectionHeading
              title="Storage by file type"
              description="See what makes up your storage."
            />

            <div className="space-y-5">
              {fileTypes.map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`}
                      />
                      <span className="truncate text-xs font-medium text-[#4A5568] sm:text-sm">
                        {item.label}
                      </span>
                    </div>

                    <span className="shrink-0 text-xs font-semibold text-[#718096]">
                      {item.size}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0F2F5]">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-[#DCE3EA] p-3 text-center">
              <p className="text-xs leading-5 text-[#718096]">
                Upload files to see your storage breakdown.
              </p>
            </div>
          </div>
        </section>

        {/* Recent files and activity */}
        <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white xl:col-span-3">
            <div className="p-4 sm:p-5 lg:p-6">
              <SectionHeading
                title="Recent files"
                description="Your latest uploaded documents."
                action={
                  <a
                    href="/dashboard/files"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]"
                  >
                    View all <ArrowRight size={14} />
                  </a>
                }
              />

              {/* Responsive file list: cards on mobile, table on larger screens */}
              <div className="space-y-3 sm:hidden">
                {recentFiles.map((file) => {
                  const Icon = file.icon;

                  return (
                    <div
                      key={file.name}
                      className="flex min-w-0 items-center gap-3 rounded-xl bg-[#F7F9FC] p-3"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${file.iconBg}`}
                      >
                        <Icon size={18} className={file.iconColor} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[#172B3A]">
                          {file.name}
                        </p>
                        <p className="mt-1 break-words text-xs text-[#718096]">
                          {file.type}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs text-[#A0AEC0]">
                        {file.size}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#EDF1F5] text-[10px] font-semibold uppercase tracking-wider text-[#A0AEC0] lg:text-[11px]">
                      <th className="pb-3 pr-3 font-semibold">File name</th>
                      <th className="pb-3 pr-3 font-semibold">Date added</th>
                      <th className="pb-3 text-right font-semibold">Size</th>
                    </tr>
                  </thead>

                  <tbody>
                    {recentFiles.map((file) => {
                      const Icon = file.icon;

                      return (
                        <tr key={file.name}>
                          <td className="py-4 pr-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${file.iconBg}`}
                              >
                                <Icon
                                  size={17}
                                  className={file.iconColor}
                                />
                              </div>

                              <div className="min-w-0">
                                <p className="break-words text-sm font-semibold text-[#172B3A]">
                                  {file.name}
                                </p>
                                <p className="mt-0.5 text-xs text-[#A0AEC0]">
                                  {file.type}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="whitespace-nowrap py-4 pr-3 text-xs text-[#718096]">
                            {file.date}
                          </td>

                          <td className="whitespace-nowrap py-4 text-right text-xs text-[#718096]">
                            {file.size}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <EmptyState
                icon={File}
                title="Your files will appear here"
                description="Upload your first document to start building your digital workspace."
              />
            </div>
          </div>

          {/* Activity */}
          <div className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 sm:p-5 lg:p-6 xl:col-span-2">
            <SectionHeading
              title="Recent activity"
              description="What's happening in your workspace."
              action={
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F9FC]">
                  <Activity size={16} className="text-[#718096]" />
                </div>
              }
            />

            <div className="space-y-5">
              {activities.map((activity) => {
                const Icon = activity.icon;

                return (
                  <div
                    key={activity.title}
                    className="flex min-w-0 gap-3"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activity.iconBg}`}
                    >
                      <Icon size={17} className={activity.iconColor} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-[#172B3A]">
                        {activity.title}
                      </p>

                      <p className="mt-1 break-words text-xs leading-5 text-[#718096]">
                        {activity.description}
                      </p>

                      <p className="mt-2 text-[11px] text-[#A0AEC0]">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 border-t border-[#EDF1F5] pt-4">
              <a
                href="/dashboard/activity"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20AD43] hover:text-[#168B37]"
              >
                View activity history <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* Security reminder */}
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#DDEFE2] bg-[#F5FBF6] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <ShieldCheck size={21} className="text-[#20AD43]" />
            </div>

            <div className="min-w-0">
              <h3 className="break-words text-sm font-bold text-[#172B3A]">
                Your documents deserve protection.
              </h3>

              <p className="mt-1 max-w-xl break-words text-xs leading-5 text-[#718096]">
                Keep your account secure by using a strong password and
                reviewing your sharing permissions regularly.
              </p>
            </div>
          </div>

          <a
            href="/dashboard/settings/security"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start text-sm font-semibold text-[#168B37] hover:text-[#106E2B] sm:self-center"
          >
            Security settings <ArrowRight size={16} />
          </a>
        </section>
      </div>
    </PageShell>
  );
}

export default DashboardOverviewPage;
