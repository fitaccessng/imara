
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  FileText,
  Folder,
  HardDrive,
  ShieldCheck,
  Users,
  Upload,
  Clock3,
} from "lucide-react";

import { apiRequest, type DashboardSummary } from "../../lib/api";
import { PageShell } from "../PageShell";
import {
  formatStorageBytes,
  StorageOverviewCard,
} from "./StorageOverviewCard";

const stats = [
  {
    label: "Total files",
    value: "0",
    description: "Documents in your workspace",
    icon: FileText,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    accent: "border-l-blue-500",
  },
  {
    label: "Folders",
    value: "0",
    description: "Your organised collections",
    icon: Folder,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    accent: "border-l-amber-500",
  },
  {
    label: "Shared files",
    value: "0",
    description: "Files shared with others",
    icon: Users,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
    accent: "border-l-purple-500",
  },
  {
    label: "Storage used",
    value: "0 GB",
    description: "Your current storage usage",
    icon: HardDrive,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    accent: "border-l-[#20AD43]",
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
    <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-[#172B3A] sm:text-lg">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-xs leading-5 text-[#718096] sm:text-sm">
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
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[230px] w-full flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F7F2]">
        <Icon size={25} strokeWidth={1.8} className="text-[#20AD43]" />
      </div>

      <h3 className="text-sm font-semibold text-[#172B3A] sm:text-base">
        {title}
      </h3>

      <p className="mt-2 max-w-xs text-xs leading-5 text-[#718096] sm:text-sm">
        {description}
      </p>

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="h-[300px] animate-pulse rounded-2xl border border-[#E5EAF0] bg-white"
      aria-label="Loading storage overview"
    />
  );
}

export function DashboardOverviewPage() {
  const storageQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () =>
      apiRequest<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 30_000,
  });

  const storageUsed = storageQuery.data
    ? formatStorageBytes(
        Number(
          storageQuery.data.subscription.storage.usedBytes
        )
      )
    : storageQuery.isLoading
      ? "Loading"
      : "—";

  return (
    <PageShell
      eyebrow="Workspace"
      title="Overview"
      description="A clear view of your files, storage and recent activity."
    >
      <div className="w-full min-w-0 space-y-6 overflow-hidden pb-8 sm:space-y-8">

        {/* Workspace overview */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#172B3A] sm:text-lg">
                Workspace overview
              </h2>
              <p className="mt-1 text-xs text-[#718096] sm:text-sm">
                Your workspace at a glance.
              </p>
            </div>

            <div className="hidden items-center gap-2 rounded-full border border-[#E5EAF0] bg-white px-3 py-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#20AD43]" />
              <span className="text-[11px] font-medium text-[#718096]">
                Workspace active
              </span>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
            {stats.map((stat) => {
              const Icon = stat.icon;

              const value =
                stat.label === "Storage used"
                  ? storageUsed
                  : stat.value;

              return (
                <div
                  key={stat.label}
                  className={`group min-w-0 rounded-2xl border border-[#E5EAF0] border-l-[3px] ${stat.accent} bg-white p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${stat.iconBg}`}
                    >
                      <Icon
                        size={19}
                        strokeWidth={1.8}
                        className={stat.iconColor}
                      />
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] font-medium text-[#718096] sm:text-sm">
                    {stat.label}
                  </p>

                  <p className="mt-1 break-words text-xl font-bold tracking-tight text-[#172B3A] sm:text-2xl">
                    {value}
                  </p>

                  <p className="mt-1.5 hidden text-xs text-[#A0AEC0] sm:block">
                    {stat.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Storage overview */}
        <section className="min-w-0">
          <div className="mb-4">
            <h2 className="text-base font-bold tracking-tight text-[#172B3A] sm:text-lg">
              Storage overview
            </h2>
            <p className="mt-1 text-xs text-[#718096] sm:text-sm">
              Monitor your available storage and usage.
            </p>
          </div>

          {storageQuery.isLoading ? (
            <LoadingCard />
          ) : storageQuery.isError || !storageQuery.data ? (
            <div
              className="flex min-h-40 flex-col items-start justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"
              role="alert"
            >
              <p>
                Storage details couldn’t load. Check your connection and try again.
              </p>

              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => void storageQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <StorageOverviewCard
              storage={storageQuery.data.subscription.storage}
              plan={storageQuery.data.subscription.plan}
            />
          )}
        </section>

        {/* Files and activity */}
        <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-12">

          {/* Recent files */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white xl:col-span-7">
            <div className="p-4 sm:p-5 lg:p-6">
              <SectionHeading
                title="Recent files"
                description="Your latest uploaded documents."
                action={
                  <a
                    href="/dashboard/files"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-[#20AD43] transition hover:bg-[#F0F7F2] hover:text-[#168B37]"
                  >
                    View all
                    <ArrowRight size={14} />
                  </a>
                }
              />

              <EmptyState
                icon={FileText}
                title="No files uploaded yet"
                description="Your documents will appear here once you upload your first file."
                action={
                  <a
                    href="/dashboard/files"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#168B37] sm:text-sm"
                  >
                    <Upload size={15} />
                    Upload your first file
                  </a>
                }
              />
            </div>
          </div>

          {/* Recent activity */}
          <div className="min-w-0 rounded-2xl border border-[#E5EAF0] bg-white p-4 sm:p-5 lg:p-6 xl:col-span-5">
            <SectionHeading
              title="Recent activity"
              description="What's happening in your workspace."
              action={
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0F7F2]">
                  <Activity
                    size={17}
                    className="text-[#20AD43]"
                  />
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
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activity.iconBg}`}
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.8}
                        className={activity.iconColor}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-[#172B3A]">
                        {activity.title}
                      </p>

                      <p className="mt-1 break-words text-xs leading-5 text-[#718096]">
                        {activity.description}
                      </p>

                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#A0AEC0]">
                        <Clock3 size={12} />
                        {activity.time}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 border-t border-[#EDF1F5] pt-4">
              <a
                href="/dashboard/activity"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#20AD43] transition hover:text-[#168B37]"
              >
                View activity history
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* Workspace status */}
        <div className="flex flex-col gap-2 rounded-2xl border border-[#E5EAF0] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0F7F2]">
              <ShieldCheck size={16} className="text-[#20AD43]" />
            </div>

            <div>
              <p className="text-xs font-semibold text-[#172B3A]">
                Your workspace is ready
              </p>
              <p className="mt-0.5 text-[11px] text-[#718096]">
                Your files and documents in one organised place.
              </p>
            </div>
          </div>

          <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#20AD43]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#20AD43]" />
            Active
          </span>
        </div>

      </div>
    </PageShell>
  );
}

export default DashboardOverviewPage;
