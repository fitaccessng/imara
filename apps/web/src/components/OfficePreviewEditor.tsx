import { useEffect, useMemo, useState } from "react";
import { FileText, LoaderCircle, Pencil, Save, X } from "lucide-react";
import type * as XLSX from "@e965/xlsx";
import type JSZip from "jszip";
import { apiRequest } from "../lib/api";
import { PlanLimitMessage } from "./PlanLimitMessage";
import type { ViewableFile } from "./FileViewerModal";

interface OfficePreviewEditorProps {
  file: Pick<ViewableFile, "name" | "mimeType">;
  blob: Blob;
  saveUrl: string;
  canEdit: boolean;
  maxUploadBytes?: number;
  onSaved: (updatedBlob: Blob) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

interface OfficePreviewData {
  workbook?: XLSX.WorkBook;
  archive?: JSZip;
  paragraphs?: string[];
  paragraphXml?: string;
  slides?: string[][];
  slideXmls?: { path: string; xml: string; text: string[] }[];
}

const PREVIEW_ROWS = 120;
const PREVIEW_COLUMNS = 26;

interface GridRange {
  start: { row: number; column: number };
  end: { row: number; column: number };
}

interface SpreadsheetCell {
  w?: string;
  v?: unknown;
  t?: string;
  f?: string;
  F?: string;
}

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function columnIndex(name: string) {
  return [...name.toUpperCase()].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function cellReference(row: number, column: number) {
  return `${columnName(column)}${row + 1}`;
}

function decodeCellReference(reference: string) {
  const match = reference.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return { row: 0, column: 0 };
  return { row: Number(match[2]) - 1, column: columnIndex(match[1]) };
}

function decodeGridRange(reference?: string): GridRange {
  if (!reference) return { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } };
  const [start, end = start] = reference.split(":");
  return { start: decodeCellReference(start), end: decodeCellReference(end) };
}

async function loadOfficePreview(file: Pick<ViewableFile, "name" | "mimeType">, blob: Blob): Promise<OfficePreviewData> {
  const extension = extensionOf(file.name);
  if (extension === "doc" || extension === "ppt") {
    throw new Error("Legacy .doc and .ppt files are not supported by this browser preview. Convert them to DOCX or PPTX first.");
  }
  if (extension === "xlsx" || extension === "xls" || extension === "csv" || extension === "tsv") {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
    if (!workbook.SheetNames.length) throw new Error("This spreadsheet does not contain any worksheets.");
    return { workbook };
  }

  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(blob);
  if (extension === "docx" || extension === "doc") {
    const documentXml = archive.file("word/document.xml");
    if (!documentXml) throw new Error("The document content could not be found.");
    const xml = new DOMParser().parseFromString(await documentXml.async("text"), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This document is damaged or uses an unsupported format.");
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"))
      .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t"))
        .map((text) => text.textContent ?? "")
        .join(""));
    return { archive, paragraphs, paragraphXml: await documentXml.async("text") };
  }

  if (extension === "pptx" || extension === "ppt") {
    const presentation = archive.file("ppt/presentation.xml");
    const presentationXml = presentation
      ? new DOMParser().parseFromString(await presentation.async("text"), "application/xml")
      : null;
    const slideFiles = Object.keys(archive.files)
      .map((path) => ({ path, match: path.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
      .filter((entry): entry is { path: string; match: RegExpMatchArray } => Boolean(entry.match))
      .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
    const slideCount = presentationXml
      ? presentationXml.getElementsByTagNameNS("*", "sldId").length
      : 0;
    if (!slideFiles.length) throw new Error("No slides were found in this presentation.");
    const slideEntries = await Promise.all(slideFiles.slice(0, Math.max(slideCount, 1)).map(async ({ path }) => {
      const source = archive.file(path);
      if (!source) return { path, xml: "", text: [] };
      const sourceXml = await source.async("text");
      const xml = new DOMParser().parseFromString(sourceXml, "application/xml");
      return {
        path,
        xml: sourceXml,
        text: Array.from(xml.getElementsByTagNameNS("*", "t"))
          .map((text) => text.textContent ?? ""),
      };
    }));
    return { archive, slides: slideEntries.map((slide) => slide.text), slideXmls: slideEntries };
  }

  return {};
}

function displayCell(cell: SpreadsheetCell | undefined, raw = false): string {
  if (!cell) return "";
  if (!raw && cell.w !== undefined) return cell.w;
  if (cell.v instanceof Date) return cell.v.toLocaleString();
  return cell.v === undefined || cell.v === null ? "" : String(cell.v);
}

export function OfficePreviewEditor({ file, blob, saveUrl, canEdit, maxUploadBytes, onSaved, onDirtyChange }: OfficePreviewEditorProps) {
  const [preview, setPreview] = useState<OfficePreviewData | null>(null);
  const [activeSheet, setActiveSheet] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [annotationPage, setAnnotationPage] = useState(1);
  const [pdfUrl, setPdfUrl] = useState("");
  const [paragraphDrafts, setParagraphDrafts] = useState<string[]>([]);
  const [slideDrafts, setSlideDrafts] = useState<string[][]>([]);
  const [hasEdits, setHasEdits] = useState(false);
  const [changedCells, setChangedCells] = useState<string[]>([]);

  const extension = extensionOf(file.name);
  const spreadsheet = ["csv", "tsv", "xls", "xlsx"].includes(extension);
  const pdf = extension === "pdf";
  const activeWorksheet = preview?.workbook?.Sheets[activeSheet];
  const range = useMemo(() => decodeGridRange(activeWorksheet?.["!ref"]), [activeWorksheet]);
  const lastRow = Math.min(range.end.row, range.start.row + PREVIEW_ROWS - 1);
  const lastColumn = Math.min(range.end.column, PREVIEW_COLUMNS - 1);
  const columns = Array.from({ length: Math.max(lastColumn - range.start.column + 1, 1) }, (_, index) => range.start.column + index);
  const rows = Array.from({ length: Math.max(lastRow - range.start.row + 1, 1) }, (_, index) => range.start.row + index);

  function recordSaveError(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }

  useEffect(() => {
    onDirtyChange(hasEdits);
  }, [hasEdits, onDirtyChange]);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError("");
    if (pdf) {
      const nextUrl = URL.createObjectURL(blob);
      setPdfUrl(nextUrl);
      return () => {
        active = false;
        URL.revokeObjectURL(nextUrl);
      };
    }

    setPdfUrl("");
    void loadOfficePreview(file, blob)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        setActiveSheet(result.workbook?.SheetNames[0] ?? "");
        setParagraphDrafts(result.paragraphs ?? []);
        setSlideDrafts(result.slides ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "This file could not be previewed.");
      });
    return () => { active = false; };
  }, [file, blob, pdf]);

  function updateCell(row: number, column: number, value: string) {
    if (!preview?.workbook || !activeWorksheet) return;
    const address = cellReference(row, column);
    const current = activeWorksheet[address];
    if (value === "") {
      delete activeWorksheet[address];
    } else {
      const next = { ...(current ?? {}) };
      delete next.f;
      delete next.F;
      delete next.w;
      if (current?.t === "n" && Number.isFinite(Number(value))) {
        activeWorksheet[address] = { ...next, t: "n", v: Number(value) };
      } else {
        activeWorksheet[address] = { ...next, t: "s", v: value };
      }
    }
    setPreview({ ...preview, workbook: { ...preview.workbook, Sheets: { ...preview.workbook.Sheets } } });
    const change = `${activeSheet}!${address}`;
    setChangedCells((currentChanges) => currentChanges.includes(change) ? currentChanges : [...currentChanges, change]);
    setHasEdits(true);
  }

  async function startSpreadsheetEdit() {
    if (!spreadsheet) return;
    setBusy(true);
    setError("");
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
      setPreview((current) => ({ ...current, workbook }));
      setActiveSheet(workbook.SheetNames[0] ?? "");
      setEditing(true);
      setChangedCells([]);
      setHasEdits(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to prepare this spreadsheet for editing.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSpreadsheetEdit() {
    setError("");
    try {
      const XLSX = await import("@e965/xlsx");
      const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
      setPreview((current) => ({ ...current, workbook }));
      setActiveSheet(workbook.SheetNames[0] ?? "");
      setEditing(false);
      setChangedCells([]);
      setHasEdits(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to discard spreadsheet changes.");
    }
  }

  async function saveSpreadsheet() {
    if (!preview?.workbook || !activeWorksheet) return;
    if (!changedCells.length) {
      setEditing(false);
      setHasEdits(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const XLSX = await import("@e965/xlsx");
      const delimited = extension === "csv" || extension === "tsv";
      const output = delimited
        ? XLSX.utils.sheet_to_csv(activeWorksheet, { FS: extension === "tsv" ? "\t" : "," })
        : XLSX.write(preview.workbook, {
          bookType: extension === "xls" ? "xls" : "xlsx",
          type: "array",
        });
      const updatedBlob = new Blob([output], { type: file.mimeType });
      const displayedChanges = changedCells.slice(0, 10);
      const extraChanges = changedCells.length - displayedChanges.length;
      const changeSummary = `Edited ${changedCells.length} spreadsheet cell${changedCells.length === 1 ? "" : "s"}${displayedChanges.length ? `: ${displayedChanges.join(", ")}${extraChanges > 0 ? `, and ${extraChanges} more` : ""}` : ""}`;
      await upload(updatedBlob, changeSummary);
      setEditing(false);
      setChangedCells([]);
      setHasEdits(false);
    } catch (reason) {
      recordSaveError(reason, "Unable to save this spreadsheet.");
    } finally {
      setBusy(false);
    }
  }

  async function savePdfAnnotation() {
    if (!annotation.trim()) {
      setError("Enter a note before saving the annotation.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!/^[\x20-\x7e\s]*$/.test(annotation)) {
        throw new Error("PDF notes currently support basic English characters and punctuation.");
      }
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const document = await PDFDocument.load(await blob.arrayBuffer());
      if (!Number.isInteger(annotationPage) || annotationPage < 1 || annotationPage > document.getPageCount()) {
        throw new Error(`Choose a page number from 1 to ${document.getPageCount()}.`);
      }
      const page = document.getPage(annotationPage - 1);
      const font = await document.embedFont(StandardFonts.Helvetica);
      const maxWidth = Math.max(page.getWidth() - 96, 80);
      const note = annotation.trim();
      const lines: string[] = [];
      let line = "";
      for (const word of note.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, 11) > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      const margin = 48;
      const lineHeight = 15;
      if (lines.length * lineHeight > page.getHeight() - margin * 2) {
        throw new Error("The annotation is too long to fit on this page.");
      }
      lines.forEach((text, index) => page.drawText(text, {
        x: margin,
        y: page.getHeight() - margin - 14 - index * lineHeight,
        size: 11,
        font,
        color: rgb(0.06, 0.17, 0.27),
        maxWidth,
      }));
      const updatedBlob = new Blob([await document.save()], { type: "application/pdf" });
      await upload(updatedBlob, `Added a note to PDF page ${annotationPage}`);
      setAnnotation("");
      setEditing(false);
      setHasEdits(false);
    } catch (reason) {
      recordSaveError(reason, "Unable to save the PDF annotation.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(updatedBlob: Blob, changeSummary: string) {
    if (typeof maxUploadBytes !== "number" || !Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1) {
      throw new Error("Your upload limit could not be checked. Refresh the page before uploading.");
    }
    if (updatedBlob.size > maxUploadBytes) {
      throw new Error(`The edited file exceeds your plan’s ${Math.round(maxUploadBytes / 1024 ** 2)} MiB upload limit. Upgrade your plan for larger files.`);
    }
    const updatedFile = new File([updatedBlob], file.name, { type: file.mimeType });
    const body = new FormData();
    body.append("file", updatedFile);
    body.append("changeSummary", changeSummary.slice(0, 200));
    await apiRequest(saveUrl, { method: "PATCH", body });
    await onSaved(updatedBlob);
  }

  async function saveTextDocument() {
    if (!preview?.archive || !preview.paragraphXml || !preview.paragraphs) return;
    const changedParagraphs = preview.paragraphs
      .map((_, index) => index)
      .filter((index) => (preview.paragraphs?.[index] ?? "") !== (paragraphDrafts[index] ?? ""));
    if (!changedParagraphs.length) {
      setEditing(false);
      setHasEdits(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const xml = new DOMParser().parseFromString(preview.paragraphXml, "application/xml");
      if (xml.querySelector("parsererror")) throw new Error("The document text could not be updated.");
      const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"));
      paragraphs.forEach((paragraph, index) => {
        const textNodes = Array.from(paragraph.getElementsByTagNameNS("*", "t"));
        if (!textNodes.length) {
          if (paragraphDrafts[index]) {
            const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
            const run = xml.createElementNS(namespace, "w:r");
            const text = xml.createElementNS(namespace, "w:t");
            text.textContent = paragraphDrafts[index];
            run.appendChild(text);
            paragraph.appendChild(run);
          }
          return;
        }
        textNodes[0].textContent = paragraphDrafts[index] ?? "";
        textNodes[0].setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        for (const text of textNodes.slice(1)) text.textContent = "";
      });
      const source = new XMLSerializer().serializeToString(xml);
      preview.archive.file("word/document.xml", source);
      const updatedBlob = await preview.archive.generateAsync({ type: "blob", mimeType: file.mimeType });
      const references = changedParagraphs.slice(0, 10).map((index) => `paragraph ${index + 1}`);
      const extraChanges = changedParagraphs.length - references.length;
      const summary = `Edited ${changedParagraphs.length} document paragraph${changedParagraphs.length === 1 ? "" : "s"}${references.length ? `: ${references.join(", ")}${extraChanges > 0 ? `, and ${extraChanges} more` : ""}` : ""}`;
      await upload(updatedBlob, summary);
      setPreview({ ...preview, paragraphXml: source, paragraphs: [...paragraphDrafts] });
      setEditing(false);
      setHasEdits(false);
    } catch (reason) {
      recordSaveError(reason, "Unable to save document text.");
    } finally {
      setBusy(false);
    }
  }

  async function savePresentationText() {
    if (!preview?.archive || !preview.slideXmls) return;
    const hasTextChanges = preview.slideXmls.some((slide, slideIndex) =>
      slide.text.some((text, textIndex) => text !== (slideDrafts[slideIndex]?.[textIndex] ?? "")));
    if (!hasTextChanges) {
      setEditing(false);
      setHasEdits(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updatedSlides: { path: string; xml: string; text: string[] }[] = [];
      let changedTextCount = 0;
      const changedSlideNumbers = new Set<number>();
      for (const [slideIndex, slide] of preview.slideXmls.entries()) {
        const xml = new DOMParser().parseFromString(slide.xml, "application/xml");
        if (xml.querySelector("parsererror")) throw new Error(`Slide ${slideIndex + 1} could not be updated.`);
        const textNodes = Array.from(xml.getElementsByTagNameNS("*", "t"));
        textNodes.forEach((text, textIndex) => {
          if ((slide.text[textIndex] ?? "") !== (slideDrafts[slideIndex]?.[textIndex] ?? "")) {
            changedTextCount += 1;
            changedSlideNumbers.add(slideIndex + 1);
          }
          text.textContent = slideDrafts[slideIndex]?.[textIndex] ?? "";
        });
        const source = new XMLSerializer().serializeToString(xml);
        preview.archive.file(slide.path, source);
        updatedSlides.push({ ...slide, xml: source, text: slideDrafts[slideIndex] ?? [] });
      }
      const updatedBlob = await preview.archive.generateAsync({ type: "blob", mimeType: file.mimeType });
      const slides = [...changedSlideNumbers].slice(0, 10).map((number) => `slide ${number}`);
      const extraSlides = changedSlideNumbers.size - slides.length;
      await upload(updatedBlob, `Edited ${changedTextCount} text item${changedTextCount === 1 ? "" : "s"}${slides.length ? ` on ${slides.join(", ")}${extraSlides > 0 ? `, and ${extraSlides} more` : ""}` : ""}`);
      setPreview({ ...preview, slideXmls: updatedSlides, slides: slideDrafts.map((slide) => [...slide]) });
      setEditing(false);
      setHasEdits(false);
    } catch (reason) {
      recordSaveError(reason, "Unable to save presentation text.");
    } finally {
      setBusy(false);
    }
  }

  if (pdf) {
    return (
      <div className="office-preview">
        <div className="office-preview-toolbar">
          {canEdit && !editing && <button className="button button-outline" onClick={() => setEditing(true)}><Pencil size={15} />Edit PDF</button>}
          {editing && <>
            <label htmlFor="pdf-annotation-page">Page</label>
            <input id="pdf-annotation-page" type="number" min={1} value={annotationPage} onChange={(event) => setAnnotationPage(Number(event.target.value))} aria-label="PDF page number" />
            <input value={annotation} maxLength={1000} onChange={(event) => { setAnnotation(event.target.value); setHasEdits(Boolean(event.target.value.trim())); }} placeholder="Add a note to this page" aria-label="PDF note text" />
            <button className="button button-green" onClick={() => void savePdfAnnotation()} disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save note"}</button>
            <button className="button button-outline" onClick={() => { setEditing(false); setError(""); setAnnotation(""); setHasEdits(false); }} disabled={busy}><X size={15} />Cancel</button>
          </>}
        </div>
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        {editing && <p className="office-preview-hint">Notes are added at the top of the selected page and saved as a new version of this PDF.</p>}
        {pdfUrl && <iframe className="file-pdf-preview" src={pdfUrl} title={file.name} />}
      </div>
    );
  }

  if (spreadsheet && preview?.workbook && activeWorksheet) {
    return (
      <div className="office-preview office-spreadsheet">
        <div className="office-preview-toolbar">
          <div className="office-sheet-tabs" role="tablist" aria-label="Spreadsheet sheets">
            {preview.workbook.SheetNames.map((sheet) => <button
              key={sheet}
              role="tab"
              aria-selected={activeSheet === sheet}
              className={activeSheet === sheet ? "active" : ""}
              onClick={() => setActiveSheet(sheet)}
            >{sheet}</button>)}
          </div>
          {canEdit && (editing
            ? <><button className="button button-green" onClick={() => void saveSpreadsheet()} disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save changes"}</button><button className="button button-outline" onClick={() => void cancelSpreadsheetEdit()} disabled={busy}>Cancel</button></>
            : <button className="button button-outline" onClick={() => void startSpreadsheetEdit()} disabled={busy}><Pencil size={15} />Edit sheet</button>)}
        </div>
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        <div className="office-sheet-scroll">
          <table className="office-sheet-grid">
            <thead><tr>            <th aria-label="Row number" />{columns.map((column) => <th key={column}>{columnName(column)}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row}>
              <th>{row + 1}</th>
              {columns.map((column) => {
                const address = cellReference(row, column);
                const value = displayCell(activeWorksheet[address], editing);
                return <td key={address}>{editing
                  ? <input aria-label={`Cell ${address}`} value={value} onChange={(event) => updateCell(row, column, event.target.value)} />
                  : value}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {range.end.row - range.start.row + 1 > PREVIEW_ROWS || range.end.column - range.start.column + 1 > PREVIEW_COLUMNS
          ? <p className="office-preview-hint">Showing the first {PREVIEW_ROWS} rows and {PREVIEW_COLUMNS} columns.</p>
          : null}
      </div>
    );
  }

  if (preview?.paragraphs) {
    return (
      <div className="office-preview office-document-preview">
        <div className="office-preview-toolbar">
          {canEdit && (editing
            ? <><button className="button button-green" onClick={() => void saveTextDocument()} disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save text"}</button><button className="button button-outline" onClick={() => { setParagraphDrafts([...preview.paragraphs!]); setEditing(false); setHasEdits(false); }} disabled={busy}><X size={15} />Cancel</button></>
            : <button className="button button-outline" onClick={() => { setParagraphDrafts([...preview.paragraphs!]); setEditing(true); setHasEdits(true); }}><Pencil size={15} />Edit text</button>)}
        </div>
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        {preview.paragraphs.length
          ? preview.paragraphs.map((paragraph, index) => editing
            ? <textarea key={index} aria-label={`Edit paragraph ${index + 1}`} value={paragraphDrafts[index] ?? ""} onChange={(event) => setParagraphDrafts((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />
            : <p key={index}>{paragraph || "\u00a0"}</p>)
          : <div className="file-viewer-state"><FileText size={28} /><h3>No readable text found</h3><p>This document may contain content that this lightweight preview cannot display.</p></div>}
        <p className="office-preview-hint">Basic text view and editing. Layout and images remain in the document; paragraph edits may flatten mixed text styling within that paragraph.</p>
      </div>
    );
  }

  if (preview?.slides) {
    return (
      <div className="office-preview office-slide-preview">
        <div className="office-preview-toolbar office-slide-toolbar">
          {canEdit && (editing
            ? <><button className="button button-green" onClick={() => void savePresentationText()} disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save text"}</button><button className="button button-outline" onClick={() => { setSlideDrafts(preview.slides!.map((slide) => [...slide])); setEditing(false); setHasEdits(false); }} disabled={busy}><X size={15} />Cancel</button></>
            : <button className="button button-outline" onClick={() => { setSlideDrafts(preview.slides!.map((slide) => [...slide])); setEditing(true); setHasEdits(true); }}><Pencil size={15} />Edit text</button>)}
        </div>
        {preview.slides.map((slide, index) => <article className="office-slide-card" key={index}>
          <span>SLIDE {index + 1}</span>
          {slide.length ? slide.map((text, textIndex) => editing
            ? <input key={textIndex} aria-label={`Edit slide ${index + 1} text ${textIndex + 1}`} value={slideDrafts[index]?.[textIndex] ?? ""} onChange={(event) => setSlideDrafts((current) => current.map((items, slideIndex) => slideIndex === index ? items.map((item, itemIndex) => itemIndex === textIndex ? event.target.value : item) : items))} />
            : <p key={textIndex}>{text}</p>) : <p className="office-preview-hint">No readable text on this slide.</p>}
        </article>)}
        <p className="office-preview-hint">Text preview and editing. Images, layouts, and transitions remain in the presentation but aren’t shown here.</p>
      </div>
    );
  }

  return <div className="file-viewer-state">{error ? <p role="alert">{error}</p> : <><LoaderCircle size={20} className="file-viewer-spinner" />Preparing preview…</>}</div>;
}
