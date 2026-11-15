import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { renderDocxAsPdf } from "./DocxPagePreview";
import {
  ArrowDown, Check, ChevronDown, Download, FileImage, FileText,
  FileWarning, Files, Image, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Upload,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./document-tools.css";

type Conversion = "images-pdf" | "pdf-images" | "docx-pdf" | "pdf-docx";
type Artifact = { name: string; blob: Blob; url: string };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_PDF_PAGES = 40;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;
const MAX_RENDERED_PAGES = 60;
const MAX_RENDERED_PIXELS = 40_000_000;
const MAX_IMAGE_PIXELS = 40_000_000;

const conversions: Array<{ id: Conversion; label: string; detail: string; accept: string; icon: typeof FileText }> = [
  { id: "images-pdf", label: "Images to PDF", detail: "JPG · PNG · WebP", accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp", icon: Image },
  { id: "pdf-images", label: "PDF to images", detail: "PNG · JPG", accept: "application/pdf,.pdf", icon: FileImage },
  { id: "docx-pdf", label: "Word to PDF", detail: "DOCX only", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: FileText },
  { id: "pdf-docx", label: "PDF to Word", detail: "Preserve page appearance", accept: "application/pdf,.pdf", icon: FileText },
];

const safeName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 70) || "document";

function makeImageDocx(pages: Array<{ bytes: Uint8Array; width: number; height: number }>) {
  const firstPage = pages[0];
  const lastPage = pages.at(-1);
  if (!firstPage || !lastPage) throw new Error("No PDF pages were available to convert.");

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const sectionProperties = (page: typeof firstPage, nextPage: boolean) => {
    const scale = Math.min(1, 1584 / Math.max(page.width, page.height));
    const widthTwips = Math.round(page.width * scale * 20);
    const heightTwips = Math.round(page.height * scale * 20);
    return `<w:sectPr>${nextPage ? "<w:type w:val=\"nextPage\"/>" : ""}<w:pgSz w:w="${widthTwips}" w:h="${heightTwips}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  };
  const documentPages = pages.map((page, index) => {
    const scale = Math.min(1, 1584 / Math.max(page.width, page.height));
    const width = Math.round(page.width * scale * 12700);
    const height = Math.round(page.height * scale * 12700);
    const section = index < pages.length - 1 ? sectionProperties(page, true) : "";
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${section}</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${index + 1}" name="Page ${index + 1}" descr="Full-page image from the original PDF"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="Page ${index + 1}.png" descr="Full-page image from the original PDF"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${documentPages}${sectionProperties(lastPage, false)}</w:body></w:document>`);
  const relationships = pages.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${String(index + 1).padStart(3, "0")}.png"/>`).join("");
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`);
  pages.forEach((page, index) => zip.file(`word/media/page-${String(index + 1).padStart(3, "0")}.png`, page.bytes));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

async function toPdfFromImage(file: File, pixelBudget: { used: number }) {
  const bitmap = await createImageBitmap(file);
  const pixelCount = bitmap.width * bitmap.height;
  bitmap.close();
  if (pixelCount > 25_000_000) throw new Error(`${file.name} is too large to safely convert in this browser.`);
  if (pixelBudget.used + pixelCount > MAX_IMAGE_PIXELS) throw new Error("The selected images exceed the safe combined pixel limit. Choose fewer or smaller images.");
  pixelBudget.used += pixelCount;
  const bytes = await file.arrayBuffer();
  let pdf: PDFDocument;
  let embedded: Awaited<ReturnType<PDFDocument["embedJpg"]>>;
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
    pdf = await PDFDocument.create();
    embedded = await pdf.embedJpg(bytes);
  }
  else {
    pdf = await PDFDocument.create();
    if (file.type === "image/png" || /\.png$/i.test(file.name)) embedded = await pdf.embedPng(bytes);
    else {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser could not create an image canvas.");
        context.drawImage(bitmap, 0, 0);
        const converted = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not decode this image.")), "image/png"));
        embedded = await pdf.embedPng(await converted.arrayBuffer());
        canvas.width = 0; canvas.height = 0;
      } finally { bitmap.close(); }
    }
  }
  const scale = Math.min(1, 1000 / Math.max(embedded.width, embedded.height));
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  const page = pdf.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

async function loadPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await task.promise;
  if (pdf.numPages > MAX_PDF_PAGES) { await pdf.destroy(); throw new Error(`${file.name} has ${pdf.numPages} pages. This browser tool supports up to ${MAX_PDF_PAGES} at a time.`); }
  return { pdf, task };
}

async function addPdfPages(file: File, format: "png" | "jpeg", zip: JSZip, progress: (value: number) => void, offset: number, total: number, pixelBudget: { used: number }) {
  const { pdf } = await loadPdf(file);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1.25 });
      const pixelCount = Math.ceil(viewport.width) * Math.ceil(viewport.height);
      if (pixelCount > 8_000_000 || pixelBudget.used + pixelCount > MAX_RENDERED_PIXELS) throw new Error(`Page ${index} is too large to render safely. Try a smaller PDF or split the batch.`);
      pixelBudget.used += pixelCount;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create an image canvas.");
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not export page ${index}.`)), mime, 0.92));
      zip.file(`${safeName(file.name)}/page-${String(index).padStart(3, "0")}.${format}`, blob);
      page.cleanup(); canvas.width = 0; canvas.height = 0;
      progress(Math.round(((offset + index / pdf.numPages) / total) * 100));
    }
    return pdf.numPages;
  } finally { await pdf.destroy(); }
}

async function pdfToDocx(file: File, progress: (value: number) => void, offset: number, total: number) {
  const { pdf } = await loadPdf(file);
  const pages: Array<{ bytes: Uint8Array; width: number; height: number }> = [];
  const pixelBudget = { used: 0 };
  try {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.25 });
      const pixels = Math.ceil(viewport.width) * Math.ceil(viewport.height);
      if (pixels > 8_000_000 || pixelBudget.used + pixels > MAX_RENDERED_PIXELS) {
        throw new Error("The selected PDF exceeds the safe page-image limit. Split it into smaller files.");
      }
      pixelBudget.used += pixels;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not create an image canvas.");
      await page.render({ canvasContext: context, viewport, background: "rgb(255,255,255)" }).promise;
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result
          ? resolve(result)
          : reject(new Error(`PDF page ${i} could not be exported.`)), "image/png");
      });
      pages.push({
        bytes: new Uint8Array(await image.arrayBuffer()),
        width: viewport.width / 1.25,
        height: viewport.height / 1.25,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      progress(Math.round(((offset + i / pdf.numPages) / total) * 100));
    }
  } finally { await pdf.destroy(); }
  return makeImageDocx(pages);
}

async function docxToPdf(file: File, progress: (value: number) => void, offset: number, total: number) {
  return renderDocxAsPdf(file, (page, pageCount) => {
    progress(Math.round(((offset + page / pageCount) / total) * 100));
  });
}

export function DocumentToolsPage() {
  const [conversion, setConversion] = useState<Conversion>("images-pdf");
  const [files, setFiles] = useState<File[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const inputRef = useRef<HTMLInputElement>(null);
  const active = conversions.find((item) => item.id === conversion)!;

  useEffect(() => () => artifacts.forEach((artifact) => URL.revokeObjectURL(artifact.url)), [artifacts]);

  function chooseConversion(next: Conversion) {
    setConversion(next); setFiles([]); setError(""); setArtifacts([]); setProgress(0);
  }
  function acceptFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    setError("");
    if (list.length > MAX_FILES) { setFiles([]); setError(`Choose no more than ${MAX_FILES} files at once.`); return; }
    if (list.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) { setFiles([]); setError("The selected batch is over 60 MB. Choose fewer or smaller files."); return; }
    const supported = list.filter((file) => file.size <= MAX_FILE_BYTES && (
      conversion === "images-pdf" ? ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name) : conversion === "docx-pdf" ? file.name.toLowerCase().endsWith(".docx") : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    ));
    if (supported.length !== list.length) {
      setFiles([]); setError("One or more files are unsupported or over 25 MB. Use JPEG, PNG or WebP images, DOCX documents, or PDFs as selected.");
      return;
    }
    if (conversion === "pdf-images" && list.length > 4) { setFiles([]); setError("Choose up to 4 PDFs for image export."); return; }
    setFiles(supported); setArtifacts([]); setProgress(0);
  }
  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) acceptFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files) acceptFiles(event.dataTransfer.files);
  }

  async function convert() {
    if (!files.length || working) return;
    setWorking(true); setError(""); setArtifacts([]); setProgress(0);
    const results: Array<{ name: string; blob: Blob }> = [];
    try {
      if (conversion === "images-pdf") {
        const pixelBudget = { used: 0 };
        if (files.length > 1) {
          const pdf = await PDFDocument.create();
          for (const [i, file] of files.entries()) {
            const blob = await toPdfFromImage(file, pixelBudget);
            const part = await PDFDocument.load(await blob.arrayBuffer());
            const pages = await pdf.copyPages(part, part.getPageIndices());
            pages.forEach((page) => pdf.addPage(page));
            setProgress(Math.round(((i + 1) / files.length) * 100));
          }
          results.push({ name: "images-combined.pdf", blob: new Blob([await pdf.save()], { type: "application/pdf" }) });
        } else results.push({ name: `${safeName(files[0].name)}.pdf`, blob: await toPdfFromImage(files[0], pixelBudget) });
        setProgress(100);
      } else if (conversion === "docx-pdf") {
        for (const [i, file] of files.entries()) {
          const blob = await docxToPdf(file, setProgress, i, files.length);
          results.push({ name: `${safeName(file.name)}.pdf`, blob });
        }
      } else if (conversion === "pdf-docx") {
        for (const [i, file] of files.entries()) {
          const blob = await pdfToDocx(file, setProgress, i, files.length);
          results.push({ name: `${safeName(file.name)}.docx`, blob });
        }
      } else {
        let totalPages = 0;
        const zip = new JSZip();
        const pixelBudget = { used: 0 };
        for (const file of files) {
          const { pdf } = await loadPdf(file);
          totalPages += pdf.numPages;
          await pdf.destroy();
          if (totalPages > MAX_RENDERED_PAGES) throw new Error(`This batch has more than ${MAX_RENDERED_PAGES} pages. Split it into smaller batches.`);
        }
        for (const [i, file] of files.entries()) {
          await addPdfPages(file, format, zip, setProgress, i, files.length, pixelBudget);
          setProgress(Math.round(((i + 1) / files.length) * 100));
        }
        results.push({ name: "pdf-pages.zip", blob: await zip.generateAsync({ type: "blob" }) });
      }
      const finalResults = results.length > 1
        ? [{ name: "imara-converted-files.zip", blob: await zipResults(results) }]
        : results;
      setArtifacts(finalResults.map((item) => ({ ...item, url: URL.createObjectURL(item.blob) })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The file could not be converted. Please try another file.");
    } finally { setWorking(false); }
  }

  async function zipResults(results: Array<{ name: string; blob: Blob }>) {
    const zip = new JSZip();
    results.forEach((result) => zip.file(result.name, result.blob));
    return zip.generateAsync({ type: "blob" });
  }

  return (
    <main className="document-tools-page">
      <header className="dt-hero">
        <div className="dt-hero-copy">
          <p className="dt-kicker"><span /> YOUR DOCUMENT DESK</p>
          <h1>Make paperwork<br /><em>work for you.</em></h1>
          <p>Convert everyday files into useful formats, right here in your browser.</p>
        </div>
        <div className="dt-hero-note"><ShieldCheck size={18} /><span><strong>Private by design</strong><br />Files are processed in this browser.</span></div>
        <div className="dt-orbit" aria-hidden="true"><span>DOC</span><span>PDF</span><span>IMG</span></div>
      </header>

      <section className="dt-workspace" aria-labelledby="dt-convert-title">
          <div className="dt-panel-heading"><div><p className="dt-section-index">01 / CONVERSION</p><h2 id="dt-convert-title">Choose a direction</h2></div><span className="dt-local-tag"><span /> LOCAL PROCESSING</span></div>
          <div className="dt-conversion-grid" role="radiogroup" aria-label="Choose file conversion">
            {conversions.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" aria-pressed={conversion === item.id} disabled={working} className={`dt-conversion-card ${conversion === item.id ? "is-selected" : ""}`} onClick={() => chooseConversion(item.id)}>
                <span className="dt-card-icon"><Icon size={19} /></span><span className="dt-card-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="dt-radio-mark" />
              </button>;
            })}
          </div>
          {(conversion === "docx-pdf" || conversion === "pdf-docx") && <p className="dt-caveat"><FileWarning size={16} /> {conversion === "docx-pdf" ? "Word pages are rendered with their layout and saved as images in the PDF, so page appearance is preserved but text won’t be selectable. Legacy .doc files are not supported." : "PDF pages are placed into Word as images to preserve their appearance. The page text won’t be directly editable."}</p>}
          {conversion === "pdf-images" && <label className="dt-format-select">Image output <span className="dt-select-wrap"><select value={format} onChange={(event) => setFormat(event.target.value as "png" | "jpeg")}><option value="png">PNG · best quality</option><option value="jpeg">JPEG · smaller files</option></select><ChevronDown size={14} /></span></label>}
          <div className={`dt-dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <input ref={inputRef} type="file" accept={active.accept} multiple disabled={working} tabIndex={-1} aria-hidden="true" onChange={onFileChange} />
            <span className="dt-upload-icon"><Upload size={20} /></span><strong>Drop {conversion === "images-pdf" ? "images" : conversion.startsWith("pdf") ? "PDFs" : "a DOCX"} here</strong>
            <span>or <button type="button" disabled={working} onClick={() => inputRef.current?.click()}>browse files</button></span>
            <small>{conversion === "pdf-images" ? "Up to 4 PDFs · 40 pages each" : conversion === "images-pdf" ? "Up to 8 images · combined in page order" : "Up to 8 files"} · 25 MB per file</small>
          </div>
          {files.length > 0 && <div className="dt-file-list" aria-label="Selected files">{files.map((file) => <div key={`${file.name}-${file.lastModified}`}><span className="dt-file-glyph"><FileText size={15} /></span><span className="dt-file-info"><strong>{file.name}</strong><small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((entry) => entry !== file))}>Remove</button></div>)}</div>}
          {error && <p className="dt-alert" role="alert"><FileWarning size={16} />{error}</p>}
          {working && <div className="dt-progress" role="status" aria-live="polite"><div><span>Working locally…</span><strong>{progress}%</strong></div><span className="dt-progress-track"><span style={{ width: `${progress}%` }} /></span></div>}
          <div className="dt-action-row"><span><ShieldCheck size={15} /> Nothing is uploaded or stored.</span><button type="button" className="dt-primary" disabled={!files.length || working} onClick={convert}>{working ? <><LoaderCircle size={16} className="dt-spin" /> Converting…</> : <><Sparkles size={16} /> Convert files <ArrowDown size={14} /></>}</button></div>
          {artifacts.length > 0 && <div className="dt-results" role="status"><div><span className="dt-success-icon"><Check size={17} /></span><div><strong>Ready to download</strong><small>Your files are ready on this device.</small></div></div>{artifacts.map((artifact) => <a key={artifact.url} href={artifact.url} download={artifact.name}><Download size={15} />{artifact.name}</a>)}<button type="button" className="dt-reset" onClick={() => { setFiles([]); setArtifacts([]); setProgress(0); }}><RotateCcw size={14} /> Start another</button></div>}
      </section>
      <footer className="dt-footer"><span><Files size={14} /> A little less busywork.</span><span>Conversions are browser-based; large files may take a moment.</span></footer>
    </main>
  );
}
