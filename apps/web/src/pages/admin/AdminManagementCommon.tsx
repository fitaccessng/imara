import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { ApiError } from "../../lib/api";

export interface AdminPageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function AdminManagementHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function AdminManagementLoading({ label }: { label: string }) {
  return <div className="admin-page-loading"><span className="loader" />{label}</div>;
}

export function AdminManagementError({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry: () => void;
}) {
  const message = error instanceof Error ? error.message : "Please try again shortly.";
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <section className="admin-state-card" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div><h2>{title}</h2><p>{message}</p></div>
      {!forbidden && <button className="admin-button admin-button-secondary" type="button" onClick={retry}>Try again</button>}
    </section>
  );
}

export function AdminManagementPagination({
  page,
  onChange,
}: {
  page: AdminPageMetadata;
  onChange: (page: number) => void;
}) {
  const firstItem = page.totalItems === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastItem = Math.min(page.page * page.pageSize, page.totalItems);
  return (
    <div className="admin-pagination">
      <span>Showing {firstItem}–{lastItem} of {page.totalItems}</span>
      <div>
        <button className="admin-button admin-button-secondary" type="button" disabled={page.page <= 1} onClick={() => onChange(page.page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
        <span>Page {page.page} of {Math.max(page.totalPages, 1)}</span>
        <button className="admin-button admin-button-secondary" type="button" disabled={page.page >= page.totalPages} onClick={() => onChange(page.page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export function adminDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function adminNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function adminCurrency(amountMinor: string, currency: string) {
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d+$/.test(amountMinor)) {
    return `${currency} ${amountMinor}`;
  }
  const minor = BigInt(amountMinor);
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  const major = formatter.format(minor / 100n);
  return `${major}.${(minor % 100n).toString().padStart(2, "0")}`;
}
