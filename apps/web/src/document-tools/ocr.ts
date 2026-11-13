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

export async function extractDocumentText(
  file: File,
  onProgress: (progress: OcrProgress) => void,
): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isImage && !isPdf) {
    throw new Error("Text recognition is available for image files and PDFs.");
  }

  const [pdfjs, tesseract, pdfWorker] = await Promise.all([
    import("pdfjs-dist"),
    import("tesseract.js"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;

  let currentPage = 1;
  let totalPages = 1;
  const workerState: { promise: ReturnType<typeof tesseract.createWorker> | null } = { promise: null };
  const ensureWorker = () => {
    workerState.promise ??= tesseract.createWorker("eng", 1, {
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
    });
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
