import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Search } from "lucide-react";
import { type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import {
  AdminManagementError,
  AdminManagementHeader,
  AdminManagementLoading,
  AdminManagementPagination,
  adminCurrency,
  adminDate,
  adminNumber,
  type AdminPageMetadata,
} from "./AdminManagementCommon";

type PaymentStatus = "PENDING" | "SUCCEEDED" | "EXPIRED";
type Plan = "FREE" | "PRO" | "BUSINESS";

interface Payment {
  id: string;
  checkoutId: string | null;
  plan: Plan;
  amountMinor: string;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
  user: { id: string; name: string; email: string };
}

interface PaymentPage {
  items: Payment[];
  revenueByCurrency: Array<{ currency: string; amountMinor: string; paymentCount: number }>;
  countsByStatus: Array<{ status: PaymentStatus; count: number }>;
  page: AdminPageMetadata;
}

function dateParam(value: string, inclusiveEnd: boolean) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (inclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function PaymentManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const query = useQuery({
    queryKey: ["admin-payments", page, q, status, plan, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (plan) params.set("plan", plan);
      if (from) params.set("from", dateParam(from, false));
      if (to) params.set("to", dateParam(to, true));
      return apiRequest<PaymentPage>(`/admin/payments?${params}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ["q", "status", "plan", "from", "to"]) {
      const value = String(form.get(field) ?? "").trim();
      if (value) next.set(field, value);
    }
    setSearchParams(next);
  }

  if (query.isPending) return <AdminManagementLoading label="Loading payment ledger…" />;
  if (query.isError) return <AdminManagementError title="Payment ledger could not load" error={query.error} retry={() => void query.refetch()} />;
  const result = query.data;
  const counts = new Map(result.countsByStatus.map((entry) => [entry.status, entry.count]));

  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="BILLING · RECONCILIATION"
        title="Payments & revenue"
        description="Gross collected amounts are calculated from successful payment attempts only and grouped by currency. Pending checkouts are excluded; the current ledger does not track refunds or provider fees."
      />
      <section className="admin-revenue-summary">
        <div className="admin-panel">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">COLLECTED</span><h2>Successful payments{from || to ? " in selected dates" : " · all time"}</h2></div><CircleDollarSign size={19} aria-hidden="true" /></div>
          {result.revenueByCurrency.length === 0
            ? <div className="admin-empty-state"><CircleDollarSign size={20} /><strong>No collected revenue in this period</strong><span>Successful payment records will appear here.</span></div>
            : <div className="admin-revenue-totals">{result.revenueByCurrency.map((entry) => (
              <article key={entry.currency}>
                <span>{entry.currency} · {adminNumber(entry.paymentCount)} settled</span>
                <strong>{adminCurrency(entry.amountMinor, entry.currency)}</strong>
              </article>
            ))}</div>}
        </div>
        <section className="admin-stat-grid" aria-label="Payment statuses">
          {(["SUCCEEDED", "PENDING", "EXPIRED"] as const).map((currentStatus, index) => (
            <article className={`admin-stat-card${index === 0 ? "" : index === 1 ? " admin-stat-navy" : " admin-stat-gold"}`} key={currentStatus}>
              <div className="admin-stat-top"><span>{currentStatus.toLowerCase()} attempts</span><CircleDollarSign size={16} aria-hidden="true" /></div>
              <strong>{adminNumber(counts.get(currentStatus) ?? 0)}</strong>
              <small>{from || to ? "In selected dates" : "All time"}</small>
            </article>
          ))}
        </section>
      </section>
      <section className="admin-panel">
        <form className="admin-audit-filters admin-payment-filters" onSubmit={submit}>
          <label><span>Find a customer</span><input name="q" defaultValue={q} placeholder="Name or email" /></label>
          <label><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="SUCCEEDED">Succeeded</option><option value="PENDING">Pending</option><option value="EXPIRED">Expired</option></select></label>
          <label><span>Plan</span><select name="plan" defaultValue={plan}><option value="">All plans</option><option value="FREE">Free</option><option value="PRO">Pro</option><option value="BUSINESS">Business</option></select></label>
          <label><span>From (UTC)</span><input type="date" name="from" defaultValue={from} /></label>
          <label><span>Through (UTC)</span><input type="date" name="to" defaultValue={to} /></label>
          <button className="admin-button admin-button-primary" type="submit"><Search size={14} />Apply filters</button>
        </form>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">PAYMENT ATTEMPTS</span><h2>{adminNumber(result.page.totalItems)} records</h2></div><span className="admin-readonly-chip">Read only · provider actions are not available</span></div>
        {result.items.length === 0 ? (
          <div className="admin-empty-state"><CircleDollarSign size={20} /><strong>No payment attempts match</strong><span>Try another customer, status, plan, or date range.</span></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Customer</th><th>Amount</th><th>Plan</th><th>Status</th><th>Created</th><th>Paid</th><th>Checkout reference</th></tr></thead>
              <tbody>{result.items.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.user.name}</strong><small>{payment.user.email}</small></td>
                  <td><strong>{adminCurrency(payment.amountMinor, payment.currency)}</strong></td>
                  <td><span className={`admin-plan-badge admin-plan-badge-${payment.plan.toLowerCase()}`}>{payment.plan}</span></td>
                  <td><span className={`admin-account-status${payment.status === "SUCCEEDED" ? " is-active" : payment.status === "EXPIRED" ? " is-suspended" : ""}`}>{payment.status.toLowerCase()}</span></td>
                  <td>{adminDate(payment.createdAt)}</td>
                  <td>{adminDate(payment.paidAt)}</td>
                  <td><small>{payment.checkoutId ?? "Not assigned"}</small></td>
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

export default PaymentManagementPage;
