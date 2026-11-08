
import {
  ArrowRight,
  Check,
  Cloud,
  FileText,
  HardDrive,
  Image as ImageIcon,
  QrCode,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

type PlanPrice = {
  plan: "FREE" | "PRO" | "BUSINESS";
  currency: string;
  monthlyPriceMinor: string;
};

function formatPlanPrice(plan: PlanPrice): string {
  const minor = BigInt(plan.monthlyPriceMinor);
  const whole = minor / 100n;
  const cents = minor % 100n;
  const amount = Number(whole) + Number(cents) / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: cents === 0n ? 0 : 2,
    maximumFractionDigits: cents === 0n ? 0 : 2,
  }).format(amount);
}

const plans = [
  {
    plan: "FREE",
    name: "Free",
    subtitle: "Start with the essentials",
    period: "forever",
    description: "For individuals and small teams getting started with IMARA.",
    staff: "3",
    events: "3",
    storage: "5GB",
    features: [
      { name: "View documents", included: true },
      { name: "File and folder management", included: true },
      { name: "Business collaboration", included: true },
      { name: "Event QR codes", included: true },
      { name: "Shared event galleries", included: true },
      { name: "Document editing", included: false },
      { name: "Scan-to-upload", included: false },
    ],
    href: "/register",
    action: "Get started free",
    featured: false,
    available: true,
  },
  {
    plan: "PRO",
    name: "Pro",
    subtitle: "More tools for growing teams",
    period: "/ month · manual renewal",
    description: "For growing businesses that need more productivity and collaboration.",
    staff: "10",
    events: "10",
    storage: "15GB",
    features: [
      { name: "View documents", included: true },
      { name: "File and folder management", included: true },
      { name: "Business collaboration", included: true },
      { name: "Event QR codes", included: true },
      { name: "Shared event galleries", included: true },
      { name: "Document editing", included: true },
      { name: "Scan-to-upload", included: true },
    ],
    href: "/billing/checkout?plan=PRO",
    action: "Choose Pro",
    featured: true,
    available: true,
  },
  {
    plan: "BUSINESS",
    name: "Business",
    subtitle: "Capacity for established businesses",
    period: "/ month · manual renewal",
    description: "For established businesses managing larger teams and document workloads.",
    staff: "30",
    events: "20",
    storage: "25GB",
    features: [
      { name: "View documents", included: true },
      { name: "File and folder management", included: true },
      { name: "Business collaboration", included: true },
      { name: "Event QR codes", included: true },
      { name: "Shared event galleries", included: true },
      { name: "Document editing", included: true },
      { name: "Scan-to-upload", included: true },
    ],
    href: "/billing/checkout?plan=BUSINESS",
    action: "Choose Business",
    featured: false,
    available: true,
  },
];

const comparisonFeatures = [
  {
    category: "DOCUMENT MANAGEMENT",
    icon: FileText,
    rows: [
      { name: "View documents", values: [true, true, true] },
      { name: "File and folder management", values: [true, true, true] },
      { name: "Document editing", values: [false, true, true] },
      { name: "Scan-to-upload", values: [false, true, true] },
    ],
  },
  {
    category: "TEAM COLLABORATION",
    icon: Users,
    rows: [
      { name: "Business workspace", values: [true, true, true] },
      { name: "Staff capacity", values: ["3 staff", "10 staff", "30 staff"] },
      { name: "Folder permissions", values: [true, true, true] },
    ],
  },
  {
    category: "EVENTS & GALLERIES",
    icon: ImageIcon,
    rows: [
      { name: "Event creation", values: [true, true, true] },
      { name: "Event QR codes", values: [true, true, true] },
      { name: "Guest photo and video uploads", values: [true, true, true] },
      { name: "Active event capacity", values: ["3 events", "10 events", "20 events"] },
    ],
  },
  {
    category: "STORAGE",
    icon: HardDrive,
    rows: [
      { name: "Cloud storage", values: ["5GB", "15GB", "25GB"] },
    ],
  },
];

function IncludedValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="text-xs font-semibold text-[#34495B]">
        {value}
      </span>
    );
  }

  return value ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#EAF8EE] text-[#168D34]">
      <Check size={14} strokeWidth={2.5} />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F2F4F6] text-[#A3AFBA]">
      <X size={13} />
    </span>
  );
}

function PlanCard({
  plan,
}: {
  plan: (typeof plans)[number] & { amount: string };
}) {
  return (
    <article
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(16,43,70,0.09)] ${
        plan.featured
          ? "border-[#20AD43] shadow-[0_15px_45px_rgba(32,173,67,0.10)]"
          : "border-[#E5EAF0] shadow-sm"
      }`}
    >
      {plan.featured && (
        <div className="flex items-center justify-center gap-2 bg-[#20AD43] px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[1.5px] text-white">
          <Zap size={13} fill="currentColor" />
          Most popular
        </div>
      )}

      <div className="flex flex-1 flex-col p-5 sm:p-6 lg:p-7">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-[#168D34]">
            {plan.subtitle}
          </span>
          <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-[#102B46]">
            {plan.name}
          </h3>
          <p className="mt-2 min-h-[48px] text-xs leading-6 text-[#718096]">
            {plan.description}
          </p>
        </div>

        <div className="mt-6 border-b border-[#EDF0F3] pb-6">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-[-1.5px] text-[#102B46] sm:text-4xl">
              {plan.amount}
            </span>
            <span className="text-xs text-[#8A99A8]">
              {plan.period}
            </span>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[1.3px] text-[#8A99A8]">
            Plan capacity
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[#F7F9FC] p-3">
              <Users size={15} className="text-[#20AD43]" />
              <p className="mt-3 text-lg font-extrabold text-[#102B46]">
                {plan.staff}
              </p>
              <p className="mt-0.5 text-[9px] text-[#718096]">Staff</p>
            </div>

            <div className="rounded-xl bg-[#F7F9FC] p-3">
              <QrCode size={15} className="text-[#20AD43]" />
              <p className="mt-3 text-lg font-extrabold text-[#102B46]">
                {plan.events}
              </p>
              <p className="mt-0.5 text-[9px] text-[#718096]">Events</p>
            </div>

            <div className="rounded-xl bg-[#F7F9FC] p-3">
              <Cloud size={15} className="text-[#20AD43]" />
              <p className="mt-3 text-lg font-extrabold text-[#102B46]">
                {plan.storage}
              </p>
              <p className="mt-0.5 text-[9px] text-[#718096]">Storage</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex-1">
          <p className="mb-4 text-[10px] font-extrabold uppercase tracking-[1.3px] text-[#8A99A8]">
            What's included
          </p>

          <div className="space-y-3">
            {plan.features.map((feature) => (
              <div
                key={feature.name}
                className={`flex items-start gap-2.5 text-xs leading-5 ${
                  feature.included ? "text-[#526678]" : "text-[#A3AFBA]"
                }`}
              >
                {feature.included ? (
                  <Check
                    size={15}
                    className="mt-0.5 shrink-0 text-[#20AD43]"
                  />
                ) : (
                  <X
                    size={15}
                    className="mt-0.5 shrink-0 text-[#B5BEC7]"
                  />
                )}
                <span>{feature.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {plan.available ? (
            <Link
              to={plan.href}
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                plan.featured
                  ? "bg-[#20AD43] text-white hover:bg-[#199438]"
                  : "border border-[#DCE5DF] bg-white text-[#102B46] hover:border-[#20AD43] hover:text-[#168D34]"
              }`}
            >
              {plan.action}
              <ArrowRight size={15} />
            </Link>
          ) : (
            <div
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold ${
                plan.featured
                  ? "bg-[#EAF8EE] text-[#168D34]"
                  : "border border-[#E5EAF0] bg-[#F7F9FC] text-[#718096]"
              }`}
            >
              {plan.action}
            </div>
          )}
          {!plan.available && (
            <p className="mt-2 text-center text-[10px] text-[#9AA7B5]">
              Paid subscriptions are not open yet.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function PricingPage() {
  const catalogueQuery = useQuery({
    queryKey: ["plan-catalogue"],
    queryFn: () => apiRequest<{ plans: PlanPrice[] }>("/plans"),
  });
  const pricingByPlan = new Map(
    (catalogueQuery.data?.plans ?? []).map((plan) => [plan.plan, plan]),
  );
  const displayedPlans = plans.map((plan) => {
    const price = pricingByPlan.get(plan.plan as PlanPrice["plan"]);
    return { ...plan, amount: price ? formatPlanPrice(price) : "—" };
  });

  return (
    <PageShell
      eyebrow="IMARA PRICING"
      title="Choose the space you need to grow."
      description="Start with free document storage and event galleries. Upgrade when your team, storage, or productivity needs increase."
    >
      <div className="space-y-16 pb-8 sm:space-y-20">
        {/* Pricing introduction */}
        <section className="relative overflow-hidden rounded-3xl bg-[#102B46] px-5 py-10 sm:px-9 sm:py-14 lg:px-12">
          <div className="absolute -right-20 -top-28 h-[300px] w-[300px] rounded-full bg-[#20AD43]/15 blur-3xl" />

          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div className="max-w-[650px]">
              <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-[#8FE2A2]">
                SIMPLE, CLEAR PRICING
              </span>
              <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-1.3px] text-white sm:text-4xl">
                Everything you need to organise work and event memories.
              </h2>
              <p className="mt-4 max-w-[560px] text-sm leading-7 text-white/65">
                Compare storage, staff capacity, active events, and document
                tools before choosing your plan.
              </p>
            </div>

            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[#8FE2A2]">
              <Cloud size={38} strokeWidth={1.4} />
            </div>
          </div>
        </section>

        {/* Pricing cards */}
        <section>
          <div className="mb-8 text-center">
            <span className="text-[10px] font-extrabold uppercase tracking-[1.8px] text-[#168D34]">
              FIND YOUR PLAN
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
              Plans for every stage.
            </h2>
            <p className="mx-auto mt-3 max-w-[500px] text-sm leading-6 text-[#718096]">
              Start free, then choose more capacity and productivity features
              as your needs change.
            </p>
          </div>

          {catalogueQuery.isLoading ? (
            <p className="text-center text-sm text-[#718096]" role="status">Loading current plan prices…</p>
          ) : catalogueQuery.isError ? (
            <p className="text-center text-sm text-red-600" role="alert">
              Current plan prices couldn’t load. Please try again shortly.
            </p>
          ) : (
            <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
              {displayedPlans.map((plan) => (
                <PlanCard key={plan.name} plan={plan} />
              ))}
            </div>
          )}
        </section>

        {/* Feature comparison */}
        <section>
          <div className="mb-7 max-w-[650px]">
            <span className="text-[10px] font-extrabold uppercase tracking-[1.8px] text-[#168D34]">
              PLAN COMPARISON
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-1px] text-[#102B46] sm:text-3xl">
              Compare what's included.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#718096]">
              A closer look at the tools and limits available on each plan.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E5EAF0] bg-white shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(65px,0.7fr))] border-b border-[#E5EAF0] bg-[#F7F9FC] sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(100px,0.7fr))]">
              <div className="p-3 sm:p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A99A8]">
                  Features
                </span>
              </div>
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex items-center justify-center p-3 text-center sm:p-5 ${
                    plan.featured ? "bg-[#EAF8EE]" : ""
                  }`}
                >
                  <span
                    className={`text-xs font-extrabold ${
                      plan.featured ? "text-[#168D34]" : "text-[#102B46]"
                    }`}
                  >
                    {plan.name}
                  </span>
                </div>
              ))}
            </div>

            {comparisonFeatures.map((group) => {
              const Icon = group.icon;

              return (
                <div key={group.category}>
                  <div className="flex items-center gap-2 border-b border-[#EDF0F3] bg-[#FAFBFC] px-3 py-3 sm:px-5">
                    <Icon size={14} className="text-[#20AD43]" />
                    <span className="text-[9px] font-extrabold tracking-[1.3px] text-[#526678]">
                      {group.category}
                    </span>
                  </div>

                  {group.rows.map((row) => (
                    <div
                      key={row.name}
                      className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(65px,0.7fr))] border-b border-[#F0F2F5] last:border-b-0 sm:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(100px,0.7fr))]"
                    >
                      <div className="flex items-center p-3 sm:p-4 sm:pl-5">
                        <span className="text-[10px] font-medium leading-4 text-[#526678] sm:text-xs">
                          {row.name}
                        </span>
                      </div>
                      {row.values.map((value, index) => (
                        <div
                          key={`${row.name}-${index}`}
                          className={`flex items-center justify-center p-2 sm:p-3 ${
                            index === 1 ? "bg-[#F5FBF6]" : ""
                          }`}
                        >
                          <IncludedValue value={value} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[10px] leading-5 text-[#8A99A8]">
            Paid plans are prepaid for one month and do not renew automatically.
            Renew before expiry to keep your paid features.
          </p>
        </section>

        {/* Capacity and upgrade information */}
        {/* <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
              <LockKeyhole size={20} />
            </span>
            <h3 className="mt-5 text-lg font-bold text-[#102B46]">
              Your existing data stays yours.
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#718096]">
              Reaching a plan limit does not mean your existing documents,
              staff, or events are automatically deleted. New actions that
              exceed your allowance are paused until you free up capacity
              or upgrade.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E5EAF0] bg-white p-5 sm:p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF8EE] text-[#20AD43]">
              <Users size={20} />
            </span>
            <h3 className="mt-5 text-lg font-bold text-[#102B46]">
              Understand your workspace limits.
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#718096]">
              Staff allowances apply to team members, not the workspace
              owner. Active event allowances count events that have not
              been completed, cancelled, or archived.
            </p>
          </div>
        </section>

        {/* Scanner note */}
        {/* <section className="flex flex-col gap-5 rounded-2xl bg-[#F7F9FC] p-5 sm:flex-row sm:items-center sm:p-7">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#20AD43] shadow-sm">
            <ScanLine size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-[#102B46]">
              Need document scanning?
            </h3>
            <p className="mt-1 text-xs leading-6 text-[#718096]">
              Scan-to-upload is included in the advertised Pro and Business
              plan features. It is separate from the event camera used for
              guest photo and video uploads.
            </p>
          </div>
          <Link
            to="/features#digital-drive"
            className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-[#168D34]"
          >
            Explore features <ArrowRight size={15} />
          </Link>
        </section>  */}

        {/* Final CTA */}
        <section className="overflow-hidden rounded-3xl bg-[#102B46] px-5 py-12 text-center sm:px-10 sm:py-14">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-[#8FE2A2]">
            <Cloud size={24} />
          </span>
          <h2 className="mx-auto mt-5 max-w-[650px] text-2xl font-extrabold tracking-[-1px] text-white sm:text-3xl">
            Start with IMARA. Grow when you're ready.
          </h2>
          <p className="mx-auto mt-4 max-w-[500px] text-sm leading-7 text-white/65">
            Create your free account and start organising your documents
            and event memories.
          </p>
          <Link
            to="/register"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#20AD43] px-6 text-sm font-bold text-white transition hover:bg-[#199438]"
          >
            Create a free account <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </PageShell>
  );
}

export default PricingPage;
