import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileSignature, PenLine, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { apiBlob, apiRequest, downloadFile } from "../lib/api";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";

type SignatureSource = { id: string; name: string; sizeBytes: string; folderId: string | null };
type SignatureMember = { id: string; name: string; email: string; emailVerified: boolean; role: string };
type Signer = {
  id: string;
  memberId: string;
  userId: string;
  name: string;
  email: string;
  order: number;
  status: "PENDING" | "SIGNED" | "DECLINED";
  method: "TYPED" | "DRAWN" | null;
  signedName: string | null;
  signedAt: string | null;
  consentedAt: string | null;
  declineReason: string | null;
};
type SignatureRequest = {
  id: string;
  sourceFileId: string;
  sourceName: string;
  mode: "SEQUENTIAL" | "PARALLEL";
  status: "PENDING" | "FINALIZING" | "COMPLETED" | "DECLINED" | "CANCELLED";
  createdById: string;
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
  finalFile: { id: string; originalName: string } | null;
  signers: Signer[];
};
const consentCopy = "I knowingly adopt this electronic mark as my signature for this document and consent to electronic records and signatures.";

function SignatureCanvas({ onChange }: { onChange: (value: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }
  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    const position = point(event);
    if (!canvas || !position) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    if (context) {
      context.beginPath();
      context.moveTo(position.x, position.y);
    }
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const position = point(event);
    const context = ref.current?.getContext("2d");
    if (!position || !context || !ref.current) return;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#183e33";
    context.lineTo(position.x, position.y);
    context.stroke();
    onChange(ref.current.toDataURL("image/png"));
  }
  function stop() {
    drawing.current = false;
  }
  function clear() {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }
  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={150}
        aria-label="Draw your signature"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        style={{ width: "100%", height: 150, border: "1px solid #cbd5d0", borderRadius: 8, touchAction: "none", background: "#fff" }}
      />
      <button type="button" className="button button-light" onClick={clear}>Clear drawing</button>
    </div>
  );
}

function DocumentPreview({ workspaceId, requestId }: { workspaceId: string; requestId: string }) {
  const file = useQuery({
    queryKey: ["signature-pdf-preview", workspaceId, requestId],
    queryFn: () => apiBlob(`/workspaces/${workspaceId}/signatures/${requestId}/document`),
  });
  const url = useMemo(() => file.data ? URL.createObjectURL(file.data) : "", [file.data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (file.isLoading) return <p>Loading preserved PDF…</p>;
  if (file.error) return <p role="alert">{file.error instanceof Error ? file.error.message : "Unable to open the PDF."}</p>;
  return <iframe title="PDF awaiting signature" src={url} style={{ width: "100%", height: 460, border: "1px solid #d5ddd8", borderRadius: 8 }} />;
}

export function SignaturesPage() {
  const { user } = useAuth();
  const { workspace, workspacesQuery } = useWorkspaceScope();
  const queryClient = useQueryClient();
  const workspaceId = workspace?.id ?? "";
  const [selectedId, setSelectedId] = useState("");
  const [sourceFileId, setSourceFileId] = useState("");
  const [signerIds, setSignerIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"SEQUENTIAL" | "PARALLEL">("SEQUENTIAL");
  const [dueAt, setDueAt] = useState("");
  const [method, setMethod] = useState<"TYPED" | "DRAWN">("TYPED");
  const [typedName, setTypedName] = useState(user?.name ?? "");
  const [signaturePng, setSignaturePng] = useState("");
  const [consent, setConsent] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [error, setError] = useState("");

  const requests = useQuery({
    queryKey: ["workspace-signatures", workspaceId],
    queryFn: () => apiRequest<SignatureRequest[]>(`/workspaces/${workspaceId}/signatures`),
    enabled: Boolean(workspaceId),
  });
  const sources = useQuery({
    queryKey: ["signature-sources", workspaceId],
    queryFn: () => apiRequest<SignatureSource[]>(`/workspaces/${workspaceId}/signatures/sources`),
    enabled: Boolean(workspaceId),
  });
  const members = useQuery({
    queryKey: ["signature-members", workspaceId],
    queryFn: () => apiRequest<SignatureMember[]>(`/workspaces/${workspaceId}/signatures/members`),
    enabled: Boolean(workspaceId),
  });
  const createRequest = useMutation({
    mutationFn: () => apiRequest<SignatureRequest>(`/workspaces/${workspaceId}/signatures`, {
      method: "POST",
      body: JSON.stringify({ sourceFileId, signerMemberIds: signerIds, mode, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) }),
    }),
    onSuccess: async (created) => {
      setSelectedId(created.id);
      setSourceFileId("");
      setSignerIds([]);
      setDueAt("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-signatures", workspaceId] });
    },
  });
  const activeRequest = (requests.data ?? []).find((item) => item.id === selectedId) ?? null;
  const signRequest = useMutation({
    mutationFn: () => apiRequest<SignatureRequest>(`/workspaces/${workspaceId}/signatures/${selectedId}/sign`, {
      method: "POST",
      body: JSON.stringify({
        consent,
        method,
        ...(method === "TYPED" ? { signedName: typedName } : { signaturePng }),
      }),
    }),
    onSuccess: async (updated) => {
      setConsent(false);
      setSignaturePng("");
      setSelectedId(updated.id);
      await queryClient.invalidateQueries({ queryKey: ["workspace-signatures", workspaceId] });
    },
  });
  const declineRequest = useMutation({
    mutationFn: () => apiRequest<SignatureRequest>(`/workspaces/${workspaceId}/signatures/${selectedId}/decline`, {
      method: "POST", body: JSON.stringify({ declineReason }),
    }),
    onSuccess: async () => {
      setDeclineReason("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-signatures", workspaceId] });
    },
  });
  const cancelRequest = useMutation({
    mutationFn: () => apiRequest<SignatureRequest>(`/workspaces/${workspaceId}/signatures/${selectedId}/cancel`, { method: "POST" }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["workspace-signatures", workspaceId] }),
  });

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { await createRequest.mutateAsync(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create the request."); }
  }
  async function submitSign() {
    setError("");
    try { await signRequest.mutateAsync(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to apply your signature."); }
  }
  async function perform(action: () => Promise<unknown>) {
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the request."); }
  }
  function toggleMember(id: string) {
    setSignerIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  if (workspacesQuery.isLoading) return <main className="page-content"><p>Loading workspace…</p></main>;
  if (!workspace) return <main className="page-content"><section className="panel"><h1>Electronic signatures</h1><p>Create a workspace to request document signatures.</p></section></main>;

  const request = activeRequest;
  const currentUserSigner = request?.signers.find((signer) => signer.userId === user?.id);
  const nextSigner = request?.signers.find((signer) => signer.status === "PENDING");
  const canSign = Boolean(request && request.status === "PENDING" && currentUserSigner?.status === "PENDING"
    && (request.mode === "PARALLEL" || nextSigner?.id === currentUserSigner.id));
  const canCancel = Boolean(request && request.status === "PENDING"
    && (request.createdById === user?.id || workspace.role === "OWNER" || workspace.role === "ADMIN"));

  return (
    <main className="page-content">
      <div className="page-heading">
        <div><span className="eyebrow">Workspace workflow</span><h1>Electronic signatures</h1>
          <p>Request and apply consent-based signatures to preserved PDF copies.</p></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <section className="panel">
          <h2 className="flex items-center gap-2"><FileSignature size={19} /> New signature request</h2>
          <p>Select a PDF from workspace storage and active participants to sign.</p>
          <form onSubmit={(event) => void submitCreate(event)} className="space-y-4">
            <label className="form-field"><span>Workspace PDF</span>
              <select value={sourceFileId} onChange={(event) => setSourceFileId(event.target.value)} required>
                <option value="">Choose an accessible PDF</option>
                {(sources.data ?? []).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend>Active signers</legend>
              {(members.data ?? []).map((member) => <label key={member.id} className="flex items-center gap-2">
                <input type="checkbox" checked={signerIds.includes(member.id)} disabled={!member.emailVerified} onChange={() => toggleMember(member.id)} />
                <span>{member.name} <small>{member.email}{member.emailVerified ? "" : " · verify email before signing"}</small></span>
              </label>)}
              {!members.data?.length && <p>No active participants were found.</p>}
            </fieldset>
            <label className="form-field"><span>Signing order</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="SEQUENTIAL">Sequential — selected order</option>
                <option value="PARALLEL">Parallel — any order</option>
              </select>
            </label>
            <label className="form-field"><span>Due date <small>Optional · in-app reminders go to pending signers</small></span>
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            {error && <p role="alert" className="text-red-700">{error}</p>}
            <button className="button button-green" disabled={!sourceFileId || signerIds.length === 0 || createRequest.isPending}>
              {createRequest.isPending ? "Creating…" : "Create request"}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Inbox & request history</h2>
          {requests.isLoading && <p>Loading signature requests…</p>}
          {requests.error && <p role="alert">{requests.error.message}</p>}
          {!requests.isLoading && !requests.data?.length && <p>No signature requests in this workspace yet.</p>}
          <div className="space-y-2">
            {(requests.data ?? []).map((item) => (
              <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setError(""); }}
                className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <span className="flex items-center justify-between gap-2"><strong>{item.sourceName}</strong><small>{item.status.toLowerCase()}</small></span>
                <small>{item.mode.toLowerCase()} · {item.signers.filter((signer) => signer.status === "SIGNED").length}/{item.signers.length} signed{item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleDateString()}` : ""}</small>
              </button>
            ))}
          </div>
        </section>
      </div>

      {request && <section className="panel mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><span className="eyebrow">Signature request</span><h2>{request.sourceName}</h2>
            <p>{request.mode === "SEQUENTIAL" ? "Sequential" : "Parallel"} signing · {request.status.toLowerCase()}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="button button-light" onClick={() => void perform(() => downloadFile(
              `/workspaces/${workspaceId}/signatures/${request.id}/document`, request.sourceName,
            ))}><Download size={15} /> Review PDF</button>
            {request.finalFile && <button className="button button-green" onClick={() => void perform(() => downloadFile(
              `/workspaces/${workspaceId}/signatures/${request.id}/final`, request.finalFile!.originalName,
            ))}><Download size={15} /> Download signed copy</button>}
            {canCancel && <button className="button button-light" onClick={() => void perform(() => cancelRequest.mutateAsync())}><X size={15} /> Cancel request</button>}
          </div>
        </div>
        <div className="my-4 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <DocumentPreview workspaceId={workspaceId} requestId={request.id} />
          <div className="space-y-4">
            <ol className="space-y-2">
              {request.signers.map((signer) => <li key={signer.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2"><strong>{signer.order + 1}. {signer.name}</strong>
                  <span>{signer.status === "SIGNED" ? <Check size={16} aria-label="Signed" /> : signer.status.toLowerCase()}</span></div>
                <small>{signer.email}{signer.signedAt ? ` · ${new Date(signer.signedAt).toLocaleString()}` : ""}</small>
                {signer.declineReason && <p>{signer.declineReason}</p>}
                {request.mode === "SEQUENTIAL" && signer.status === "PENDING" && nextSigner?.id !== signer.id && <p>Waiting for earlier signer.</p>}
              </li>)}
            </ol>
            {canSign && <div className="rounded-lg bg-emerald-50 p-4">
              <h3 className="flex items-center gap-2"><PenLine size={17} /> Apply your signature</h3>
              {!user?.emailVerified && <p role="alert">Verify your account email before you sign.</p>}
              <label className="form-field"><span>Signature style</span>
                <select value={method} onChange={(event) => { setMethod(event.target.value as typeof method); setSignaturePng(""); }}>
                  <option value="TYPED">Type my account name</option><option value="DRAWN">Draw my signature</option>
                </select>
              </label>
              {method === "TYPED"
                ? <label className="form-field"><span>Type your account name</span><input value={typedName} onChange={(event) => setTypedName(event.target.value)} maxLength={120} /></label>
                : <SignatureCanvas onChange={setSignaturePng} />}
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{consentCopy}</span>
              </label>
              <button className="button button-green mt-3" disabled={!user?.emailVerified || !consent || signRequest.isPending
                || (method === "TYPED" ? !typedName.trim() : !signaturePng)} onClick={() => void submitSign()}>
                <ShieldCheck size={16} /> {signRequest.isPending ? "Signing…" : "Consent and sign"}
              </button>
              {currentUserSigner?.status === "PENDING" && <div className="mt-4 border-t border-emerald-200 pt-3">
                <label className="form-field"><span>Optional reason to decline</span><input value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={1000} /></label>
                <button className="button button-light" onClick={() => void perform(() => declineRequest.mutateAsync())}>Decline request</button>
              </div>}
            </div>}
            {request.status === "COMPLETED" && <p className="flex items-center gap-2"><Check size={17} /> All signatures are complete. A signed PDF copy is available in workspace storage.</p>}
            {error && <p role="alert" className="text-red-700">{error}</p>}
          </div>
        </div>
        <small>Electronic signatures are recorded with consent and an audit trail. This workflow does not claim qualified electronic-signature or legal status.</small>
      </section>}
    </main>
  );
}
