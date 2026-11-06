import { useState, type FormEvent } from "react";
import { X } from "lucide-react";

export interface ActionModalRequest {
  title: string;
  description: string;
  confirmLabel: string;
  inputLabel?: string;
  initialValue?: string;
  danger?: boolean;
  onConfirm: (value: string) => Promise<void>;
}

export function ActionModal({ request, onClose }: { request: ActionModalRequest; onClose: () => void }) {
  const [value, setValue] = useState(request.initialValue ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await request.onConfirm(value.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="folder-move-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <section className="folder-move-dialog action-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title">
        <div className="folder-move-heading">
          <div><span className="eyebrow">CONFIRM ACTION</span><h2 id="action-modal-title">{request.title}</h2></div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={pending}><X size={18} /></button>
        </div>
        <p>{request.description}</p>
        <form onSubmit={(event) => void submit(event)}>
          {request.inputLabel && <label className="field" htmlFor="action-modal-value">{request.inputLabel}</label>}
          {request.inputLabel && <input
            id="action-modal-value"
            className="folder-dialog-input"
            autoFocus
            maxLength={255}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="folder-move-actions">
            <button className="button button-outline" type="button" onClick={onClose} disabled={pending}>Cancel</button>
            <button className={`button ${request.danger ? "button-danger" : "button-green"}`} type="submit" disabled={pending || (Boolean(request.inputLabel) && !value.trim())}>
              {pending ? "Please wait…" : request.confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
