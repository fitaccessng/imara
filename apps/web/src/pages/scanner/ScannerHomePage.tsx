import { ArrowDown, ArrowLeft, ArrowUp, Camera, CheckCircle2, FileText, LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { apiRequest } from "../../lib/api";
import { PlanLimitMessage } from "../../components/PlanLimitMessage";
import { deleteScanDraft, loadScanDraft, saveScanDraft, type ScanPage } from "./scanDraft";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SCAN_PAGES = 100;

async function createPdf(pages: ScanPage[]) {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDocument = await PDFDocument.create();
  for (const scanPage of pages) {
    let imageSource: CanvasImageSource;
    let imageWidth: number;
    let imageHeight: number;
    let releaseImage = () => {};
    try {
      const bitmap = await createImageBitmap(scanPage.blob);
      imageSource = bitmap;
      imageWidth = bitmap.width;
      imageHeight = bitmap.height;
      releaseImage = () => bitmap.close();
    } catch {
      const image = new Image();
      const imageUrl = URL.createObjectURL(scanPage.blob);
      image.src = imageUrl;
      try {
        await image.decode();
      } catch {
        URL.revokeObjectURL(imageUrl);
        throw new Error(`Could not read “${scanPage.name}”. Choose a JPG, PNG, or another browser-supported image.`);
      }
      imageSource = image;
      imageWidth = image.naturalWidth;
      imageHeight = image.naturalHeight;
      releaseImage = () => URL.revokeObjectURL(imageUrl);
    }

    const canvas = globalThis.document.createElement("canvas");
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      releaseImage();
      throw new Error("Could not prepare this image for the PDF.");
    }
    context.drawImage(imageSource, 0, 0);
    releaseImage();
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Could not convert “${scanPage.name}” to a PDF page.`));
      }, "image/jpeg", 0.88);
    });
    const image = await pdfDocument.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
    const page = pdfDocument.addPage([612, 792]);
    const padding = 28;
    const scale = Math.min((612 - padding * 2) / image.width, (792 - padding * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (612 - width) / 2,
      y: (792 - height) / 2,
      width,
      height,
    });
  }
  return new Blob([await pdfDocument.save()], { type: "application/pdf" });
}

export function ScannerHomePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder") ?? "";
  const queryClient = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [documentName, setDocumentName] = useState("Scanned document");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let active = true;
    void loadScanDraft(user!.id).then((draft) => {
      if (!active) return;
      if (draft) {
        setPages(draft.pages);
        setDocumentName(draft.name);
      }
      setReady(true);
    }).catch((reason: unknown) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : "Could not restore the saved scan.");
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    let active = true;
    let nextUrl = "";
    setPreviewBlob(null);
    setPreviewUrl("");
    if (!pages.length) return;

    void createPdf(pages).then((blob) => {
      if (!active) return;
      nextUrl = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(nextUrl);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not create the PDF preview.");
    });
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [pages]);

  async function persist(nextPages: ScanPage[], nextName = documentName) {
    await saveScanDraft(user!.id, { name: nextName, pages: nextPages });
    setPages(nextPages);
    setError("");
    setNotice("");
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setError("");
    try {
      const selected = Array.from(fileList);
      if (pages.length + selected.length > MAX_SCAN_PAGES) {
        throw new Error(`A scan can contain up to ${MAX_SCAN_PAGES} pages.`);
      }
      const oversized = selected.find((file) => file.size > MAX_UPLOAD_BYTES);
      if (oversized) throw new Error(`${oversized.name} is larger than the 25 MB per-file limit.`);
      const next = [
        ...pages,
        ...selected.map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          blob: file.slice(0, file.size, file.type),
        })),
      ];
      await persist(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add these pages.");
    } finally {
      setBusy(false);
      if (cameraInput.current) cameraInput.current.value = "";
    }
  }

  async function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await persist(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reorder the scan pages.");
    }
  }

  async function removePage(id: string) {
    try {
      await persist(pages.filter((page) => page.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this page.");
    }
  }

  async function saveName(value: string) {
    setDocumentName(value);
    try {
      await saveScanDraft(user!.id, { name: value, pages });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the document name.");
    }
  }

  async function uploadPdf() {
    if (!previewBlob || !pages.length) return;
    if (previewBlob.size > MAX_UPLOAD_BYTES) {
      setError("This PDF is larger than the 25 MB upload limit. Remove some pages or use smaller images.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const baseName = documentName.trim().replace(/[\\/]/g, "-") || "Scanned document";
      const name = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
      const body = new FormData();
      body.append("file", new File([previewBlob], name, { type: "application/pdf" }));
      if (folderId) body.append("folderId", folderId);
      await apiRequest("/files/scan", { method: "POST", body });
      await deleteScanDraft(user!.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["storage-files"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      setPages([]);
      setPreviewBlob(null);
      setNotice("Your scanned PDF was saved to My Files.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the scanned PDF.");
    } finally {
      setSaving(false);
    }
  }

  async function clearScan() {
    try {
      await deleteScanDraft(user!.id);
      setPages([]);
      setDocumentName("Scanned document");
      setPreviewBlob(null);
      setError("");
      setNotice("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not clear the scan.");
    }
  }

  return (
    <main className="document-scanner">
      <Link to="/files" className="document-scanner-back"><ArrowLeft size={15} /> My files</Link>
      <header className="document-scanner-heading">
        <div>
          <span className="eyebrow">PERSONAL WORKSPACE · SCANNER</span>
          <h1>Make a document<br /><em>of the pages.</em></h1>
          <p>Photograph paper pages and build a PDF. Your draft stays on this device while you move around the app.</p>
        </div>
        <div className="document-scanner-stamp"><FileText size={25} /><span>IMAGE TO PDF</span><strong>01—100</strong></div>
      </header>

      {error && (
        <div className="form-alert" role="alert">
          <PlanLimitMessage message={error} />
        </div>
      )}
      {notice && <p className="document-scanner-notice" role="status"><CheckCircle2 size={17} />{notice} <Link to="/files">Open My Files</Link></p>}

      {!ready ? (
        <div className="document-scanner-loading"><LoaderCircle className="document-scanner-spin" size={20} />Restoring your scan draft…</div>
      ) : (
        <div className="document-scanner-grid">
          <section className="document-scanner-panel">
            <div className="document-scanner-panel-heading">
              <div><span className="eyebrow">BUILD YOUR SCAN</span><h2>{pages.length ? `${pages.length} ${pages.length === 1 ? "page" : "pages"}` : "Start with a page"}</h2></div>
              <span className="document-scanner-index">{String(pages.length).padStart(2, "0")} / 100</span>
            </div>
            <div className="document-scanner-actions">
              <button type="button" className="button button-green" disabled={busy || pages.length >= MAX_SCAN_PAGES} onClick={() => cameraInput.current?.click()}>
                <Camera size={16} /> Take a photo
              </button>
              <input ref={cameraInput} className="document-scanner-input" type="file" accept="image/*" capture="environment" onChange={(event) => void addFiles(event.currentTarget.files)} />
            </div>
            <p className="document-scanner-hint">Capture up to 100 pages, then arrange them in reading order.</p>

            {pages.length > 0 ? (
              <>
                <label className="document-scanner-name">PDF file name
                  <input value={documentName} maxLength={120} onChange={(event) => setDocumentName(event.target.value)} onBlur={(event) => void saveName(event.currentTarget.value)} />
                </label>
                <ol className="document-scanner-pages">
                  {pages.map((page, index) => (
                    <li key={page.id}>
                      <span className="document-scanner-page-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="document-scanner-page-name" title={page.name}>{page.name}</span>
                      <div className="document-scanner-page-actions">
                        <button type="button" aria-label={`Move page ${index + 1} up`} disabled={index === 0} onClick={() => void movePage(index, -1)}><ArrowUp size={15} /></button>
                        <button type="button" aria-label={`Move page ${index + 1} down`} disabled={index === pages.length - 1} onClick={() => void movePage(index, 1)}><ArrowDown size={15} /></button>
                        <button type="button" aria-label={`Remove page ${index + 1}`} onClick={() => void removePage(page.id)}><Trash2 size={15} /></button>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="document-scanner-save">
                  <button type="button" className="button button-green" disabled={saving || !previewBlob || busy} onClick={() => void uploadPdf()}>
                    {saving ? <LoaderCircle className="document-scanner-spin" size={16} /> : <Save size={16} />}
                    {saving ? "Saving PDF…" : folderId ? "Save PDF to this folder" : "Save PDF to My Files"}
                  </button>
                  <button type="button" className="document-scanner-clear" disabled={saving || busy} onClick={() => void clearScan()}>Clear scan</button>
                </div>
              </>
            ) : (
              <div className="document-scanner-empty"><span><Upload size={19} /></span><strong>Your pages will gather here.</strong><p>After you add images, they’ll be combined into one PDF you can preview and save.</p></div>
            )}
          </section>

          <section className="document-scanner-preview">
            <div className="document-scanner-panel-heading">
              <div><span className="eyebrow">LIVE PREVIEW</span><h2>PDF document</h2></div>
              {pages.length > 0 && <span className="document-scanner-pdf-tag">PDF</span>}
            </div>
            {previewUrl ? <iframe title="Scanned document PDF preview" src={previewUrl} /> : (
              <div className="document-scanner-preview-empty">
                {busy ? <LoaderCircle className="document-scanner-spin" size={22} /> : <FileText size={25} />}
                <span>{pages.length ? "Preparing your PDF preview…" : "Add a page to see the preview."}</span>
              </div>
            )}
            <p className="document-scanner-preview-foot">Your draft is stored privately in this browser until you save or clear it.</p>
          </section>
        </div>
      )}
    </main>
  );
}

export default ScannerHomePage;
