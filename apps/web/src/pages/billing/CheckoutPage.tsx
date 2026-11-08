import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { PageShell } from "../PageShell";

type PlanPrice = {
  plan: "FREE" | "PRO" | "BUSINESS";
  name: string;
  currency: string;
  monthlyPriceMinor: string;
};

function formatPrice(plan: PlanPrice): string {
  const minor = BigInt(plan.monthlyPriceMinor);
  const whole = minor / 100n;
  const cents = minor % 100n;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: cents === 0n ? 0 : 2,
    maximumFractionDigits: cents === 0n ? 0 : 2,
  }).format(Number(whole) + Number(cents) / 100);
}

export function CheckoutPage() {
  const [params] = useSearchParams();
  const selectedPlan = params.get("plan");
  const cancelled = params.get("cancelled") === "1";
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const catalogueQuery = useQuery({
    queryKey: ["plan-catalogue"],
    queryFn: () => apiRequest<{ plans: PlanPrice[] }>("/plans"),
  });

  if (selectedPlan !== "PRO" && selectedPlan !== "BUSINESS") {
    return <Navigate to="/pricing" replace />;
  }
  const plan = catalogueQuery.data?.plans.find((item) => item.plan === selectedPlan);

  async function startCheckout() {
    setError("");
    setIsStarting(true);
    try {
      const result = await apiRequest<{ checkoutUrl: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: selectedPlan }),
      });
      window.location.assign(result.checkoutUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start checkout.");
      setIsStarting(false);
    }
  }

  return (
    <PageShell
      eyebrow="Secure checkout"
      title={`Choose ${selectedPlan === "PRO" ? "Pro" : "Business"}`}
      description="Pay securely through Bachs hosted checkout."
    >
      <section className="mx-auto max-w-xl rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm sm:p-8">
        {cancelled && (
          <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            Checkout was cancelled. No payment was taken.
          </p>
        )}
        {catalogueQuery.isLoading ? (
          <p role="status">Loading current price…</p>
        ) : catalogueQuery.isError || !plan ? (
          <p className="text-sm text-red-600" role="alert">Plan details couldn’t load. Please try again shortly.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-[#EDF0F3] pb-5">
              <div>
                <h2 className="text-xl font-bold text-[#102B46]">{plan.name}</h2>
                <p className="mt-1 text-sm text-[#718096]">One month of access · manual renewal</p>
              </div>
              <strong className="text-xl text-[#102B46]">{formatPrice(plan)}</strong>
            </div>
            <p className="mt-5 text-sm leading-6 text-[#718096]">
              Your plan activates after Bachs confirms the payment. It won’t renew automatically.
              Renew before the end date to keep these features.
            </p>
            {error && <p className="mt-5 text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={isStarting}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#20AD43] px-5 text-sm font-bold text-white transition hover:bg-[#199438] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStarting ? "Opening secure checkout…" : `Continue to pay ${formatPrice(plan)}`}
            </button>
          </>
        )}
        <Link to="/pricing" className="mt-5 block text-center text-sm font-semibold text-[#168D34]">
          Back to plans
        </Link>
      </section>
    </PageShell>
  );
}

export default CheckoutPage;
