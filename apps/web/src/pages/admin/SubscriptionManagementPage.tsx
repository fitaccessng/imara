import { useQuery } from "@tanstack/react-query";
import { CreditCard, Search } from "lucide-react";
import { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import {
  AdminManagementError,
  AdminManagementHeader,
  AdminManagementLoading,
  AdminManagementPagination,
  adminDate,
  adminNumber,
  type AdminPageMetadata,
} from "./AdminManagementCommon";

type Plan = "FREE" | "PRO" | "BUSINESS";

interface Subscription {
  userId: string;
  plan: Plan;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
  user: { name: string; email: string };
}

interface SubscriptionPage {
  items: Subscription[];
  countsByPlan: Array<{ plan: Plan; count: number }>;
  page: AdminPageMetadata;
}

function planLabel(plan: Plan) {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

export function SubscriptionManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const query = useQuery({
    queryKey: ["admin-subscriptions", page, q, plan],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (q) params.set("q", q);
      if (plan) params.set("plan", plan);
      return apiRequest<SubscriptionPage>(`/admin/subscriptions?${params}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const nextQuery = String(form.get("q") ?? "").trim();
    const nextPlan = String(form.get("plan") ?? "");
    if (nextQuery) next.set("q", nextQuery);
    if (nextPlan) next.set("plan", nextPlan);
    setSearchParams(next);
  }

  if (query.isPending) return <AdminManagementLoading label="Loading customer subscriptions…" />;
  if (query.isError) return <AdminManagementError title="Subscriptions could not load" error={query.error} retry={() => void query.refetch()} />;
  const result = query.data;
  const counts = new Map(result.countsByPlan.map((entry) => [entry.plan, entry.count]));

  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="BILLING · ACCOUNTS"
        title="Subscription management"
        description="Review current plan assignments and billing periods. This view reports persisted subscription metadata; it does not expose customer content."
      />
      <section className="admin-stat-grid" aria-label="Subscription totals">
        {(["FREE", "PRO", "BUSINESS"] as const).map((currentPlan, index) => (
          <article className={`admin-stat-card${index === 1 ? " admin-stat-navy" : index === 2 ? " admin-stat-gold" : ""}`} key={currentPlan}>
            <div className="admin-stat-top"><span>{planLabel(currentPlan)} subscriptions</span><CreditCard size={16} aria-hidden="true" /></div>
            <strong>{adminNumber(counts.get(currentPlan) ?? 0)}</strong>
            <small>Persisted plan records</small>
          </article>
        ))}
        <article className="admin-stat-card">
          <div className="admin-stat-top"><span>Records in view</span><Search size={16} aria-hidden="true" /></div>
          <strong>{adminNumber(result.page.totalItems)}</strong>
          <small>{plan ? `${planLabel(plan as Plan)} plan filter` : "All plan records"}</small>
        </article>
      </section>
      <section className="admin-panel">
        <form className="admin-audit-filters" onSubmit={submit}>
          <label><span>Find a customer</span><input name="q" defaultValue={q} placeholder="Name or email" /></label>
          <label><span>Plan</span>
            <select name="plan" defaultValue={plan}>
              <option value="">All plans</option>
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="BUSINESS">Business</option>
            </select>
          </label>
          <span />
          <button className="admin-button admin-button-primary" type="submit"><Search size={14} />Apply filters</button>
        </form>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">CUSTOMER PLANS</span><h2>{adminNumber(result.page.totalItems)} subscriptions</h2></div></div>
        {result.items.length === 0 ? (
          <div className="admin-empty-state"><CreditCard size={20} /><strong>No subscriptions match</strong><span>Adjust the customer search or plan filter.</span></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Plan</th><th>Period start</th><th>Period end</th><th>Last updated</th></tr></thead>
              <tbody>{result.items.map((subscription) => (
                <tr key={subscription.userId}>
                  <td><strong>{subscription.user.name}</strong><small>{subscription.user.email}</small><small className="admin-id">ID · {subscription.userId}</small></td>
                  <td><span className={`admin-plan-badge admin-plan-badge-${subscription.plan.toLowerCase()}`}>{planLabel(subscription.plan)}</span></td>
                  <td>{adminDate(subscription.currentPeriodStart)}</td>
                  <td>{adminDate(subscription.currentPeriodEnd)}</td>
                  <td>{adminDate(subscription.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <AdminManagementPagination
          page={result.page}
          onChange={(nextPage) => {
            const next = new URLSearchParams(searchParams);
            if (nextPage > 1) next.set("page", String(nextPage));
            else next.delete("page");
            setSearchParams(next);
          }}
        />
      </section>
    </div>
  );
}

export default SubscriptionManagementPage;
