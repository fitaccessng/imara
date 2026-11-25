import { useState, type FormEvent } from "react";
import { FilePlus2, X } from "lucide-react";
import type { ViewableFile } from "./FileViewerModal";

type DocumentFormat = "docx" | "xls" | "xlsx" | "pdf";

const MIME_TYPES: Record<DocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

async function createDocument(format: DocumentFormat, name: string) {
  if (format === "xlsx" || format === "xls") {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), "Sheet1");
    const contents = XLSX.write(workbook, { bookType: format, type: "array" });
    return new File([contents], name, { type: MIME_TYPES[format] });
  }

  if (format === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.create();
    document.addPage([612, 792]);
    document.setTitle(name);
    document.setSubject("IMARA editable document");
    return new File([await document.save()], name, { type: MIME_TYPES.pdf });
  }

  const { default: JSZip } = await import("jszip");
  const archive = new JSZip();
  archive.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  archive.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  archive.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve"></w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`);
  archive.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  archive.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  const contents = await archive.generateAsync({ type: "blob", mimeType: MIME_TYPES.docx });
  return new File([contents], name, { type: MIME_TYPES.docx });
}

export function CreateDocumentButton<T extends ViewableFile>({
  onCreate,
  onCreated,
  disabled = false,
}: {
  onCreate: (file: File) => Promise<T>;
  onCreated: (file: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<DocumentFormat>("docx");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseName = name.trim().replace(/\.(docx|xls|xlsx|pdf)$/i, "");
    if (!baseName) return;
    setSaving(true);
    setError("");
    try {
      const file = await createDocument(format, `${baseName}.${format}`);
      const created = await onCreate(file);
      setName("");
      setOpen(false);
      onCreated(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The document could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button className="button button-outline" type="button" disabled={disabled} onClick={() => setOpen(true)}>
      <FilePlus2 size={15} /> New document
    </button>
    {open && <div className="file-viewer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) setOpen(false);
    }}>
      <section className="folder-move-dialog create-document-dialog" role="dialog" aria-modal="true" aria-labelledby="create-document-title">
        <div className="folder-move-heading">
          <div><span className="eyebrow">YOUR DOCUMENT</span><h2 id="create-document-title">Create a document</h2></div>
          <button className="icon-button" type="button" aria-label="Close dialog" disabled={saving} onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <p>{format === "docx" ? "Your Word document opens ready to write, with formatting tools and DOCX saving." : format === "pdf" ? "Your PDF opens ready for page text, positioning, and adding pages." : "Your spreadsheet opens ready for cell entry, formulas, and worksheet editing."}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field" htmlFor="new-document-name">File name</label>
          <input id="new-document-name" className="folder-dialog-input" autoFocus maxLength={110} required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Project plan" />
          <label className="field" htmlFor="new-document-format">File type</label>
          <select id="new-document-format" className="folder-dialog-input" value={format} onChange={(event) => setFormat(event.target.value as DocumentFormat)}>
            <option value="docx">Word document (.docx)</option>
            <option value="xls">Excel spreadsheet (.xls)</option>
            <option value="xlsx">Spreadsheet (.xlsx)</option>
            <option value="pdf">PDF (.pdf)</option>
          </select>
          {error && <p className="form-alert" role="alert">{error}</p>}
          <div className="folder-move-actions">
            <button className="button button-outline" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
            <button className="button button-green" type="submit" disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create and open"}</button>
          </div>
        </form>
      </section>
    </div>}
  </>;
}
