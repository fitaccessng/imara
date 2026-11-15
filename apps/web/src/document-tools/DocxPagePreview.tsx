import { useEffect, useRef, useState } from "react";

const RENDER_OPTIONS = {
  className: "imara-docx",
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  renderHeaders: true,
  renderFooters: true,
  useBase64URL: true,
};

export function DocxPagePreview({ blob }: { blob: Blob }) {
  const stylesRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let active = true;
    const styles = stylesRef.current;
    const pages = pagesRef.current;
    if (!styles || !pages) return;
    styles.replaceChildren();
    pages.replaceChildren();
    setError("");
    setRendering(true);

    void import("docx-preview")
      .then(({ renderAsync }) => renderAsync(blob, pages, styles, RENDER_OPTIONS))
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "This Word document could not be rendered.");
          setRendering(false);
        }
      });

    return () => {
      active = false;
      styles.replaceChildren();
      pages.replaceChildren();
    };
  }, [blob]);

  return (
    <div className="docx-page-preview">
      {error
        ? <p className="form-alert office-preview-error" role="alert">{error}</p>
        : <>
          <div className="docx-preview-styles" ref={stylesRef} />
          <div className="docx-preview-pages" ref={pagesRef} />
          {rendering && <p className="docx-preview-loading" role="status">Rendering Word layout…</p>}
        </>}
    </div>
  );
}

export async function renderDocxAsPdf(blob: Blob, onProgress: (page: number, total: number) => void) {
  const host = document.createElement("div");
  const styles = document.createElement("div");
  const pages = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:max-content;z-index:-1;background:#fff;";
  pages.style.width = "max-content";
  host.append(styles, pages);
  document.body.append(host);

  try {
    const [{ renderAsync }, { default: html2canvas }, { PDFDocument }] = await Promise.all([
      import("docx-preview"),
      import("html2canvas"),
      import("pdf-lib"),
    ]);
    await renderAsync(blob, pages, styles, RENDER_OPTIONS);
    await document.fonts.ready;
    await Promise.all(Array.from(pages.querySelectorAll("img"), (image) => image.decode()));

    const renderedPages = Array.from(pages.querySelectorAll<HTMLElement>(".imara-docx"));
    if (!renderedPages.length) throw new Error("No Word pages could be rendered.");
    if (renderedPages.length > 60) throw new Error("This document has more than 60 pages. Split it into smaller files.");

    const pdf = await PDFDocument.create();
    let renderedPixels = 0;
    for (const [index, page] of renderedPages.entries()) {
      const { width, height } = page.getBoundingClientRect();
      if (!width || !height) throw new Error(`Word page ${index + 1} has no printable dimensions.`);
      const canvas = await html2canvas(page, { backgroundColor: "#ffffff", scale: 1.5, logging: false });
      renderedPixels += canvas.width * canvas.height;
      if (renderedPixels > 40_000_000) {
        canvas.width = 0;
        canvas.height = 0;
        throw new Error("The rendered document exceeds the safe page-image limit. Split it into smaller files.");
      }

      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result
          ? resolve(result)
          : reject(new Error(`Word page ${index + 1} could not be exported.`)), "image/png");
      });
      const image = await pdf.embedPng(await imageBlob.arrayBuffer());
      const pdfPage = pdf.addPage([width * 0.75, height * 0.75]);
      pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() });
      canvas.width = 0;
      canvas.height = 0;
      onProgress(index + 1, renderedPages.length);
    }

    return new Blob([await pdf.save()], { type: "application/pdf" });
  } finally {
    host.remove();
  }
}
