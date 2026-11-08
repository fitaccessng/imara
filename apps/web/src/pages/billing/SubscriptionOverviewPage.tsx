import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

interface Subscription {
  plan: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  entitlements: {
    staffLimit: number;
    activeEventLimit: number;
    canEditDocuments: boolean;
    canScanDocuments: boolean;
    advancedTeamManagement: boolean;
  };
  storage: {
    usedBytes: string;
    reservedBytes: string;
    limitBytes: string;
    availableBytes: string;
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** index;
  return `${amount >= 10 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export function SubscriptionOverviewPage() {
  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => apiRequest<Subscription>("/subscription"),
  });
  const paymentsQuery = useQuery({
    queryKey: ["billing-payments"],
    queryFn: () => apiRequest<Array<{
      checkoutId: string | null;
      plan: string;
      amountMinor: string;
      currency: string;
      status: string;
      createdAt: string;
      paidAt: string | null;
      periodEnd: string | null;
    }>>("/billing/payments"),
  });

  return (
    <PageShell eyebrow="Account" title="Subscription" description="Your current plan and personal storage usage.">
      {subscriptionQuery.isLoading ? (
        <div className="page-loading"><span className="loader" />Loading subscription…</div>
      ) : subscriptionQuery.isError || !subscriptionQuery.data ? (
        <div className="inline-error" role="alert">
          <div><strong>Subscription details couldn’t load.</strong><p>{subscriptionQuery.error instanceof Error ? subscriptionQuery.error.message : "Please try again."}</p></div>
          <button className="button button-outline button-small" onClick={() => void subscriptionQuery.refetch()}>Try again</button>
        </div>
      ) : (
        <div className="subscription-summary">
          <div className="subscription-summary-heading">
            <span className="subscription-icon"><HardDrive size={19} /></span>
            <div><span className="eyebrow">CURRENT PLAN</span><h2>{subscriptionQuery.data.plan}</h2></div>
          </div>
          <dl>
            <div><dt>Used</dt><dd>{formatBytes(Number(subscriptionQuery.data.storage.usedBytes))}</dd></div>
            <div><dt>Reserved for uploads</dt><dd>{formatBytes(Number(subscriptionQuery.data.storage.reservedBytes))}</dd></div>
            <div><dt>Total storage</dt><dd>{formatBytes(Number(subscriptionQuery.data.storage.limitBytes))}</dd></div>
            <div><dt>Available</dt><dd>{formatBytes(Number(subscriptionQuery.data.storage.availableBytes))}</dd></div>
          </dl>
          <div className="subscription-entitlements">
            <span>{subscriptionQuery.data.entitlements.staffLimit} staff seats (owner excluded)</span>
            <span>{subscriptionQuery.data.entitlements.activeEventLimit} active events</span>
            <span>{subscriptionQuery.data.entitlements.canEditDocuments ? "Document editing included" : "View documents; editing requires Pro"}</span>
            <span>{subscriptionQuery.data.entitlements.canScanDocuments ? "Scan-to-upload included" : "Scan-to-upload requires Pro"}</span>
          </div>
          <p>
            {subscriptionQuery.data.autoRenew
              ? "Your plan renews automatically."
              : subscriptionQuery.data.currentPeriodEnd
                ? `Your prepaid plan ends ${new Date(subscriptionQuery.data.currentPeriodEnd).toLocaleDateString()}. It will not renew automatically.`
                : "Your plan does not renew automatically."}
            {" "}
            <Link to="/pricing">Compare plans</Link>.
          </p>
          {paymentsQuery.isLoading ? (
            <p>Loading payment history…</p>
          ) : paymentsQuery.isError ? (
            <p role="alert">Payment history couldn’t load.</p>
          ) : !paymentsQuery.data ? (
            <p role="alert">Payment history is unavailable.</p>
          ) : (
            <section className="mt-6">
              <h3 className="font-semibold text-[#102B46]">Recent payments</h3>
              {paymentsQuery.data.length === 0 ? (
                <p className="mt-2 text-sm text-[#718096]">No paid plan checkouts yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {paymentsQuery.data.map((payment) => (
                    <li key={payment.checkoutId ?? payment.createdAt} className="flex flex-wrap justify-between gap-2 border-t border-[#EDF0F3] pt-3 text-sm">
                      <span>{payment.plan} · {payment.status.toLowerCase()}</span>
                      <span>{payment.currency} {(Number(payment.amountMinor) / 100).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

export default SubscriptionOverviewPage;
