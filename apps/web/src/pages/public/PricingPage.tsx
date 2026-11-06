import { Link } from "react-router-dom";
import { PageShell } from "../PageShell";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "A secure place to store and organise your personal files.",
    storage: "5 GiB storage",
    cta: "Create free account",
    href: "/register",
    featured: false,
    features: [
      "Private personal workspace",
      "Upload and download files",
      "Organise files in folders",
      "See storage usage and availability",
    ],
  },
  {
    name: "Pro",
    price: "Coming soon",
    description: "Paid plans and billing are not available yet.",
    storage: "Details coming soon",
    cta: "View your subscription",
    href: "/settings/subscription",
    featured: false,
    features: [
      "Plan options will be announced here",
    ],
  },
];

export function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="Simple plans for every stage"
      description="Choose a plan that matches how you store, organise, and share your digital life."
    >
      <div style={{ display: "grid", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                border: plan.featured ? "1px solid #20AD43" : "1px solid #E5EAF0",
                borderRadius: 20,
                background: plan.featured ? "linear-gradient(180deg, #F3FFF5 0%, #FFFFFF 100%)" : "#FFFFFF",
                padding: 24,
                boxShadow: plan.featured ? "0 18px 40px rgba(32, 173, 67, 0.12)" : "0 12px 24px rgba(10, 24, 43, 0.04)",
                display: "grid",
                gap: 18,
              }}
            >
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#102B46" }}>{plan.name}</span>
                  {plan.featured && (
                    <span
                      style={{
                        background: "#E7F9EC",
                        color: "#168B36",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "6px 10px",
                      }}
                    >
                      Popular
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#102B46", lineHeight: 1.1 }}>{plan.price}</div>
                <div style={{ fontSize: 13, color: "#718096" }}>{plan.description}</div>
              </div>

              <div style={{ borderTop: "1px solid #E5EAF0", paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#20AD43", letterSpacing: 0.4, textTransform: "uppercase" }}>Included</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#102B46" }}>{plan.storage}</div>
                  {plan.features.map((feature) => (
                    <div key={feature} style={{ display: "flex", alignItems: "center", gap: 8, color: "#374151", fontSize: 14 }}>
                      <span aria-hidden="true" style={{ color: "#20AD43", fontWeight: 700 }}>✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                to={plan.href}
                style={{
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: 46,
                  borderRadius: 12,
                  background: plan.featured ? "#20AD43" : "#EAF7EE",
                  color: plan.featured ? "#FFFFFF" : "#168B36",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div style={{ background: "#F7F9FC", border: "1px solid #E5EAF0", borderRadius: 18, padding: 20, color: "#374151" }}>
          <strong style={{ color: "#102B46" }}>Paid plans are coming soon</strong>
          <p style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
            The Free plan includes 5 GiB of personal storage. Upgrade options and payment processing are not available yet.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

export default PricingPage;
