import { useEffect, useMemo, useState } from "react";
import { Download, FileText, LoaderCircle, Printer, Save, Upload, X } from "lucide-react";
import { apiBlob, apiRequest } from "../lib/api";
import { OfficePreviewEditor } from "./OfficePreviewEditor";

export interface ViewableFile {
  id: string;
  name: string;
  mimeType: string;
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

export function FileViewerModal({ file, readUrl, saveUrl, onClose, onSaved, canEdit, canDownload, onDownload }: FileViewerModalProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [replacement, setReplacement] = useState<File | null>(null);
  const [replacementError, setReplacementError] = useState("");
  const [officeDirty, setOfficeDirty] = useState(false);
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

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", new File([text], file.name, { type: file.mimeType || "text/plain" }));
      await apiRequest(saveUrl, { method: "PATCH", body });
      setSavedText(text);
      setBlob(new Blob([text], { type: file.mimeType || "text/plain" }));
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this file.");
    } finally {
      setSaving(false);
    }
  }

  function chooseReplacement(selected: File | undefined) {
    if (!selected) return;
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
    try {
      const body = new FormData();
      body.append("file", replacement);
      await apiRequest(saveUrl, { method: "PATCH", body });
      setReplacement(null);
      await onSaved();
    } catch (reason) {
      setReplacementError(reason instanceof Error ? reason.message : "Unable to upload the edited file.");
    } finally {
      setSaving(false);
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
            {canDownload && blob && <button className="button button-outline" type="button" onClick={() => window.print()}><Printer size={15} /> Print</button>}
            <button className="icon-button" aria-label="Close file preview" onClick={requestClose} disabled={saving}><X size={18} /></button>
          </div>
        </header>
        {error && <p className="form-alert file-viewer-error" role="alert">{error}</p>}
        <div className="file-viewer-content">
          {loading ? <div className="file-viewer-state"><LoaderCircle size={20} className="file-viewer-spinner" />Opening file…</div>
            : officeDocument && blob ? <OfficePreviewEditor
              file={file}
              blob={blob}
              saveUrl={saveUrl}
              canEdit={canEdit}
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
              <button className="button button-outline" onClick={() => { setReplacement(null); setReplacementError(""); }} disabled={saving}>Cancel</button>
              <button className="button button-green" onClick={() => void uploadReplacement()} disabled={saving}>{saving ? "Uploading…" : "Replace file"}</button>
            </div>
          </section>
        </div>}
        {!replacement && replacementError && <p className="form-alert file-viewer-error" role="alert">{replacementError}</p>}
      </section>
    </div>
  );
}
