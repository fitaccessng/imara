import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import {
  AdminManagementError,
  AdminManagementHeader,
  AdminManagementLoading,
} from "./AdminManagementCommon";

type Plan = "FREE" | "PRO" | "BUSINESS";

interface PlanCatalogue {
  plan: Plan;
  name: string;
  currency: string;
  monthlyPriceMinor: string;
  limits: {
    staffLimit: number;
    activeEventLimit: number;
    storageLimitBytes: string;
  };
  features: {
    canEditDocuments: boolean;
    canScanDocuments: boolean;
    advancedTeamManagement: boolean;
  };
  updatedAt?: string;
}

interface PlanFormValues {
  staffLimit: string;
  activeEventLimit: string;
  storageLimitBytes: string;
  monthlyPrice: string;
  canEditDocuments: boolean;
  canScanDocuments: boolean;
  advancedTeamManagement: boolean;
}

function priceInMajorUnits(minor: string) {
  const amount = BigInt(minor);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

function priceInMinorUnits(major: string) {
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(major)) return null;
  const [whole, fraction = ""] = major.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

function PlanEditor({ catalogue }: { catalogue: PlanCatalogue }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<PlanFormValues>({
    staffLimit: String(catalogue.limits.staffLimit),
    activeEventLimit: String(catalogue.limits.activeEventLimit),
    storageLimitBytes: catalogue.limits.storageLimitBytes,
    monthlyPrice: priceInMajorUnits(catalogue.monthlyPriceMinor),
    ...catalogue.features,
  });
  const [notice, setNotice] = useState("");
  const [validationError, setValidationError] = useState("");
  const update = useMutation({
    mutationFn: (body: {
      staffLimit: number;
      activeEventLimit: number;
      storageLimitBytes: string;
      monthlyPriceMinor: string;
      canEditDocuments: boolean;
      canScanDocuments: boolean;
      advancedTeamManagement: boolean;
    }) => apiRequest<PlanCatalogue>(`/admin/plans/${catalogue.plan}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    onSuccess: async () => {
      const storageChanged = values.storageLimitBytes !== catalogue.limits.storageLimitBytes;
      setNotice(storageChanged
        ? `${catalogue.name} plan saved. Its storage allowance was synchronized to existing subscriptions.`
        : `${catalogue.name} plan saved.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-plan-catalogue"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["plan-catalogue"] }),
      ]);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setValidationError("");
    update.reset();
    const monthlyPriceMinor = priceInMinorUnits(values.monthlyPrice);
    const staffLimit = Number(values.staffLimit);
    const activeEventLimit = Number(values.activeEventLimit);
    if (
      monthlyPriceMinor === null
      || !/^(0|[1-9]\d*)$/.test(values.storageLimitBytes)
      || !Number.isInteger(staffLimit)
      || staffLimit < 0
      || staffLimit > 1_000_000
      || !Number.isInteger(activeEventLimit)
      || activeEventLimit < 0
      || activeEventLimit > 1_000_000
    ) {
      setValidationError("Enter whole-number limits and a non-negative price with up to two decimal places.");
      return;
    }
    update.mutate({
      staffLimit,
      activeEventLimit,
      storageLimitBytes: values.storageLimitBytes,
      monthlyPriceMinor,
      canEditDocuments: values.canEditDocuments,
      canScanDocuments: values.canScanDocuments,
      advancedTeamManagement: values.advancedTeamManagement,
    });
  }

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setNotice("");
    setValidationError("");
    update.reset();
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div><span className="admin-eyebrow">{catalogue.plan} PLAN</span><h2>{catalogue.name}</h2></div>
        <span className="admin-plan-badge">{catalogue.currency} billing</span>
      </div>
      <form className="admin-audit-filters admin-plan-editor" onSubmit={submit}>
        <label><span>Monthly price ({catalogue.currency})</span><input inputMode="decimal" value={values.monthlyPrice} onChange={(event) => set("monthlyPrice", event.target.value)} required /></label>
        <label><span>Staff limit</span><input type="number" min="0" max="1000000" value={values.staffLimit} onChange={(event) => set("staffLimit", event.target.value)} required /></label>
        <label><span>Active event limit</span><input type="number" min="0" max="1000000" value={values.activeEventLimit} onChange={(event) => set("activeEventLimit", event.target.value)} required /></label>
        <label><span>Storage limit (bytes)</span><input inputMode="numeric" pattern="[0-9]+" value={values.storageLimitBytes} onChange={(event) => set("storageLimitBytes", event.target.value)} required /></label>
        <fieldset className="admin-plan-feature-list">
          <legend>Included capabilities</legend>
          <label><input type="checkbox" checked={values.canEditDocuments} onChange={(event) => set("canEditDocuments", event.target.checked)} /> Edit documents</label>
          <label><input type="checkbox" checked={values.canScanDocuments} onChange={(event) => set("canScanDocuments", event.target.checked)} /> Scan documents</label>
          <label><input type="checkbox" checked={values.advancedTeamManagement} onChange={(event) => set("advancedTeamManagement", event.target.checked)} /> Advanced team management</label>
        </fieldset>
        {notice && <p className="admin-action-notice" role="status"><Check size={14} />{notice}</p>}
        {validationError && <p className="admin-action-error" role="alert">{validationError}</p>}
        {update.isError && <p className="admin-action-error" role="alert">{update.error.message}</p>}
        <div className="admin-form-actions">
          <button className="admin-button admin-button-primary" type="submit" disabled={update.isPending}>
            <Save size={14} />{update.isPending ? "Saving…" : "Save plan"}
          </button>
        </div>
      </form>
      <p className="admin-panel-note">Price is entered in major currency units. Saving the storage limit also updates current subscriptions and owned workspace allowances.</p>
    </section>
  );
}

export function PlanManagementPage() {
  const query = useQuery({
    queryKey: ["admin-plan-catalogue"],
    queryFn: () => apiRequest<{ plans: PlanCatalogue[] }>("/admin/plans"),
  });

  if (query.isPending) return <AdminManagementLoading label="Loading plan catalogue…" />;
  if (query.isError) return <AdminManagementError title="Plan catalogue could not load" error={query.error} retry={() => void query.refetch()} />;

  return (
    <div className="admin-page-content">
      <AdminManagementHeader
        eyebrow="BILLING · CATALOGUE"
        title="Plan management"
        description="Edit published plan prices, entitlements, and limits. Catalogue changes are audited before they are returned."
      />
      <div className="admin-management-grid">
        {query.data.plans.map((plan) => <PlanEditor key={plan.plan} catalogue={plan} />)}
      </div>
    </div>
  );
}

export default PlanManagementPage;
