import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

interface Subscription {
  plan: string;
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
          <p>Plan changes and payment processing are not available yet.</p>
        </div>
      )}
    </PageShell>
  );
}

export default SubscriptionOverviewPage;
