import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { apiRequest, downloadFile } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { roleLabel } from "../workspaces/types";
import type { WorkspaceFolder, WorkspaceMember, WorkspaceFile } from "../workspaces/types";
import { useWorkspaceScope } from "../workspaces/useWorkspaceScope";
import { WorkspaceSetupPrompt } from "../workspaces/WorkspaceSetupPrompt";
import "./approvals.css";

type ReviewMode = "SEQUENTIAL" | "PARALLEL";
type RequestStatus = "IN_PROGRESS" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";
type Decision = "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
type RequestView = "mine" | "pending" | "history";
type ApprovalMember = {
  id: string;
  displayName: string | null;
  role: WorkspaceMember["role"];
  user: { id: string; name: string };
};

interface TemplateStage {
  id: string;
  stepOrder: number;
  mode: ReviewMode;
  approvers: Array<{ memberId: string; member: ApprovalMember }>;
}

interface ApprovalTemplate {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: TemplateStage[];
}

interface ApprovalRequest {
  id: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  currentStepOrder: number;
  dueAt: string | null;
  createdAt: string;
  requesterId: string | null;
  requester: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  steps: Array<{
    id: string;
    stepOrder: number;
    mode: ReviewMode;
    isComplete: boolean;
    approvers: Array<{
      id: string;
      memberId: string;
      decision: Decision;
      decidedAt: string | null;
      member: ApprovalMember;
    }>;
  }>;
  attachments: Array<{
    id: string;
    fileId: string | null;
    fileName: string;
    file: { id: string; status: string; deletedAt: string | null } | null;
  }>;
  activities?: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
    actor: { id: string; name: string } | null;
  }>;
}

interface ApprovalFormStage {
  mode: ReviewMode;
  approverMemberIds: string[];
}

const viewLabels: Record<RequestView, string> = {
  mine: "My requests",
  pending: "Needs my review",
  history: "Completed",
};

const statusLabels: Record<RequestStatus, string> = {
  IN_PROGRESS: "In progress",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Declined",
  CANCELLED: "Cancelled",
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function memberName(member: Pick<WorkspaceMember, "displayName"> & { user: Pick<WorkspaceMember["user"], "id" | "name"> }) {
  return member.displayName?.trim() || member.user.name;
}

function RequestStatusChip({ status }: { status: RequestStatus }) {
  return <span className={`approval-status approval-status-${status.toLowerCase()}`}><i />{statusLabels[status]}</span>;
}

function WorkspacePlaceholder({ loading, error, retry }: { loading: boolean; error?: unknown; retry: () => void }) {
  if (loading) return <div className="page-loading"><span className="loader" />Loading business workspaces…</div>;
  if (error) return (
    <div className="inline-error" role="alert">
      <div><strong>Workspaces couldn’t load.</strong><p>{error instanceof Error ? error.message : "Please try again."}</p></div>
      <button className="button button-outline button-small" onClick={retry}>Try again</button>
    </div>
  );
  return <WorkspaceSetupPrompt
    title="Better decisions start together."
    description="Create a business workspace to route approvals to the right people and keep every decision attached to a clear record."
  />;
}

export function ApprovalsPage() {
  const { workspacesQuery, workspace } = useWorkspaceScope();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<RequestView>("mine");
  const [selectedId, setSelectedId] = useState("");
  const [panel, setPanel] = useState<"request" | "template" | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestDueAt, setRequestDueAt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateStages, setTemplateStages] = useState<ApprovalFormStage[]>([
    { mode: "SEQUENTIAL", approverMemberIds: [] },
  ]);

  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: () => apiRequest<WorkspaceMember[]>(`/workspaces/${workspace?.id}/members`),
    enabled: Boolean(workspace),
  });
  const templatesQuery = useQuery({
    queryKey: ["approval-templates", workspace?.id],
    queryFn: () => apiRequest<ApprovalTemplate[]>(`/workspaces/${workspace?.id}/approvals/templates`),
    enabled: Boolean(workspace),
  });
  const requestsQuery = useQuery({
    queryKey: ["approval-requests", workspace?.id, view],
    queryFn: () => apiRequest<ApprovalRequest[]>(`/workspaces/${workspace?.id}/approvals?view=${view}`),
    enabled: Boolean(workspace),
  });
  const requestQuery = useQuery({
    queryKey: ["approval-request", workspace?.id, selectedId],
    queryFn: () => apiRequest<ApprovalRequest>(`/workspaces/${workspace?.id}/approvals/${selectedId}`),
    enabled: Boolean(workspace && selectedId),
  });
  const filesQuery = useQuery({
    queryKey: ["workspace-approval-files", workspace?.id],
    queryFn: () => apiRequest<{ files: WorkspaceFile[] }>(`/workspaces/${workspace?.id}/storage`),
    enabled: Boolean(workspace && panel === "request"),
  });
  const foldersQuery = useQuery({
    queryKey: ["workspace-approval-folders", workspace?.id],
    queryFn: () => apiRequest<WorkspaceFolder[]>(`/workspaces/${workspace?.id}/my-folders`),
    enabled: Boolean(workspace && panel === "request"),
  });
  const fileFolderQueries = useQueries({
    queries: (foldersQuery.data ?? [])
      .filter((folder) => folder.permissions?.includes("viewFiles") && folder.permissions.includes("downloadFiles"))
      .map((folder) => ({
        queryKey: ["workspace-approval-files", workspace?.id, folder.id],
        queryFn: () => apiRequest<{ files: WorkspaceFile[] }>(`/workspaces/${workspace?.id}/storage?folderId=${encodeURIComponent(folder.id)}`),
        enabled: Boolean(workspace && panel === "request"),
      })),
  });

  const activeMembers = useMemo(
    () => (membersQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [membersQuery.data],
  );
  const availableFiles = useMemo(() => {
    const files = [
      ...(filesQuery.data?.files ?? []),
      ...fileFolderQueries.flatMap((query) => query.data?.files ?? []),
    ];
    return [...new Map(files.map((file) => [file.id, file])).values()];
  }, [filesQuery.data, fileFolderQueries]);
  const activeTemplates = (templatesQuery.data ?? []).filter((template) => template.isActive);
  const currentUserId = user?.id;
  const requests = requestsQuery.data ?? [];
  const selectedRequest = requestQuery.data;
  const activeStep = selectedRequest?.steps.find((step) => step.stepOrder === selectedRequest.currentStepOrder);
  const assignedToMe = activeStep?.approvers.some((approver) =>
    approver.decision === "PENDING" && approver.member.user.id === currentUserId);
  const isOwner = workspace?.role === "OWNER";
  const isAdministrator = isOwner || workspace?.role === "ADMIN";

  async function refreshApprovals() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["approval-requests", workspace?.id] }),
      queryClient.invalidateQueries({ queryKey: ["approval-request", workspace?.id] }),
      queryClient.invalidateQueries({ queryKey: ["approval-templates", workspace?.id] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-notifications", workspace?.id] }),
    ]);
  }

  const createRequest = useMutation({
    mutationFn: () => apiRequest<ApprovalRequest>(`/workspaces/${workspace?.id}/approvals`, {
      method: "POST",
      body: JSON.stringify({
        templateId,
        title: requestTitle,
        ...(requestDescription.trim() ? { description: requestDescription.trim() } : {}),
        ...(requestDueAt ? { dueAt: new Date(requestDueAt).toISOString() } : {}),
        ...(attachmentIds.length ? { fileIds: attachmentIds } : {}),
      }),
    }),
    onSuccess: async (created) => {
      setPanel(null);
      setRequestTitle("");
      setRequestDescription("");
      setRequestDueAt("");
      setAttachmentIds([]);
      setError("");
      setSelectedId(created.id);
      await refreshApprovals();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to submit this request."),
  });
  const createTemplate = useMutation({
    mutationFn: () => apiRequest<ApprovalTemplate>(`/workspaces/${workspace?.id}/approvals/templates`, {
      method: "POST",
      body: JSON.stringify({
        name: templateName,
        ...(templateDescription.trim() ? { description: templateDescription.trim() } : {}),
        steps: templateStages,
      }),
    }),
    onSuccess: async () => {
      setPanel(null);
      setTemplateName("");
      setTemplateDescription("");
      setTemplateStages([{ mode: "SEQUENTIAL", approverMemberIds: [] }]);
      setError("");
      await refreshApprovals();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to save this workflow."),
  });
  const updateRequest = useMutation({
    mutationFn: ({ action, decision }: { action: "decision" | "resubmit" | "cancel" | "comments"; decision?: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED" }) =>
      apiRequest(`/workspaces/${workspace?.id}/approvals/${selectedId}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "decision" ? { decision, comment } : action === "resubmit" || action === "comments" ? { comment } : {}),
      }),
    onSuccess: async () => {
      setComment("");
      setError("");
      await refreshApprovals();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Unable to update this request."),
  });

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    createRequest.mutate();
  }

  function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    createTemplate.mutate();
  }

  function toggleApprover(stageIndex: number, memberId: string) {
    setTemplateStages((current) => current.map((stage, index) => {
      if (stageIndex !== index) return stage;
      const selected = stage.approverMemberIds.includes(memberId);
      const approverMemberIds = selected
        ? stage.approverMemberIds.filter((id) => id !== memberId)
        : stage.mode === "SEQUENTIAL" ? [memberId] : [...stage.approverMemberIds, memberId];
      return { ...stage, approverMemberIds };
    }));
  }

  function updateStageMode(stageIndex: number, mode: ReviewMode) {
    setTemplateStages((current) => current.map((stage, index) => index === stageIndex
      ? { ...stage, mode, approverMemberIds: mode === "SEQUENTIAL" ? stage.approverMemberIds.slice(0, 1) : stage.approverMemberIds }
      : stage));
  }

  async function downloadAttachment(fileId: string, fileName: string) {
    try {
      await downloadFile(`/workspaces/${workspace?.id}/files/${fileId}/download`, fileName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to download this attachment.");
    }
  }

  if (workspacesQuery.isLoading || workspacesQuery.isError || !workspace) {
    return <WorkspacePlaceholder loading={workspacesQuery.isLoading} error={workspacesQuery.error} retry={() => void workspacesQuery.refetch()} />;
  }

  return (
    <div className="approvals-page">

      <section className="approval-overview-strip" aria-label="Approval workspace overview">
        <div><span>ACTIVE TEAM</span><strong>{membersQuery.isLoading || membersQuery.isError ? "—" : activeMembers.length}</strong><small>Available to review</small></div>
        <div><span>WORKFLOWS</span><strong>{templatesQuery.isLoading || templatesQuery.isError ? "—" : activeTemplates.length}</strong><small>Reusable review paths</small></div>
        <div><span>{viewLabels[view].toUpperCase()}</span><strong>{requestsQuery.isLoading || requestsQuery.isError ? "—" : requests.length}</strong><small>Requests in this view</small></div>
      </section>

      <div className="approval-toolbar">
        <div>
          <span className="eyebrow">THE DECISION DESK</span>
          <h2>Approval workflows</h2>
        </div>
        <div className="approval-toolbar-actions">
          {isAdministrator && <button className="button button-outline button-small" onClick={() => { setError(""); setPanel(panel === "template" ? null : "template"); }}>
            <ShieldCheck size={15} /> Build a workflow
          </button>}
          <button className="button button-green button-small" onClick={() => { setError(""); setPanel(panel === "request" ? null : "request"); }}>
            <Plus size={15} /> New request
          </button>
        </div>
      </div>

      {error && <p className="form-alert approval-alert" role="alert"><CircleAlert size={15} />{error}</p>}
      {templatesQuery.isError && <p className="form-alert approval-alert" role="alert">Workflow templates couldn’t load. {templatesQuery.error instanceof Error ? templatesQuery.error.message : ""}</p>}
      {requestsQuery.isError && <p className="form-alert approval-alert" role="alert">Approval requests couldn’t load. {requestsQuery.error instanceof Error ? requestsQuery.error.message : ""}</p>}

      {panel === "template" && isAdministrator && (
        <form className="approval-builder" onSubmit={submitTemplate}>
          <div className="approval-builder-heading">
            <div><span className="eyebrow">WORKFLOW DESIGNER</span><h2>Create a reusable path</h2></div>
            <button type="button" className="icon-button" aria-label="Close workflow designer" onClick={() => setPanel(null)}><X size={17} /></button>
          </div>
          <div className="approval-form-grid">
            <label className="field"><span>Workflow name</span><input required maxLength={160} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. Purchase approval" /></label>
            <label className="field"><span>Purpose <small>Optional</small></span><input maxLength={2000} value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="What kind of request uses this route?" /></label>
          </div>
          <div className="approval-stages-heading"><div><span className="eyebrow">ROUTE</span><strong>Review stages</strong></div><span>{templateStages.length} stage{templateStages.length === 1 ? "" : "s"}</span></div>
          <div className="approval-stage-list">
            {templateStages.map((stage, index) => (
              <section className="approval-stage-card" key={`stage-${index}`}>
                <div className="approval-stage-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="approval-stage-body">
                  <div className="approval-stage-topline"><strong>{index === 0 ? "First review" : `Then, stage ${index + 1}`}</strong>
                    <label className="approval-mode-select"><span className="sr-only">Review mode</span>
                      <select value={stage.mode} onChange={(event) => updateStageMode(index, event.target.value === "PARALLEL" ? "PARALLEL" : "SEQUENTIAL")}>
                        <option value="SEQUENTIAL">One approver</option><option value="PARALLEL">Review together</option>
                      </select>
                    </label>
                    {templateStages.length > 1 && <button type="button" className="approval-remove-stage" onClick={() => setTemplateStages((all) => all.filter((_, position) => position !== index))}>Remove</button>}
                  </div>
                  <p>{stage.mode === "SEQUENTIAL" ? "Choose one member. Add another stage to create an ordered chain." : "All selected members review this request at the same time."}</p>
                  <div className="approval-member-options">
                    {activeMembers.map((member) => {
                      const checked = stage.approverMemberIds.includes(member.id);
                      return <label className={`approval-member-option ${checked ? "is-selected" : ""}`} key={member.id}>
                        <input type="checkbox" checked={checked} onChange={() => toggleApprover(index, member.id)} />
                        <span className="approval-member-avatar">{memberName(member).slice(0, 1).toUpperCase()}</span>
                        <span><strong>{memberName(member)}</strong><small>{roleLabel(member.role)}</small></span>
                        {checked && <Check size={15} />}
                      </label>;
                    })}
                    {membersQuery.isError
                      ? <p className="approval-muted">Workspace members couldn’t load. <button type="button" className="text-button" onClick={() => void membersQuery.refetch()}>Try again</button></p>
                      : !membersQuery.isLoading && activeMembers.length === 0 && <p className="approval-muted">No active members are available.</p>}
                  </div>
                </div>
              </section>
            ))}
          </div>
          <div className="approval-builder-footer">
            <button type="button" className="button button-outline button-small" disabled={templateStages.length >= 10} onClick={() => setTemplateStages((stages) => [...stages, { mode: "SEQUENTIAL", approverMemberIds: [] }])}><Plus size={14} /> Add stage</button>
            <button type="submit" className="button button-green button-small" disabled={createTemplate.isPending || activeMembers.length === 0}>{createTemplate.isPending ? "Saving…" : "Save workflow"}<ArrowRight size={14} /></button>
          </div>
        </form>
      )}

      {panel === "request" && (
        <form className="approval-request-form" onSubmit={submitRequest}>
          <div className="approval-builder-heading">
            <div><span className="eyebrow">NEW SUBMISSION</span><h2>Put a decision in motion</h2></div>
            <button type="button" className="icon-button" aria-label="Close request form" onClick={() => setPanel(null)}><X size={17} /></button>
          </div>
          {templatesQuery.isLoading ? <p className="approval-muted">Loading available workflows…</p> : activeTemplates.length === 0 ? (
            <div className="approval-no-template"><ShieldCheck size={18} /><div><strong>No active workflow yet</strong><p>A workspace administrator must create an approval workflow before requests can be submitted.</p></div></div>
          ) : <>
            <div className="approval-form-grid">
              <label className="field"><span>Request title</span><input required maxLength={200} value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} placeholder="What needs a decision?" /></label>
              <label className="field"><span>Workflow</span><select required value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Choose an approval path</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
              <label className="field approval-form-wide"><span>Context and supporting details <small>Optional</small></span><textarea rows={3} maxLength={5000} value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder="Give reviewers the context they need." /></label>
              <label className="field"><span>Decision deadline <small>Optional</small></span><input type="datetime-local" value={requestDueAt} onChange={(event) => setRequestDueAt(event.target.value)} /></label>
            </div>
            <section className="approval-attachment-picker">
              <div><span className="eyebrow">EVIDENCE</span><strong>Attach workspace files <small>Optional</small></strong></div>
              {filesQuery.isLoading || foldersQuery.isLoading || fileFolderQueries.some((query) => query.isLoading) ? <p className="approval-muted">Loading available files…</p>
                : filesQuery.isError || foldersQuery.isError || fileFolderQueries.some((query) => query.isError) ? <p className="approval-muted">Workspace files or folder access couldn’t load. <button type="button" className="text-button" onClick={() => {
                  void filesQuery.refetch();
                  void foldersQuery.refetch();
                  fileFolderQueries.forEach((query) => void query.refetch());
                }}>Try again</button></p>
                  : availableFiles.length ? <div className="approval-file-options">
                    {availableFiles.map((file) => <label key={file.id}>
                      <input type="checkbox" checked={attachmentIds.includes(file.id)} onChange={() => setAttachmentIds((ids) => ids.includes(file.id) ? ids.filter((id) => id !== file.id) : [...ids, file.id])} />
                      <FileText size={14} /><span>{file.name}</span>
                    </label>)}
                  </div> : <p className="approval-muted">No files are available in your workspace root. Files attached to a request must be accessible to every reviewer.</p>}
            </section>
            <div className="approval-builder-footer">
              <span className="approval-muted">Your request and reviewer assignments are recorded in the workspace audit trail.</span>
              <button type="submit" className="button button-green button-small" disabled={createRequest.isPending || !templateId}>{createRequest.isPending ? "Submitting…" : "Submit for approval"}<Send size={14} /></button>
            </div>
          </>}
        </form>
      )}

      <section className="approval-desk">
        <div className="approval-request-list">
          <div className="approval-view-tabs" role="tablist" aria-label="Approval request views">
            {(Object.keys(viewLabels) as RequestView[]).map((tab) => <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? "is-active" : ""} onClick={() => { setView(tab); setSelectedId(""); setError(""); }}>
              {viewLabels[tab]}{tab === "pending" && <span className="approval-tab-dot" />}
            </button>)}
          </div>
          {requestsQuery.isLoading ? <div className="page-loading"><span className="loader" />Loading requests…</div> : requests.length ? (
            <div className="approval-cards">
              {requests.map((request) => {
                const stage = request.steps.find((item) => item.stepOrder === request.currentStepOrder);
                const waitingCount = stage?.approvers.filter((approver) => approver.decision === "PENDING").length ?? 0;
                return <button className={`approval-request-card ${selectedId === request.id ? "is-selected" : ""}`} key={request.id} onClick={() => { setSelectedId(request.id); setComment(""); setError(""); }}>
                  <div className="approval-request-card-top"><span className="approval-request-date">{dateFormat.format(new Date(request.createdAt))}</span><RequestStatusChip status={request.status} /></div>
                  <strong>{request.title}</strong>
                  <span className="approval-request-template">{request.template?.name ?? "Approval workflow"}</span>
                  <div className="approval-request-card-bottom">
                    {request.status === "IN_PROGRESS" ? <span><Clock3 size={13} />{waitingCount} review{waitingCount === 1 ? "" : "s"} pending</span> : <span>{request.requester?.name ?? "Former member"}</span>}
                    <ArrowRight size={14} />
                  </div>
                </button>;
              })}
            </div>
          ) : <div className="approval-list-empty"><span className="approval-empty-icon"><CheckCircle2 size={20} /></span><strong>{view === "pending" ? "Nothing waiting on you." : view === "history" ? "No completed decisions yet." : "No requests in this workspace."}</strong><p>{view === "mine" ? "Start a request when a decision needs a clear owner and an audit trail." : "Your approvals will appear here when there is something to review."}</p></div>}
        </div>

        <aside className="approval-detail-panel">
          {requestQuery.isLoading ? <div className="page-loading"><span className="loader" />Opening request…</div>
            : requestQuery.isError ? <div className="approval-detail-empty"><CircleAlert size={19} /><strong>Request details aren’t available.</strong><button className="text-button" onClick={() => void requestQuery.refetch()}>Try again</button></div>
              : selectedRequest ? <>
                <div className="approval-detail-heading">
                  <div><span className="eyebrow">DECISION RECORD · {selectedRequest.id.slice(0, 8).toUpperCase()}</span><RequestStatusChip status={selectedRequest.status} /></div>
                  <h2>{selectedRequest.title}</h2>
                  <p>Submitted by {selectedRequest.requester?.name ?? "Former member"} · {dateTimeFormat.format(new Date(selectedRequest.createdAt))}</p>
                </div>
                {selectedRequest.description && <p className="approval-detail-description">{selectedRequest.description}</p>}
                {selectedRequest.dueAt && <p className="approval-deadline"><Clock3 size={14} /> Decision due {dateTimeFormat.format(new Date(selectedRequest.dueAt))}</p>}

                <div className="approval-route">
                  <div className="approval-section-label"><span className="eyebrow">THE ROUTE</span><span>{selectedRequest.steps.length} stage{selectedRequest.steps.length === 1 ? "" : "s"}</span></div>
                  {selectedRequest.steps.map((step) => <div className={`approval-route-step ${step.isComplete ? "is-complete" : step.stepOrder === selectedRequest.currentStepOrder && selectedRequest.status === "IN_PROGRESS" ? "is-current" : ""}`} key={step.id}>
                    <div className="approval-route-marker">{step.isComplete ? <Check size={14} /> : <span>{step.stepOrder + 1}</span>}</div>
                    <div className="approval-route-copy">
                      <div><strong>{step.mode === "PARALLEL" ? "Review together" : "Sequential review"}</strong><small>{step.isComplete ? "Complete" : step.stepOrder === selectedRequest.currentStepOrder && selectedRequest.status === "IN_PROGRESS" ? "Current stage" : "Up next"}</small></div>
                      {step.approvers.map((approver) => <div className="approval-reviewer" key={approver.id}>
                        <span className="approval-reviewer-avatar">{memberName(approver.member).slice(0, 1).toUpperCase()}</span>
                        <span><strong>{memberName(approver.member)}</strong><small>{roleLabel(approver.member.role)}</small></span>
                        <span className={`approval-decision approval-decision-${approver.decision.toLowerCase()}`}>{approver.decision === "PENDING" ? "Awaiting" : approver.decision === "CHANGES_REQUESTED" ? "Changes" : approver.decision === "APPROVED" ? "Approved" : "Declined"}</span>
                      </div>)}
                    </div>
                  </div>)}
                </div>

                {selectedRequest.attachments.length > 0 && <div className="approval-attachments">
                  <span className="eyebrow">ATTACHED FILES</span>
                  {selectedRequest.attachments.map((attachment) => {
                    const fileId = attachment.fileId;
                    return <div className="approval-attachment" key={attachment.id}>
                      <FileText size={15} /><span>{attachment.fileName}</span>
                      {fileId && attachment.file?.status === "READY" && !attachment.file.deletedAt
                        ? <button className="text-button" onClick={() => void downloadAttachment(fileId, attachment.fileName)}>Download</button>
                        : <small>No longer available</small>}
                    </div>;
                  })}
                </div>}

                {selectedRequest.activities && <div className="approval-timeline">
                  <div className="approval-section-label"><span className="eyebrow">DECISION HISTORY</span><span>{selectedRequest.activities.length} events</span></div>
                  {selectedRequest.activities.map((activity) => <article className="approval-activity" key={activity.id}>
                    <span className="approval-activity-mark" />
                    <div><strong>{activity.actor?.name ?? "Workspace member"} <small>{activity.action.replace(/_/g, " ").toLowerCase()}</small></strong>
                      {activity.comment && <p>{activity.comment}</p>}
                      <time dateTime={activity.createdAt}>{dateTimeFormat.format(new Date(activity.createdAt))}</time>
                    </div>
                  </article>)}
                </div>}

                <div className="approval-action-box approval-comment-box">
                  <span className="eyebrow">KEEP THE CONTEXT</span>
                  <label className="field"><span>Add a comment</span><textarea rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Share a note with everyone involved." /></label>
                  <button className="button button-outline button-small" disabled={updateRequest.isPending || !comment.trim()} onClick={() => updateRequest.mutate({ action: "comments" })}>Add comment</button>
                </div>

                {assignedToMe && selectedRequest.status === "IN_PROGRESS" && <div className="approval-action-box">
                  <span className="eyebrow">YOUR REVIEW</span>
                  <label className="field"><span>Decision note <small>Required for decline or changes</small></span><textarea rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add context for the requester and audit history." /></label>
                  <div className="approval-decision-actions">
                    <button className="button button-green button-small" disabled={updateRequest.isPending} onClick={() => updateRequest.mutate({ action: "decision", decision: "APPROVED" })}><Check size={14} />Approve</button>
                    <button className="button button-outline button-small" disabled={updateRequest.isPending || !comment.trim()} onClick={() => updateRequest.mutate({ action: "decision", decision: "CHANGES_REQUESTED" })}>Request changes</button>
                    <button className="button button-outline button-small approval-decline-button" disabled={updateRequest.isPending || !comment.trim()} onClick={() => updateRequest.mutate({ action: "decision", decision: "REJECTED" })}>Decline</button>
                  </div>
                </div>}

                {selectedRequest.status === "CHANGES_REQUESTED" && selectedRequest.requesterId && selectedRequest.requesterId === currentUserId && <div className="approval-action-box">
                  <span className="eyebrow">REVISE & RESUBMIT</span>
                  <label className="field"><span>Update note <small>Optional</small></span><textarea rows={2} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell reviewers what changed." /></label>
                  <button className="button button-green button-small" disabled={updateRequest.isPending} onClick={() => updateRequest.mutate({ action: "resubmit" })}><RotateCcw size={14} />Resubmit request</button>
                </div>}

                {(selectedRequest.status === "IN_PROGRESS" || selectedRequest.status === "CHANGES_REQUESTED")
                  && (selectedRequest.requesterId === currentUserId || isAdministrator)
                  && <button className="approval-cancel-link" disabled={updateRequest.isPending} onClick={() => {
                    if (window.confirm("Cancel this approval request? Reviewers will no longer be able to act on it.")) updateRequest.mutate({ action: "cancel" });
                  }}>Cancel request</button>}
              </> : <div className="approval-detail-empty"><span className="approval-empty-icon"><ShieldCheck size={21} /></span><strong>Every request has a clear next step.</strong><p>Select a request to follow its reviewers, attachments and decision history.</p><span className="approval-detail-footnote">Private to the requester, assigned reviewers and workspace administrators.</span></div>}
        </aside>
      </section>

      {!isAdministrator && <p className="approval-footnote"><ShieldCheck size={14} /> Only workspace administrators can create or manage reusable approval workflows.</p>}
    </div>
  );
}
