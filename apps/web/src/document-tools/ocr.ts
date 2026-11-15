export interface OcrProgress {
  label: string;
  percent: number;
}

const MAX_PDF_PAGES = 20;
const MAX_RENDER_EDGE = 2200;
const MAX_TEXT_CHARACTERS = 100_000;

function ensureTextFits(text: string) {
  const normalized = text.replace(/\u0000/g, "").trim();
  if (!normalized) throw new Error("No readable text was found. Try a clearer image or a higher-quality scan.");
  if (normalized.length > MAX_TEXT_CHARACTERS) {
    throw new Error("The recognised text is too long to store as one search index. Try a shorter document.");
  }
  return normalized;
}

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

async function extractOfficeText(file: File, extension: string) {
  if (["xlsx", "xls", "csv", "tsv"].includes(extension)) {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    return workbook.SheetNames
      .map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name]))
      .filter(Boolean)
      .join("\n\n");
  }

  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(file);
  if (extension === "docx") {
    const document = archive.file("word/document.xml");
    if (!document) throw new Error("The document content could not be found.");
    const xml = new DOMParser().parseFromString(await document.async("text"), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This document is damaged or uses an unsupported format.");
    return Array.from(xml.getElementsByTagNameNS("*", "p"))
      .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t"))
        .map((text) => text.textContent ?? "")
        .join(""))
      .join("\n");
  }

  const slides = Object.keys(archive.files)
    .map((path) => ({ path, match: path.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((entry): entry is { path: string; match: RegExpMatchArray } => Boolean(entry.match))
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (!slides.length) throw new Error("No slides were found in this presentation.");
  return (await Promise.all(slides.map(async ({ path }) => {
    const source = archive.file(path);
    if (!source) return "";
    const xml = new DOMParser().parseFromString(await source.async("text"), "application/xml");
    return Array.from(xml.getElementsByTagNameNS("*", "t"))
      .map((text) => text.textContent ?? "")
      .join(" ");
  }))).join("\n\n");
}

async function extractReadableText(file: File) {
  const extension = extensionOf(file.name);
  if (["docx", "xlsx", "xls", "csv", "tsv", "pptx"].includes(extension)) {
    return extractOfficeText(file, extension);
  }
  if (["txt", "md", "log", "json", "xml", "html", "htm"].includes(extension) || file.type.startsWith("text/")) {
    const content = await file.text();
    if (extension === "html" || extension === "htm") {
      const document = new DOMParser().parseFromString(content, "text/html");
      document.querySelectorAll("script, style, noscript").forEach((element) => element.remove());
      return document.body.textContent ?? "";
    }
    return content;
  }
  return null;
}

export async function extractDocumentText(
  file: File,
  onProgress: (progress: OcrProgress) => void,
): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) {
    const readableText = await extractReadableText(file);
    if (readableText !== null) {
      onProgress({ label: "Preparing searchable text…", percent: 98 });
      return ensureTextFits(readableText);
    }
    throw new Error("Text recognition supports PDFs, images, and common text and Office documents.");
  }

  const [pdfjs, pdfWorker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  let currentPage = 1;
  let totalPages = 1;
  const workerState: { promise: ReturnType<(typeof import("tesseract.js"))["createWorker"]> | null } = { promise: null };
  const ensureWorker = () => {
    workerState.promise ??= import("tesseract.js").then(({ createWorker }) => createWorker("eng", 1, {
        logger: (message) => {
          if (message.status !== "recognizing text") return;
          const percent = isImage
            ? Math.min(95, 5 + Math.round(message.progress * 90))
            : Math.min(95, Math.round(((currentPage - 1 + message.progress) / totalPages) * 90) + 5);
          onProgress({
            label: isImage ? "Recognising text in image…" : `Recognising text on page ${currentPage} of ${totalPages}…`,
            percent,
          });
        },
      }));
    return workerState.promise;
  };
  try {
    if (isImage) {
      onProgress({ label: "Recognising text in image…", percent: 5 });
      const { data } = await (await ensureWorker()).recognize(file);
      onProgress({ label: "Preparing searchable text…", percent: 98 });
      return ensureTextFits(data.text);
    }

    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    try {
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new Error(`This PDF has ${pdf.numPages} pages. OCR supports up to ${MAX_PDF_PAGES} pages at a time.`);
      }

      totalPages = pdf.numPages;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        currentPage = pageNumber;
        onProgress({ label: `Reading page ${pageNumber} of ${pdf.numPages}…`, percent: Math.round(((pageNumber - 1) / pdf.numPages) * 90) });
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const embeddedText = content.items
          .filter((item): item is typeof item & { str: string } => "str" in item && typeof item.str === "string")
          .map((item) => item.str)
          .join(" ")
          .trim();

        if (embeddedText.length > 20) {
          pages.push(embeddedText);
          page.cleanup();
          continue;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, MAX_RENDER_EDGE / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("This browser couldn’t prepare the PDF page for text recognition.");
        await page.render({ canvasContext: context, viewport }).promise;
        const { data } = await (await ensureWorker()).recognize(canvas);
        pages.push(data.text.trim());
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      onProgress({ label: "Preparing searchable text…", percent: 98 });
      return ensureTextFits(pages.filter(Boolean).join("\n\n"));
    } finally {
      await pdf.destroy();
    }
  } finally {
    if (workerState.promise) await (await workerState.promise).terminate();
  }
}
