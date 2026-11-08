import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

type PaymentStatus = {
  plan: "PRO" | "BUSINESS";
  status: "PENDING" | "SUCCEEDED" | "EXPIRED";
  paidAt: string | null;
  periodEnd: string | null;
};

export function PaymentStatusPage() {
  const [params] = useSearchParams();
  const checkoutId = params.get("checkout_id");
  const paymentQuery = useQuery({
    queryKey: ["payment-status", checkoutId],
    queryFn: () => apiRequest<PaymentStatus>(`/billing/payments/${encodeURIComponent(checkoutId ?? "")}`),
    enabled: Boolean(checkoutId),
    refetchInterval: (query) => query.state.data?.status === "PENDING" ? 2_000 : false,
  });
  const payment = paymentQuery.data;

  return (
    <PageShell eyebrow="Payment status" title="Your plan payment" description="We confirm plan access directly with Bachs.">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm sm:p-8">
        {!checkoutId ? (
          <p className="text-sm text-[#718096]">No checkout reference was provided.</p>
        ) : paymentQuery.isLoading ? (
          <p role="status">Checking your payment…</p>
        ) : paymentQuery.isError ? (
          <p className="text-sm text-red-600" role="alert">
            Payment status couldn’t be loaded. Your access changes only after confirmation; refresh to check again.
          </p>
        ) : payment?.status === "PENDING" ? (
          <>
            <h2 className="text-lg font-bold text-[#102B46]">Payment is being confirmed</h2>
            <p className="mt-2 text-sm leading-6 text-[#718096]">
              This page will update automatically when Bachs confirms the payment.
            </p>
          </>
        ) : payment?.status === "SUCCEEDED" ? (
          <>
            <h2 className="text-lg font-bold text-[#168D34]">Payment confirmed</h2>
            <p className="mt-2 text-sm leading-6 text-[#718096]">
              Your {payment.plan.toLowerCase()} plan is active
              {payment.periodEnd ? ` until ${new Date(payment.periodEnd).toLocaleDateString()}` : ""}.
              It won’t renew automatically.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-[#102B46]">Checkout expired</h2>
            <p className="mt-2 text-sm leading-6 text-[#718096]">No plan access was added. You can start another checkout.</p>
          </>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {payment?.status === "SUCCEEDED" ? (
            <Link to="/settings/subscription" className="button button-dark">View subscription</Link>
          ) : (
            <Link to={`/billing/checkout?plan=${payment?.plan ?? "PRO"}`} className="button button-dark">Try checkout again</Link>
          )}
          <Link to="/pricing" className="button button-outline">Compare plans</Link>
        </div>
      </section>
    </PageShell>
  );
}

export default PaymentStatusPage;
