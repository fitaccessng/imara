import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarClock, Download, FileText, LoaderCircle, Printer, Save, Upload, X, CloudDownload, Check, ScanText } from "lucide-react";
import { apiBlob, apiRequest } from "../lib/api";
import { OfficePreviewEditor } from "./OfficePreviewEditor";
import { saveOfflineFile } from "../offline/offlineFiles";
import { useAuth } from "../auth/AuthProvider";
import { extractDocumentText, type OcrProgress } from "../document-tools/ocr";

export interface ViewableFile {
  id: string;
  name: string;
  mimeType: string;
  expiresAt?: string | null;
}

interface FileViewerModalProps {
  file: ViewableFile;
  readUrl: string;
  saveUrl: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  canEdit: boolean;
  canDownload: boolean;
  onDownload: () => void;
  maxUploadBytes?: number;
  manageExpiry?: boolean;
}

function isEditableText(file: ViewableFile) {
  if (isOfficeDocument(file)) return false;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return file.mimeType.startsWith("text/")
    || ["json", "xml", "javascript", "x-javascript"].includes(file.mimeType.split("/").pop() ?? "")
    || ["txt", "md", "markdown", "json", "xml", "js", "ts", "css", "html", "yaml", "yml", "log"].includes(extension ?? "");
}

function isOfficeDocument(file: ViewableFile) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ["csv", "doc", "docx", "pdf", "ppt", "pptx", "xls", "xlsx"].includes(extension ?? "");
}

export function FileViewerModal({ file, readUrl, saveUrl, onClose, onSaved, canEdit, canDownload, onDownload, maxUploadBytes, manageExpiry = false }: FileViewerModalProps) {
  const { user } = useAuth();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [replacementError, setReplacementError] = useState("");
  const [officeDirty, setOfficeDirty] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [offlineError, setOfflineError] = useState("");
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [ocrComplete, setOcrComplete] = useState(false);
  const [expiryDate, setExpiryDate] = useState(file.expiresAt?.slice(0, 10) ?? "");
  const [expiryError, setExpiryError] = useState("");
  const [expiryFeedback, setExpiryFeedback] = useState("");
  const [savingExpiry, setSavingExpiry] = useState(false);
  const uploadController = useRef<AbortController | null>(null);
  const officeDocument = isOfficeDocument(file);
  const editableText = canEdit && isEditableText(file);
  const canReplace = canEdit && officeDocument;
  const objectUrl = useMemo(() => blob ? URL.createObjectURL(blob) : "", [blob]);
  const dirty = editableText && text !== savedText;
  const hasUnsavedChanges = Boolean(dirty || officeDirty || replacement);

  function requestClose() {
    if (saving) return;
    if (hasUnsavedChanges) {
      setError("Save or cancel your changes before closing this file.");
      return;
    }
    onClose();
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setBlob(null);
    setError("");
    void apiBlob(readUrl).then(async (contents) => {
      if (!active) return;
      setBlob(contents);
      if (editableText) {
        const content = await contents.text();
        if (!active) return;
        setText(content);
        setSavedText(content);
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to open this file.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [readUrl, editableText]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    setOfflineSaved(false);
    setOfflineError("");
    setOcrProgress(null);
    setOcrError("");
    setOcrComplete(false);
    setExpiryDate(file.expiresAt?.slice(0, 10) ?? "");
    setExpiryError("");
    setExpiryFeedback("");
  }, [file.id]);

  async function save() {
    setSaving(true);
    setError("");
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const body = new FormData();
      const updatedFile = new File([text], file.name, { type: file.mimeType || "text/plain" });
      if (typeof maxUploadBytes !== "number" || !Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1) {
        throw new Error("Your upload limit could not be checked. Refresh the page before uploading.");
      }
      if (updatedFile.size > maxUploadBytes) {
        throw new Error(`This file exceeds your plan’s ${Math.round(maxUploadBytes / 1024 ** 2)} MiB upload limit. Upgrade your plan for larger files.`);
      }
      body.append("file", updatedFile);
      await apiRequest(saveUrl, { method: "PATCH", body, signal: controller.signal });
      setSavedText(text);
      setBlob(new Blob([text], { type: file.mimeType || "text/plain" }));
      await onSaved();
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Unable to save this file.");
    } finally {
      uploadController.current = null;
      setSaving(false);
    }
  }

  async function saveForOffline() {
    if (!blob || savingOffline) return;
    if (!user) {
      setOfflineError("Sign in to save this document for offline access.");
      return;
    }
    setSavingOffline(true);
    setOfflineError("");
    try {
      await saveOfflineFile({
        id: file.id,
        userId: user?.id ?? "",
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: blob.size,
        blob,
      });
      setOfflineSaved(true);
    } catch (reason) {
      setOfflineError(reason instanceof Error ? reason.message : "This file couldn’t be saved for offline use.");
    } finally {
      setSavingOffline(false);
    }
  }

  async function indexDocumentText() {
    if (!blob || !user || ocrProgress) return;
    setOcrError("");
    setOcrComplete(false);
    setOcrProgress({ label: "Preparing text recognition…", percent: 0 });
    try {
      const sourceFile = new File([blob], file.name, { type: file.mimeType || blob.type });
      const extractedText = await extractDocumentText(sourceFile, setOcrProgress);
      await apiRequest(`/files/${file.id}/ocr-text`, {
        method: "PUT",
        body: JSON.stringify({ text: extractedText }),
      });
      setOcrComplete(true);
      setOcrProgress(null);
    } catch (reason) {
      setOcrProgress(null);
      setOcrError(reason instanceof Error ? reason.message : "Text recognition could not be completed.");
    }
  }

  function chooseReplacement(selected: File | undefined) {
    if (!selected) return;
    if (typeof maxUploadBytes !== "number" || !Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1) {
      setReplacementError("Your upload limit could not be checked. Refresh the page before uploading.");
      setReplacement(null);
      return;
    }
    if (selected.size > maxUploadBytes) {
      setReplacementError(`${selected.name} exceeds your plan’s ${Math.round(maxUploadBytes / 1024 ** 2)} MiB upload limit. Upgrade your plan for larger files.`);
      setReplacement(null);
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const selectedExtension = selected.name.split(".").pop()?.toLowerCase();
    if (!extension || selectedExtension !== extension) {
      setReplacementError(`Choose an edited file with the same .${extension ?? "original"} extension.`);
      return;
    }
    setReplacementError("");
    setReplacement(selected);
  }

  async function uploadReplacement() {
    if (!replacement) return;
    setSaving(true);
    setReplacementError("");
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const body = new FormData();
      body.append("file", replacement);
      await apiRequest(saveUrl, { method: "PATCH", body, signal: controller.signal });
      setReplacement(null);
      await onSaved();
    } catch (reason) {
      if (controller.signal.aborted) return;
      setReplacementError(reason instanceof Error ? reason.message : "Unable to upload the edited file.");
    } finally {
      uploadController.current = null;
      setSaving(false);
    }
  }

  async function saveExpiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingExpiry(true);
    setExpiryError("");
    setExpiryFeedback("");
    try {
      await apiRequest(`/files/${encodeURIComponent(file.id)}/expiry`, {
        method: "PATCH",
        body: JSON.stringify({ expiresAt: expiryDate || null }),
      });
      await onSaved();
      setExpiryFeedback(expiryDate ? "Expiry date saved." : "Expiry date removed.");
    } catch (reason) {
      setExpiryError(reason instanceof Error ? reason.message : "The expiry date could not be saved.");
    } finally {
      setSavingExpiry(false);
    }
  }

  const image = file.mimeType.startsWith("image/");
  const pdf = file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const audio = file.mimeType.startsWith("audio/");
  const video = file.mimeType.startsWith("video/");

  return (
    <div className="file-viewer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section className="file-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="file-viewer-title">
        <header className="file-viewer-header">
          <div className="file-viewer-file"><span><FileText size={17} /></span><div><h2 id="file-viewer-title">{file.name}</h2><p>{editableText ? "Text editor" : "File preview"}</p></div></div>
          <div className="file-viewer-actions">
            {editableText && <button className="button button-green" disabled={!dirty || saving || loading} onClick={() => void save()}><Save size={15} />{saving ? "Saving…" : "Save changes"}</button>}
            {saving && !replacement && <button className="button button-outline" onClick={() => uploadController.current?.abort()}>Cancel upload</button>}
            {canReplace && <>
              <input
                id={`replace-${file.id}`}
                className="file-replacement-input"
                type="file"
                accept={`.${file.name.split(".").pop()?.toLowerCase()}`}
                aria-label={`Choose an edited ${file.name} file`}
                onChange={(event) => {
                  chooseReplacement(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <label className="button button-outline" htmlFor={`replace-${file.id}`}><Upload size={15} />Upload edited version</label>
            </>}
            {canDownload && <button className="button button-outline" onClick={onDownload}><Download size={15} /> Download</button>}
            {canDownload && blob && <button className="button button-outline" type="button" disabled={savingOffline} onClick={() => void saveForOffline()}>{offlineSaved ? <Check size={15} /> : <CloudDownload size={15} />}{savingOffline ? "Saving offline…" : offlineSaved ? "Saved offline" : "Save offline"}</button>}
            {canDownload && blob && (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) && <button className="button button-outline" type="button" disabled={Boolean(ocrProgress) || !user} onClick={() => void indexDocumentText()}>{ocrComplete ? <Check size={15} /> : ocrProgress ? <LoaderCircle size={15} className="file-viewer-spinner" /> : <ScanText size={15} />}{ocrProgress ? `${ocrProgress.percent}%` : ocrComplete ? "Searchable" : "Make searchable"}</button>}
            {canDownload && blob && <button className="button button-outline" type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>}
            <button className="icon-button" aria-label="Close file preview" onClick={requestClose} disabled={saving}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="form-alert file-viewer-error" role="alert">{error}</p>}
        {offlineError && <p className="form-alert file-viewer-error" role="alert">{offlineError}</p>}
        {ocrProgress && <div className="file-ocr-progress" role="status"><span>{ocrProgress.label}</span><div><i style={{ width: `${ocrProgress.percent}%` }} /></div><small>Document processing happens on this device. Extracted text will be stored in IMARA so you can search it across devices.</small></div>}
        {ocrComplete && <p className="file-ocr-success" role="status"><Check size={14} />Text recognised. You can now find this file by searching its contents.</p>}
        {ocrError && <p className="form-alert file-viewer-error" role="alert">{ocrError}</p>}
        {manageExpiry && <form className="file-expiry-editor" onSubmit={(event) => void saveExpiry(event)}>
          <label htmlFor={`file-expiry-${file.id}`}><CalendarClock size={16} /><span><strong>Document expiry</strong><small>Optional reminder date. IMARA won’t infer dates from the document.</small></span></label>
          <input id={`file-expiry-${file.id}`} type="date" value={expiryDate} onChange={(event) => { setExpiryDate(event.target.value); setExpiryFeedback(""); }} />
          <button type="submit" className="button button-outline" disabled={savingExpiry || expiryDate === (file.expiresAt?.slice(0, 10) ?? "")}>{savingExpiry ? "Saving…" : "Save date"}</button>
          {expiryDate && <button type="button" className="file-expiry-clear" disabled={savingExpiry} onClick={() => { setExpiryDate(""); setExpiryFeedback(""); }}>Clear</button>}
          {expiryError && <span className="file-expiry-feedback file-expiry-error" role="alert">{expiryError}</span>}
          {expiryFeedback && <span className="file-expiry-feedback" role="status">{expiryFeedback}</span>}
        </form>}
        <div className="file-viewer-content">
          {loading ? <div className="file-viewer-state"><LoaderCircle size={20} className="file-viewer-spinner" />Opening file…</div>
            : officeDocument && blob ? <OfficePreviewEditor
              file={file}
              blob={blob}
              saveUrl={saveUrl}
              canEdit={canEdit}
              maxUploadBytes={maxUploadBytes}
              onDirtyChange={setOfficeDirty}
              onSaved={async (updatedBlob) => {
                setBlob(updatedBlob);
                await onSaved();
              }}
            />
              : editableText ? <textarea className="file-text-editor" aria-label={`Edit ${file.name}`} spellCheck={file.name.toLowerCase().endsWith(".md")} value={text} onChange={(event) => setText(event.target.value)} />
              : objectUrl && image ? <div className="file-image-preview"><img src={objectUrl} alt={file.name} /></div>
                : objectUrl && pdf ? <iframe className="file-pdf-preview" src={objectUrl} title={file.name} />
                  : objectUrl && audio ? <div className="file-media-preview"><audio controls src={objectUrl}>Your browser cannot play this audio.</audio></div>
                    : objectUrl && video ? <div className="file-media-preview"><video controls src={objectUrl}>Your browser cannot play this video.</video></div>
                      : !error && <div className="file-viewer-state"><FileText size={28} /><h3>Preview not available</h3><p>{officeDocument ? "This file format can’t be previewed here. Download it to open in a compatible app, then upload the edited version." : "This format can’t be previewed in the browser yet. Download it to open it in a compatible app."}</p></div>}
        </div>
        {dirty && <div className="file-viewer-unsaved" role="status">Unsaved changes</div>}
        {replacement && <div className="file-replace-backdrop">
          <section className="file-replace-dialog" role="dialog" aria-modal="true" aria-labelledby="file-replace-title">
            <h3 id="file-replace-title">Replace this file?</h3>
            <p><strong>{replacement.name}</strong> will replace the current {file.name} version. This can’t be undone.</p>
            {replacementError && <p className="form-alert" role="alert">{replacementError}</p>}
            <div className="folder-move-actions">
              <button className="button button-outline" onClick={() => saving ? uploadController.current?.abort() : (setReplacement(null), setReplacementError(""))}>{saving ? "Cancel upload" : "Cancel"}</button>
              <button className="button button-green" onClick={() => void uploadReplacement()} disabled={saving}>{saving ? "Uploading…" : "Replace file"}</button>
            </div>
          </section>
        </div>}
        {!replacement && replacementError && <p className="form-alert file-viewer-error" role="alert">{replacementError}</p>}
      </section>
    </div>
  );
}
