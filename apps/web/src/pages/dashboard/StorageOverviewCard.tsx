
import { ArrowRight, HardDrive, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { DashboardSummary } from "../../lib/api";

type StorageData = DashboardSummary["subscription"]["storage"];

export function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 Bytes";

  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const amount = bytes / 1024 ** index;

  return `${amount >= 10 || index === 0
    ? Math.round(amount)
    : amount.toFixed(1)} ${units[index]}`;
}

export function StorageOverviewCard({
  storage,
  plan,
}: {
  storage: StorageData;
  plan: string;
}) {
  const used = Number(storage.usedBytes);
  const reserved = Number(storage.reservedBytes);
  const available = Number(storage.availableBytes);
  const limit = Number(storage.limitBytes);

  const values = [used, reserved, available, limit];

  if (!values.every(
    (value) => Number.isSafeInteger(value) && value >= 0
  )) {
    return (
      <div
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        role="alert"
      >
        Storage information is temporarily unavailable.
      </div>
    );
  }

  const usedRatio = limit > 0 ? Math.min(used / limit, 1) : 0;
  const reservedRatio = limit > 0
    ? Math.min(reserved / limit, 1 - usedRatio)
    : 0;

  const usedPercent = usedRatio * 100;

  const circumference = 2 * Math.PI * 62;
  const usedArc = usedRatio * circumference;
  const reservedArc = reservedRatio * circumference;

  return (
    <section className="relative min-w-0 overflow-hidden rounded-[24px] border border-[#E5EEE7] bg-white p-5 shadow-[0_4px_24px_rgba(20,50,30,0.035)] sm:p-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF8F1]">
              <HardDrive size={17} className="text-[#168B37]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#172B3A]">
                Storage
              </h2>
              <p className="text-[11px] text-[#89969B]">
                Your storage overview
              </p>
            </div>
          </div>
        </div>

        <span className="rounded-full border border-[#E2EFE4] bg-[#F5FAF5] px-3 py-1.5 text-[11px] font-semibold capitalize text-[#168B37]">
          {plan} plan
        </span>
      </div>

      {/* Main content */}
      <div className="mt-7 grid grid-cols-1 items-center gap-7 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8">

        {/* Donut chart */}
        <div className="flex justify-center">
          <div className="relative h-[172px] w-[172px]">

            <svg
              viewBox="0 0 144 144"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`${usedPercent.toFixed(2)} percent of storage used`}
            >
              {/* Background ring */}
              <circle
                cx="72"
                cy="72"
                r="62"
                fill="none"
                stroke="#EDF1EF"
                strokeWidth="10"
              />

              {/* Reserved storage */}
              {reservedArc > 0 && (
                <circle
                  cx="72"
                  cy="72"
                  r="62"
                  fill="none"
                  stroke="#F2B84B"
                  strokeWidth="10"
                  strokeDasharray={`${reservedArc} ${circumference - reservedArc}`}
                  strokeDashoffset={-usedArc}
                  className="transition-all duration-700"
                />
              )}

              {/* Used storage */}
              {usedArc > 0 && (
                <circle
                  cx="72"
                  cy="72"
                  r="62"
                  fill="none"
                  stroke="#20AD43"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${usedArc} ${circumference - usedArc}`}
                  className="transition-all duration-700"
                />
              )}
            </svg>

            {/* Centre content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#98A5A0]">
                Used storage
              </span>

              <span className="mt-1 max-w-[125px] truncate text-[25px] font-bold tracking-tight text-[#172B3A]">
                {formatStorageBytes(used)}
              </span>

              <span className="mt-1 text-[11px] text-[#89969B]">
                of {formatStorageBytes(limit)}
              </span>
            </div>
          </div>
        </div>

        {/* Storage details */}
        <div className="min-w-0">

          <div className="mb-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#89969B]">
                Storage capacity
              </span>
              <span className="text-xs font-bold text-[#168B37]">
                {usedPercent.toFixed(2)}%
              </span>
            </div>

            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-[#EDF1EF]"
              role="progressbar"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(usedPercent.toFixed(2))}
            >
              <div
                className="h-full rounded-full bg-[#20AD43] transition-all duration-700"
                style={{ width: `${usedPercent}%` }}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3">

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#20AD43]" />
                <span className="text-xs text-[#718096]">Used</span>
              </div>
              <span className="text-xs font-semibold text-[#172B3A]">
                {formatStorageBytes(used)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C7D0D8]" />
                <span className="text-xs text-[#718096]">Available</span>
              </div>
              <span className="text-xs font-semibold text-[#172B3A]">
                {formatStorageBytes(available)}
              </span>
            </div>

            {reserved > 0 && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F2B84B]" />
                  <span className="text-xs text-[#718096]">Reserved</span>
                </div>
                <span className="text-xs font-semibold text-[#172B3A]">
                  {formatStorageBytes(reserved)}
                </span>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF1F5] pt-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-[#20AD43]" />
          <span className="text-[11px] text-[#89969B]">
            Secure cloud storage
          </span>
        </div>

        <Link
          to="/settings/subscription"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#168B37] transition hover:text-[#106E2B]"
        >
          Manage plan
          <ArrowRight size={14} />
        </Link>
      </div>

    </section>
  );
}
