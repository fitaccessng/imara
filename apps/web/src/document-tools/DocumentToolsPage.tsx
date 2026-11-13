import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import {
  ArrowDown, ArrowLeftRight, Check, ChevronDown, Download, FileImage, FileText,
  FileWarning, Files, FilePlus2, Image, LoaderCircle, RotateCcw, ShieldCheck,
  Sparkles, Upload, WandSparkles,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./document-tools.css";

type Conversion = "images-pdf" | "pdf-images" | "docx-pdf" | "pdf-docx";
type TemplateKind = "invoice" | "agreement" | "form";
type Artifact = { name: string; blob: Blob; url: string };
type TemplateField = { name: string; label: string; value: string; multiline?: boolean };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_PDF_PAGES = 40;
const MAX_BATCH_BYTES = 60 * 1024 * 1024;
const MAX_RENDERED_PAGES = 60;
const MAX_RENDERED_PIXELS = 40_000_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_EXTRACTED_CHARS = 120_000;

const conversions: Array<{ id: Conversion; label: string; detail: string; accept: string; icon: typeof FileText }> = [
  { id: "images-pdf", label: "Images to PDF", detail: "JPG · PNG · WebP", accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp", icon: Image },
  { id: "pdf-images", label: "PDF to images", detail: "PNG · JPG", accept: "application/pdf,.pdf", icon: FileImage },
  { id: "docx-pdf", label: "Word to PDF", detail: "DOCX only", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: FileText },
  { id: "pdf-docx", label: "PDF to Word", detail: "Text-first DOCX", accept: "application/pdf,.pdf", icon: FileText },
];

const templateFields: Record<TemplateKind, TemplateField[]> = {
  invoice: [
    { name: "business", label: "Your business", value: "IMARA Studio" },
    { name: "client", label: "Bill to", value: "Client name" },
    { name: "invoiceNo", label: "Invoice number", value: "INV-001" },
    { name: "date", label: "Issue date", value: new Date().toISOString().slice(0, 10) },
    { name: "due", label: "Due date", value: "" },
    { name: "items", label: "Items (one per line: description — amount)", value: "Creative services — 500.00", multiline: true },
    { name: "currency", label: "Currency", value: "USD" },
    { name: "notes", label: "Payment notes", value: "Thank you for your business.", multiline: true },
  ],
  agreement: [
    { name: "title", label: "Agreement title", value: "Service Agreement" },
    { name: "partyA", label: "First party", value: "Service provider" },
    { name: "partyB", label: "Second party", value: "Client" },
    { name: "effective", label: "Effective date", value: new Date().toISOString().slice(0, 10) },
    { name: "scope", label: "Scope of work", value: "Describe the services, deliverables, and any exclusions.", multiline: true },
    { name: "payment", label: "Payment terms", value: "Describe fees, invoicing, and payment timing.", multiline: true },
    { name: "timeline", label: "Term and timeline", value: "Describe the expected schedule and duration.", multiline: true },
    { name: "additional", label: "Additional terms", value: "Add any other terms for the parties to review.", multiline: true },
  ],
  form: [
    { name: "title", label: "Form title", value: "Information Form" },
    { name: "intro", label: "Introduction", value: "Please complete the following information.", multiline: true },
    { name: "name", label: "Name", value: "" },
    { name: "contact", label: "Contact details", value: "" },
    { name: "questions", label: "Questions / fields (one per line)", value: "Address\nPreferred date\nAdditional details", multiline: true },
    { name: "instructions", label: "Instructions", value: "Return this form to the person who shared it.", multiline: true },
  ],
};

const templateLabels: Record<TemplateKind, string> = { invoice: "Invoice", agreement: "Agreement", form: "Form" };
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const safeName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 70) || "document";

function makeDocx(paragraphs: Array<{ text: string; style?: string }>) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="234B3A"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`);
  const body = paragraphs.map(({ text, style }, index) => {
    const pStyle = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : index === 0 ? `<w:pPr><w:pStyle w:val="Title"/></w:pPr>` : "";
    return `<w:p>${pStyle}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  }).join("");
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function templateDocument(kind: TemplateKind, values: Record<string, string>) {
  const get = (key: string) => values[key]?.trim() || "—";
  if (kind === "invoice") {
    const items = get("items").split(/\r?\n/).filter(Boolean);
    return [
      { text: "INVOICE" }, { text: `Invoice ${get("invoiceNo")}`, style: "Heading1" },
      { text: `From: ${get("business")}` }, { text: `Bill to: ${get("client")}` },
      { text: `Issue date: ${get("date")}    Due date: ${get("due")}` },
      { text: "ITEMS", style: "Heading1" }, ...items.map((item) => ({ text: item })),
      { text: `Currency: ${get("currency")}` }, { text: "PAYMENT NOTES", style: "Heading1" }, { text: get("notes") },
    ];
  }
  if (kind === "agreement") {
    return [
      { text: get("title") }, { text: `Effective date: ${get("effective")}` },
      { text: "PARTIES", style: "Heading1" }, { text: `First party: ${get("partyA")}` }, { text: `Second party: ${get("partyB")}` },
      { text: "SCOPE OF WORK", style: "Heading1" }, { text: get("scope") },
      { text: "PAYMENT TERMS", style: "Heading1" }, { text: get("payment") },
      { text: "TERM AND TIMELINE", style: "Heading1" }, { text: get("timeline") },
      { text: "ADDITIONAL TERMS", style: "Heading1" }, { text: get("additional") },
      { text: "SIGNATURES", style: "Heading1" }, { text: `${get("partyA")}: ____________________    Date: __________` },
      { text: `${get("partyB")}: ____________________    Date: __________` },
    ];
  }
  const questions = get("questions").split(/\r?\n/).filter(Boolean);
  return [
    { text: get("title") }, { text: get("intro") }, { text: "CONTACT INFORMATION", style: "Heading1" },
    { text: `Name: ${get("name")}` }, { text: `Contact details: ${get("contact")}` },
    { text: "QUESTIONS", style: "Heading1" }, ...questions.map((question) => ({ text: `${question}: __________________________________________` })),
    { text: "INSTRUCTIONS", style: "Heading1" }, { text: get("instructions") },
  ];
}

async function createPdf(paragraphs: Array<{ text: string; style?: string }>) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 52;
  let page = pdf.addPage([612, 792]);
  let y = page.getHeight() - margin;
  for (const [index, paragraph] of paragraphs.entries()) {
    const isHeading = paragraph.style === "Heading1" || index === 0;
    const size = index === 0 ? 22 : isHeading ? 13 : 10.5;
    const leading = size * 1.55;
    const face = isHeading ? bold : font;
    const maxWidth = page.getWidth() - margin * 2;
    const words = paragraph.text.split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && face.widthOfTextAtSize(next, size) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    y -= isHeading && index > 0 ? 12 : 5;
    for (const lineText of lines) {
      if (y < margin + leading) { page = pdf.addPage([612, 792]); y = page.getHeight() - margin; }
      page.drawText(lineText, { x: margin, y, size, font: face, color: isHeading ? rgb(0.14, 0.29, 0.23) : rgb(0.19, 0.22, 0.2) });
      y -= leading;
    }
  }
  return new Blob([await pdf.save()], { type: "application/pdf" });
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
  const paragraphs: Array<{ text: string }> = [];
  let charCount = 0;
  try {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let row: string[] = [];
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const currentY = item.transform[5];
        if (lastY !== undefined && Math.abs(currentY - lastY) > 3 && row.length) { lines.push(row.join(" ")); row = []; }
        if (item.str.trim()) row.push(item.str.trim());
        lastY = currentY;
      }
      if (row.length) lines.push(row.join(" "));
      for (const text of lines) {
        charCount += text.length;
        if (charCount > MAX_EXTRACTED_CHARS) throw new Error("Extracted text exceeds the 120,000-character limit.");
        paragraphs.push({ text });
      }
      paragraphs.push({ text: "" });
      page.cleanup();
      progress(Math.round(((offset + i / pdf.numPages) / total) * 100));
    }
  } finally { await pdf.destroy(); }
  if (!paragraphs.some(({ text }) => text.trim())) throw new Error("No selectable text was found. Scanned PDFs need OCR before they can be converted to editable Word text.");
  return makeDocx(paragraphs);
}

async function docxToPdf(file: File) {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error(`${file.name} is not a readable DOCX file.`);
  const xml = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error(`${file.name} contains malformed document content.`);
  const paragraphs = Array.from(xml.getElementsByTagName("w:p")).map((paragraph) => ({
    text: Array.from(paragraph.getElementsByTagName("w:t")).map((node) => node.textContent ?? "").join(""),
    style: paragraph.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? undefined,
  })).filter((paragraph) => paragraph.text.trim());
  if (!paragraphs.length) throw new Error(`${file.name} has no readable text to convert.`);
  if (paragraphs.reduce((sum, item) => sum + item.text.length, 0) > MAX_EXTRACTED_CHARS) throw new Error("Document text exceeds the 120,000-character limit.");
  return createPdf(paragraphs);
}

export function DocumentToolsPage() {
  const [mode, setMode] = useState<"convert" | "templates">("convert");
  const [conversion, setConversion] = useState<Conversion>("images-pdf");
  const [files, setFiles] = useState<File[]>([]);
  const [template, setTemplate] = useState<TemplateKind>("invoice");
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries(templateFields.invoice.map((field) => [field.name, field.value])));
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
          const blob = await docxToPdf(file); results.push({ name: `${safeName(file.name)}.pdf`, blob });
          setProgress(Math.round(((i + 1) / files.length) * 100));
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

  async function generateTemplate(type: "pdf" | "docx") {
    setWorking(true); setError(""); setArtifacts([]);
    try {
      const paragraphs = templateDocument(template, fields);
      const blob = type === "pdf" ? await createPdf(paragraphs) : await makeDocx(paragraphs);
      const name = `${template}-${new Date().toISOString().slice(0, 10)}.${type === "pdf" ? "pdf" : "docx"}`;
      setArtifacts([{ name, blob, url: URL.createObjectURL(blob) }]);
    } catch { setError("The template could not be generated. Please try again."); }
    finally { setWorking(false); }
  }

  function changeTemplate(next: TemplateKind) {
    setTemplate(next); setFields(Object.fromEntries(templateFields[next].map((field) => [field.name, field.value])));
    setArtifacts([]); setError("");
  }

  return (
    <main className="document-tools-page">
      <header className="dt-hero">
        <div className="dt-hero-copy">
          <p className="dt-kicker"><span /> YOUR DOCUMENT DESK</p>
          <h1>Make paperwork<br /><em>work for you.</em></h1>
          <p>Convert everyday files and create polished starting points for the documents you use most.</p>
        </div>
        <div className="dt-hero-note"><ShieldCheck size={18} /><span><strong>Private by design</strong><br />Files are processed in this browser.</span></div>
        <div className="dt-orbit" aria-hidden="true"><span>DOC</span><span>PDF</span><span>IMG</span></div>
      </header>

      <div className="dt-mode-tabs" role="group" aria-label="Document tools">
        <button type="button" aria-pressed={mode === "convert"} className={mode === "convert" ? "is-active" : ""} disabled={working} onClick={() => { setMode("convert"); setError(""); setArtifacts([]); }}><ArrowLeftRight size={16} /> Convert files</button>
        <button type="button" aria-pressed={mode === "templates"} className={mode === "templates" ? "is-active" : ""} disabled={working} onClick={() => { setMode("templates"); setError(""); setArtifacts([]); }}><FilePlus2 size={16} /> Start from a template</button>
      </div>

      {mode === "convert" ? (
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
          {(conversion === "docx-pdf" || conversion === "pdf-docx") && <p className="dt-caveat"><FileWarning size={16} /> {conversion === "docx-pdf" ? "Text and basic paragraph structure are retained; original fonts, images, tables, and page layout may change. Legacy .doc files are not supported." : "This creates an editable text-first document. Scanned pages need OCR; columns, tables, images, and exact layout are not reconstructed."}</p>}
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
      ) : (
        <section className="dt-workspace dt-template-workspace" aria-labelledby="dt-template-title">
          <div className="dt-panel-heading"><div><p className="dt-section-index">02 / DOCUMENT STARTERS</p><h2 id="dt-template-title">A useful first draft</h2></div><span className="dt-local-tag"><span /> EDITABLE</span></div>
          <div className="dt-template-layout">
            <aside className="dt-template-rail" aria-label="Choose a template">
              {(Object.keys(templateLabels) as TemplateKind[]).map((item, index) => <button key={item} type="button" aria-pressed={template === item} disabled={working} className={template === item ? "is-selected" : ""} onClick={() => changeTemplate(item)}><span>0{index + 1}</span><strong>{templateLabels[item]}</strong><small>{item === "invoice" ? "Billing & payment" : item === "agreement" ? "Parties & terms" : "Questions & details"}</small></button>)}
              {template === "agreement" && <p className="dt-legal-note"><FileWarning size={15} /> This is a general starting point, not legal advice. Review and adapt it for your needs; consider qualified legal counsel before signing.</p>}
            </aside>
            <div className="dt-fields-area">
              <div className="dt-fields-title"><div><WandSparkles size={17} /><strong>{templateLabels[template]} details</strong></div><span>All fields are editable</span></div>
              <div className="dt-fields-grid">
                {templateFields[template].map((field) => <label key={field.name} className={field.multiline ? "is-wide" : ""}>{field.label}{field.multiline
                  ? <textarea disabled={working} value={fields[field.name] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [field.name]: event.target.value }))} rows={field.name === "items" || field.name === "questions" ? 4 : 3} maxLength={4000} />
                  : <input disabled={working} value={fields[field.name] ?? ""} onChange={(event) => setFields((current) => ({ ...current, [field.name]: event.target.value }))} maxLength={200} />}</label>)}
              </div>
              {template === "agreement" && <p className="dt-legal-inline">Please have the completed agreement reviewed for your jurisdiction and situation before use or signature.</p>}
              {error && <p className="dt-alert" role="alert"><FileWarning size={16} />{error}</p>}
              <div className="dt-template-actions"><span>Export as</span><button type="button" className="dt-secondary" disabled={working} onClick={() => generateTemplate("docx")}><FileText size={16} /> Word</button><button type="button" className="dt-primary" disabled={working} onClick={() => generateTemplate("pdf")}>{working ? <LoaderCircle size={16} className="dt-spin" /> : <Download size={16} />} PDF</button></div>
              {artifacts.length > 0 && <div className="dt-results dt-template-result" role="status"><div><span className="dt-success-icon"><Check size={17} /></span><div><strong>Your {templateLabels[template].toLowerCase()} is ready</strong><small>Review the document and fill in any remaining details.</small></div></div>{artifacts.map((artifact) => <a key={artifact.url} href={artifact.url} download={artifact.name}><Download size={15} /> Download {artifact.name}</a>)}</div>}
            </div>
          </div>
        </section>
      )}
      <footer className="dt-footer"><span><Files size={14} /> A little less busywork.</span><span>Conversions are browser-based; large files may take a moment.</span></footer>
    </main>
  );
}
