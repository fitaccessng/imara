import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Eraser, Highlighter, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, LoaderCircle, Pencil, Redo2, Save, Search, Strikethrough, Underline, Undo2, X } from "lucide-react";
import type * as XLSX from "@e965/xlsx";
import type JSZip from "jszip";
import { apiRequest } from "../lib/api";
import { DocxPagePreview } from "../document-tools/DocxPagePreview";
import { PlanLimitMessage } from "./PlanLimitMessage";
import type { ViewableFile } from "./FileViewerModal";
import { colorHex, halfPointSize } from "./wordFormatting";

interface OfficePreviewEditorProps {
  file: Pick<ViewableFile, "name" | "mimeType">;
  blob: Blob;
  saveUrl: string;
  canEdit: boolean;
  maxUploadBytes?: number;
  onSaved: (updatedBlob: Blob) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onSave?: (updatedBlob: Blob, changeSummary: string) => Promise<void>;
}

interface OfficePreviewData {
  workbook?: XLSX.WorkBook;
  archive?: JSZip;
  paragraphs?: string[];
  paragraphHtml?: string[];
  paragraphXml?: string;
  wordReadOnlyReason?: string;
  slides?: string[][];
  slideXmls?: { path: string; xml: string; text: string[] }[];
}

const PREVIEW_ROWS = 120;
const PREVIEW_COLUMNS = 26;
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

interface DocumentBlock {
  element: Element;
  listKind?: "bullet" | "number";
}

function documentBlocks(html: string): DocumentBlock[] {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return [];
  const blocks: DocumentBlock[] = [];
  for (const child of Array.from(root.children)) {
    if (child.tagName === "UL" || child.tagName === "OL") {
      Array.from(child.children).filter((item) => item.tagName === "LI").forEach((item) => {
        blocks.push({ element: item, listKind: child.tagName === "UL" ? "bullet" : "number" });
      });
    } else {
      blocks.push({ element: child });
    }
  }
  return blocks;
}

function escapeHtmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wordHighlightColor(value: string) {
  const colors: Record<string, string> = {
    black: "#000000", blue: "#0000ff", cyan: "#00ffff", darkBlue: "#00008b",
    darkCyan: "#008b8b", darkGray: "#a9a9a9", darkGreen: "#006400",
    darkMagenta: "#8b008b", darkRed: "#8b0000", darkYellow: "#808000",
    green: "#00ff00", lightGray: "#d3d3d3", magenta: "#ff00ff",
    red: "#ff0000", white: "#ffffff", yellow: "#ffff00",
  };
  return colors[value] ?? (value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : null);
}

function wordParagraphHtml(paragraph: Element) {
  const paragraphProperties = Array.from(paragraph.children).find((child) => child.localName === "pPr");
  const styleValue = paragraphProperties
    ? Array.from(paragraphProperties.children).find((child) => child.localName === "pStyle")?.getAttributeNS(WORD_NAMESPACE, "val")
    : null;
  const tag = styleValue === "Heading1" ? "h1" : styleValue === "Heading2" ? "h2" : styleValue === "Heading3" ? "h3" : "p";
  const paragraphStyle: string[] = ["font-family:Arial", "line-height:1.15", "color:#000000"];
  if (tag === "p") {
    paragraphStyle.push(styleValue === "Title" ? "font-size:26pt" : styleValue === "Subtitle" ? "font-size:15pt" : "font-size:11pt");
  }
  const justification = paragraphProperties
    ? Array.from(paragraphProperties.children).find((child) => child.localName === "jc")?.getAttributeNS(WORD_NAMESPACE, "val")
    : null;
  if (justification && ["left", "center", "right", "both"].includes(justification)) {
    paragraphStyle.push(`text-align:${justification === "both" ? "justify" : justification}`);
  }
  const spacing = paragraphProperties
    ? Array.from(paragraphProperties.children).find((child) => child.localName === "spacing")
    : null;
  const line = Number(spacing?.getAttributeNS(WORD_NAMESPACE, "line"));
  if (Number.isFinite(line) && line > 0) paragraphStyle.push(`line-height:${line / 240}`);
  const after = Number(spacing?.getAttributeNS(WORD_NAMESPACE, "after"));
  if (Number.isFinite(after) && after > 0) paragraphStyle.push(`margin-bottom:${after / 20}pt`);
  const indent = Number(paragraphProperties
    ? Array.from(paragraphProperties.children).find((child) => child.localName === "ind")?.getAttributeNS(WORD_NAMESPACE, "left")
    : null);
  if (Number.isFinite(indent) && indent > 0) paragraphStyle.push(`margin-left:${indent / 20}pt`);

  const content = Array.from(paragraph.children).filter((child) => child.localName === "r").map((run) => {
    const runProperties = Array.from(run.children).find((child) => child.localName === "rPr");
    const runStyle: string[] = [];
    if (runProperties) {
      const fonts = Array.from(runProperties.children).find((child) => child.localName === "rFonts");
      const family = fonts?.getAttributeNS(WORD_NAMESPACE, "ascii") ?? fonts?.getAttributeNS(WORD_NAMESPACE, "hAnsi");
      if (family && ["Arial", "Aptos", "Calibri", "Georgia", "Times New Roman", "Verdana"].includes(family)) {
        runStyle.push(`font-family:${family}`);
      }
      const size = Number(Array.from(runProperties.children).find((child) => child.localName === "sz")?.getAttributeNS(WORD_NAMESPACE, "val"));
      if (Number.isFinite(size) && size > 0 && size <= 400) runStyle.push(`font-size:${size / 2}pt`);
      const color = Array.from(runProperties.children).find((child) => child.localName === "color")?.getAttributeNS(WORD_NAMESPACE, "val");
      if (color && /^[0-9a-f]{6}$/i.test(color)) runStyle.push(`color:#${color}`);
      const shading = Array.from(runProperties.children).find((child) => child.localName === "shd")?.getAttributeNS(WORD_NAMESPACE, "fill");
      if (shading && /^[0-9a-f]{6}$/i.test(shading)) runStyle.push(`background-color:#${shading}`);
      const highlight = Array.from(runProperties.children).find((child) => child.localName === "highlight")?.getAttributeNS(WORD_NAMESPACE, "val");
      const highlightColor = wordHighlightColor(highlight ?? "");
      if (highlightColor) runStyle.push(`background-color:${highlightColor}`);
    }
    let text = Array.from(run.children).filter((child) => ["t", "tab", "br"].includes(child.localName))
      .map((item) => item.localName === "t"
        ? escapeHtmlText(item.textContent ?? "")
        : item.localName === "tab" ? "&#9;" : "<br>").join("");
    if (runStyle.length) text = `<span style="${runStyle.join(";")}">${text}</span>`;
    const enabled = (name: string) => {
      const property = runProperties && Array.from(runProperties.children).find((child) => child.localName === name);
      const value = property?.getAttributeNS(WORD_NAMESPACE, "val");
      return Boolean(property) && value !== "0" && value !== "false" && value !== "none";
    };
    if (enabled("b")) text = `<strong>${text}</strong>`;
    if (enabled("i")) text = `<em>${text}</em>`;
    if (enabled("u")) text = `<u>${text}</u>`;
    if (enabled("strike")) text = `<s>${text}</s>`;
    return text;
  }).join("");
  const blockStyle = styleValue === "Title" || styleValue === "Subtitle"
    ? ` data-word-style="${styleValue}"` : "";
  return `<${tag}${blockStyle} style="${paragraphStyle.join(";")}">${content || "<br>"}</${tag}>`;
}

function sanitizeWordClipboardHtml(source: string) {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const allowedTags = new Set(["p", "h1", "h2", "h3", "div", "span", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "br", "font"]);
  const rejectedTags = new Set(["script", "style", "iframe", "object", "embed", "img", "table", "a", "svg", "math", "video", "audio"]);
  const allowedFonts = new Set(["Arial", "Aptos", "Calibri", "Georgia", "Times New Roman", "Verdana"]);
  let unsupported = false;

  function clean(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtmlText(node.textContent ?? "");
    if (!(node instanceof Element)) return "";
    const tag = node.tagName.toLowerCase();
    if (rejectedTags.has(tag)) {
      unsupported = true;
      return "";
    }
    const children = Array.from(node.childNodes).map(clean).join("");
    if (!allowedTags.has(tag)) return children;
    const style: string[] = [];
    if (node instanceof HTMLElement) {
      const family = node.style.fontFamily.replace(/["']/g, "").trim();
      if (allowedFonts.has(family)) style.push(`font-family:${family}`);
      const size = halfPointSize(node.style.fontSize);
      if (size) style.push(`font-size:${Number(size) / 2}pt`);
      const color = colorHex(node.style.color);
      if (color) style.push(`color:${color}`);
      const background = colorHex(node.style.backgroundColor);
      if (background) style.push(`background-color:${background}`);
      if (["left", "center", "right", "justify"].includes(node.style.textAlign)) {
        style.push(`text-align:${node.style.textAlign}`);
      }
      const lineHeight = Number(node.style.lineHeight);
      if (Number.isFinite(lineHeight) && lineHeight > 0 && lineHeight <= 3) style.push(`line-height:${lineHeight}`);
      for (const property of ["marginBottom", "marginLeft"] as const) {
        const measurement = node.style[property].match(/^(\d+(?:\.\d+)?)(pt|px)$/);
        const value = Number(measurement?.[1]);
        if (measurement && Number.isFinite(value) && value >= 0 && value <= 360) {
          style.push(`${property === "marginBottom" ? "margin-bottom" : "margin-left"}:${value}${measurement[2]}`);
        }
      }
    }
    const styleAttribute = style.length ? ` style="${style.join(";")}"` : "";
    return `<${tag}${styleAttribute}>${children}</${tag}>`;
  }

  return { html: Array.from(parsed.body.childNodes).map(clean).join(""), unsupported };
}

function appendWordRuns(xml: XMLDocument, paragraph: Element, element: Element, marks: Set<string> = new Set()) {
  const nextMarks = new Set(marks);
  const tag = element.tagName.toLowerCase();
  const style = element instanceof HTMLElement ? element.style : null;
  if (["b", "strong"].includes(tag)) nextMarks.add("bold");
  if (["i", "em"].includes(tag)) nextMarks.add("italic");
  if (tag === "u") nextMarks.add("underline");
  if (["s", "strike", "del"].includes(tag)) nextMarks.add("strike");
  if (tag === "h1") {
    nextMarks.add("bold");
    nextMarks.add("size:48");
  } else if (tag === "h2") {
    nextMarks.add("bold");
    nextMarks.add("size:36");
  } else if (tag === "h3") {
    nextMarks.add("bold");
    nextMarks.add("size:28");
  }
  const fontFamily = style?.fontFamily || (tag === "font" ? element.getAttribute("face") : "");
  const fontColor = style?.color || (tag === "font" ? element.getAttribute("color") : "");
  const fontSize = style?.fontSize;
  if (fontFamily) nextMarks.add(`font:${fontFamily.split(",")[0].replace(/["']/g, "").trim()}`);
  if (fontColor) {
    const normalized = colorHex(fontColor);
    if (normalized) nextMarks.add(`color:${normalized}`);
  }
  if (style?.backgroundColor) {
    const normalized = colorHex(style.backgroundColor);
    if (normalized) nextMarks.add(`highlight:${normalized}`);
  }
  if (fontSize) {
    const size = halfPointSize(fontSize);
    if (size) nextMarks.add(`size:${size}`);
  } else if (tag === "font") {
    const legacySize = element.getAttribute("size");
    const legacyPoints = legacySize ? [8, 10, 12, 14, 18, 24, 36][Number(legacySize) - 1] : undefined;
    if (legacyPoints) nextMarks.add(`size:${legacyPoints * 2}`);
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (!child.textContent) continue;
      const run = xml.createElementNS(WORD_NAMESPACE, "w:r");
      if (nextMarks.size) {
        const properties = xml.createElementNS(WORD_NAMESPACE, "w:rPr");
        for (const mark of nextMarks) {
          if (mark === "bold") properties.appendChild(xml.createElementNS(WORD_NAMESPACE, "w:b"));
          else if (mark === "italic") properties.appendChild(xml.createElementNS(WORD_NAMESPACE, "w:i"));
          else if (mark === "underline") {
            const underline = xml.createElementNS(WORD_NAMESPACE, "w:u");
            underline.setAttributeNS(WORD_NAMESPACE, "w:val", "single");
            properties.appendChild(underline);
          } else if (mark === "strike") properties.appendChild(xml.createElementNS(WORD_NAMESPACE, "w:strike"));
          else if (mark.startsWith("font:")) {
            const fonts = xml.createElementNS(WORD_NAMESPACE, "w:rFonts");
            fonts.setAttributeNS(WORD_NAMESPACE, "w:ascii", mark.slice(5));
            fonts.setAttributeNS(WORD_NAMESPACE, "w:hAnsi", mark.slice(5));
            properties.appendChild(fonts);
          } else if (mark.startsWith("color:")) {
            const color = colorHex(mark.slice(6))?.slice(1);
            if (color) {
              const colorElement = xml.createElementNS(WORD_NAMESPACE, "w:color");
              colorElement.setAttributeNS(WORD_NAMESPACE, "w:val", color);
              properties.appendChild(colorElement);
            }
          } else if (mark.startsWith("highlight:")) {
            const color = colorHex(mark.slice(10))?.slice(1);
            if (color) {
              const shading = xml.createElementNS(WORD_NAMESPACE, "w:shd");
              shading.setAttributeNS(WORD_NAMESPACE, "w:val", "clear");
              shading.setAttributeNS(WORD_NAMESPACE, "w:fill", color);
              properties.appendChild(shading);
            }
          } else if (mark.startsWith("size:")) {
            const size = mark.slice(5);
            if (/^\d+$/.test(size)) {
              const sizeElement = xml.createElementNS(WORD_NAMESPACE, "w:sz");
              sizeElement.setAttributeNS(WORD_NAMESPACE, "w:val", size);
              properties.appendChild(sizeElement);
            }
          }
        }
        if (properties.childNodes.length) run.appendChild(properties);
      }
      const text = xml.createElementNS(WORD_NAMESPACE, "w:t");
      text.textContent = child.textContent;
      if (/^\s|\s$/.test(child.textContent)) text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
      run.appendChild(text);
      paragraph.appendChild(run);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element;
      if (childElement.tagName.toLowerCase() === "br") {
        const run = xml.createElementNS(WORD_NAMESPACE, "w:r");
        run.appendChild(xml.createElementNS(WORD_NAMESPACE, "w:br"));
        paragraph.appendChild(run);
      } else {
        appendWordRuns(xml, paragraph, childElement, nextMarks);
      }
    }
  }
}

async function addNumberingDefinitions(archive: JSZip, blocks: DocumentBlock[]) {
  const kinds = [...new Set(blocks.map((block) => block.listKind).filter((kind): kind is "bullet" | "number" => Boolean(kind)))];
  if (!kinds.length) return new Map<"bullet" | "number", number>();

  const numberingFile = archive.file("word/numbering.xml");
  const numberingXml = numberingFile
    ? new DOMParser().parseFromString(await numberingFile.async("text"), "application/xml")
    : new DOMParser().parseFromString(`<w:numbering xmlns:w="${WORD_NAMESPACE}"/>`, "application/xml");
  if (numberingXml.querySelector("parsererror")) throw new Error("The document list formatting could not be updated.");
  const numberingRoot = numberingXml.documentElement;
  const abstractFormats = new Map(Array.from(numberingXml.getElementsByTagNameNS(WORD_NAMESPACE, "abstractNum"))
    .map((item) => [
      Number(item.getAttributeNS(WORD_NAMESPACE, "abstractNumId") ?? 0),
      item.getElementsByTagNameNS(WORD_NAMESPACE, "numFmt")[0]?.getAttributeNS(WORD_NAMESPACE, "val") ?? "",
    ]));
  const numberElements = Array.from(numberingXml.getElementsByTagNameNS(WORD_NAMESPACE, "num"));
  const abstractIds = Array.from(abstractFormats.keys());
  const numberIds = numberElements.map((item) => Number(item.getAttributeNS(WORD_NAMESPACE, "numId") ?? 0));
  let nextAbstractId = Math.max(0, ...abstractIds) + 1;
  let nextNumberId = Math.max(0, ...numberIds) + 1;
  const result = new Map<"bullet" | "number", number>();
  for (const kind of kinds) {
    const formatName = kind === "bullet" ? "bullet" : "decimal";
    const matchingNumber = numberElements.find((number) => {
      const abstractId = Number(number.getElementsByTagNameNS(WORD_NAMESPACE, "abstractNumId")[0]?.getAttributeNS(WORD_NAMESPACE, "val") ?? -1);
      return abstractFormats.get(abstractId) === formatName;
    });
    if (matchingNumber) {
      result.set(kind, Number(matchingNumber.getAttributeNS(WORD_NAMESPACE, "numId")));
      continue;
    }
    const abstractId = nextAbstractId++;
    const numberId = nextNumberId++;
    const abstract = numberingXml.createElementNS(WORD_NAMESPACE, "w:abstractNum");
    abstract.setAttributeNS(WORD_NAMESPACE, "w:abstractNumId", String(abstractId));
    const level = numberingXml.createElementNS(WORD_NAMESPACE, "w:lvl");
    level.setAttributeNS(WORD_NAMESPACE, "w:ilvl", "0");
    const start = numberingXml.createElementNS(WORD_NAMESPACE, "w:start");
    start.setAttributeNS(WORD_NAMESPACE, "w:val", "1");
    const format = numberingXml.createElementNS(WORD_NAMESPACE, "w:numFmt");
    format.setAttributeNS(WORD_NAMESPACE, "w:val", formatName);
    const text = numberingXml.createElementNS(WORD_NAMESPACE, "w:lvlText");
    text.setAttributeNS(WORD_NAMESPACE, "w:val", kind === "bullet" ? "•" : "%1.");
    level.append(start, format, text);
    abstract.appendChild(level);
    numberingRoot.appendChild(abstract);
    const number = numberingXml.createElementNS(WORD_NAMESPACE, "w:num");
    number.setAttributeNS(WORD_NAMESPACE, "w:numId", String(numberId));
    const abstractReference = numberingXml.createElementNS(WORD_NAMESPACE, "w:abstractNumId");
    abstractReference.setAttributeNS(WORD_NAMESPACE, "w:val", String(abstractId));
    number.appendChild(abstractReference);
    numberingRoot.appendChild(number);
    result.set(kind, numberId);
  }
  archive.file("word/numbering.xml", new XMLSerializer().serializeToString(numberingXml));

  const relationshipsFile = archive.file("word/_rels/document.xml.rels");
  const relationshipsXml = relationshipsFile
    ? new DOMParser().parseFromString(await relationshipsFile.async("text"), "application/xml")
    : new DOMParser().parseFromString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`, "application/xml");
  const relationshipsRoot = relationshipsXml.documentElement;
  const hasNumbering = Array.from(relationshipsXml.getElementsByTagNameNS("*", "Relationship"))
    .some((relationship) => relationship.getAttribute("Type")?.endsWith("/numbering"));
  if (!hasNumbering) {
    const existingIds = Array.from(relationshipsXml.getElementsByTagNameNS("*", "Relationship"))
      .map((relationship) => Number(relationship.getAttribute("Id")?.replace(/^rId/, "") ?? 0));
    const relationship = relationshipsXml.createElementNS(relationshipsRoot.namespaceURI, "Relationship");
    relationship.setAttribute("Id", `rId${Math.max(0, ...existingIds) + 1}`);
    relationship.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering");
    relationship.setAttribute("Target", "numbering.xml");
    relationshipsRoot.appendChild(relationship);
    archive.file("word/_rels/document.xml.rels", new XMLSerializer().serializeToString(relationshipsXml));
  }

  const contentTypesFile = archive.file("[Content_Types].xml");
  if (contentTypesFile) {
    const contentTypesXml = new DOMParser().parseFromString(await contentTypesFile.async("text"), "application/xml");
    const hasNumbering = Array.from(contentTypesXml.getElementsByTagNameNS("*", "Override"))
      .some((entry) => entry.getAttribute("PartName") === "/word/numbering.xml");
    if (!hasNumbering) {
      const override = contentTypesXml.createElementNS(contentTypesXml.documentElement.namespaceURI, "Override");
      override.setAttribute("PartName", "/word/numbering.xml");
      override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");
      contentTypesXml.documentElement.appendChild(override);
      archive.file("[Content_Types].xml", new XMLSerializer().serializeToString(contentTypesXml));
    }
  }
  return result;
}

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
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(blob);
  } catch (reason) {
    if (extension === "wps") {
      throw new Error("This WPS file uses a legacy format that browsers can’t preview. Convert it to DOCX or PDF and upload the converted file.");
    }
    throw reason;
  }
  if (extension === "wps" && !archive.file("word/document.xml")) {
    throw new Error("This WPS file uses a format this browser can’t preview. Convert it to DOCX or PDF and upload the converted file.");
  }
  if (extension === "docx" || extension === "doc" || extension === "wps") {
    const documentXml = archive.file("word/document.xml");
    if (!documentXml) throw new Error("The document content could not be found.");
    const xml = new DOMParser().parseFromString(await documentXml.async("text"), "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("This document is damaged or uses an unsupported format.");
    const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"))
      .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS("*", "t"))
        .map((text) => text.textContent ?? "")
        .join(""));
    const unsupportedFeatureNames: Array<[string, string]> = [
      ["tbl", "tables"],
      ["drawing", "images and diagrams"],
      ["pict", "embedded images"],
      ["hyperlink", "hyperlinks"],
      ["numPr", "numbered or bulleted list formatting"],
      ["sdt", "content controls"],
      ["footnoteReference", "footnotes"],
      ["endnoteReference", "endnotes"],
      ["pageBreakBefore", "manual page breaks"],
      ["lastRenderedPageBreak", "existing pagination"],
      ["bookmarkStart", "bookmarks"],
      ["bookmarkEnd", "bookmarks"],
      ["commentRangeStart", "comments"],
      ["commentRangeEnd", "comments"],
      ["commentReference", "comments"],
      ["permStart", "protected regions"],
      ["permEnd", "protected regions"],
      ["fldSimple", "document fields"],
      ["fldChar", "document fields"],
      ["instrText", "document fields"],
      ["altChunk", "embedded document content"],
      ["customXml", "custom XML content"],
      ["cr", "carriage-return line breaks"],
      ["noBreakHyphen", "special hyphen characters"],
    ];
    const unsupported = unsupportedFeatureNames.find(([localName]) => xml.getElementsByTagNameNS("*", localName).length > 0);
    const supportedRunProperties = new Set(["rFonts", "sz", "color", "shd", "highlight", "b", "i", "u", "strike"]);
    const supportedParagraphProperties = new Set(["pStyle", "jc", "spacing", "ind"]);
    const hasAdvancedFormatting = Array.from(xml.getElementsByTagNameNS("*", "rPr"))
      .some((properties) => Array.from(properties.children).some((property) => !supportedRunProperties.has(property.localName)))
      || Array.from(xml.getElementsByTagNameNS("*", "pPr"))
        .some((properties) => Array.from(properties.children).some((property) => !supportedParagraphProperties.has(property.localName)));
    const pageBreak = Array.from(xml.getElementsByTagNameNS("*", "br"))
      .some((lineBreak) => lineBreak.getAttributeNS(WORD_NAMESPACE, "type") === "page");
    return {
      archive,
      paragraphs,
      paragraphHtml: Array.from(xml.getElementsByTagNameNS("*", "p"), wordParagraphHtml),
      paragraphXml: await documentXml.async("text"),
      wordReadOnlyReason: unsupported || pageBreak || hasAdvancedFormatting
        ? `Editing is disabled to protect this document’s ${unsupported?.[1] ?? (pageBreak ? "manual page breaks" : "advanced formatting")}. Download it to make changes in a compatible editor, then upload the edited version.`
        : undefined,
    };
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
  if (cell.f && raw) return `=${cell.f}`;
  if (!raw && cell.w !== undefined) return cell.w;
  if (cell.v instanceof Date) return cell.v.toLocaleString();
  return cell.v === undefined || cell.v === null ? "" : String(cell.v);
}

export function OfficePreviewEditor({ file, blob, saveUrl, canEdit, maxUploadBytes, onSaved, onDirtyChange, onSave }: OfficePreviewEditorProps) {
  const [preview, setPreview] = useState<OfficePreviewData | null>(null);
  const [activeSheet, setActiveSheet] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [annotationPage, setAnnotationPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [pdfPagesToAdd, setPdfPagesToAdd] = useState(0);
  const [pdfX, setPdfX] = useState("8");
  const [pdfY, setPdfY] = useState("10");
  const [pdfFontSize, setPdfFontSize] = useState("14");
  const [pdfColor, setPdfColor] = useState("#172b3a");
  const [pdfUrl, setPdfUrl] = useState("");
  const [selectedCell, setSelectedCell] = useState("A1");
  const [slideDrafts, setSlideDrafts] = useState<string[][]>([]);
  const [hasEdits, setHasEdits] = useState(false);
  const [changedCells, setChangedCells] = useState<string[]>([]);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [replaceFeedback, setReplaceFeedback] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState("");
  const wordEditorRef = useRef<HTMLDivElement>(null);
  const wordSelectionRef = useRef<Range | null>(null);

  const extension = extensionOf(file.name);
  const spreadsheet = ["csv", "tsv", "xls", "xlsx"].includes(extension);
  const pdf = extension === "pdf";
  const activeWorksheet = preview?.workbook?.Sheets[activeSheet];
  const range = useMemo(() => decodeGridRange(activeWorksheet?.["!ref"]), [activeWorksheet]);
  const lastRow = Math.min(range.end.row, range.start.row + PREVIEW_ROWS - 1);
  const lastColumn = Math.min(range.end.column, PREVIEW_COLUMNS - 1);
  const columns = Array.from({ length: Math.max(lastColumn - range.start.column + 1, 1) }, (_, index) => range.start.column + index);
  const rows = Array.from({ length: Math.max(lastRow - range.start.row + 1, 1) }, (_, index) => range.start.row + index);
  const canAddSpreadsheetRow = range.end.row < range.start.row + PREVIEW_ROWS - 1;
  const canAddSpreadsheetColumn = range.end.column < PREVIEW_COLUMNS - 1;
  const selectedAddress = /^[A-Z]+\d+$/i.test(selectedCell) ? selectedCell.toUpperCase() : "A1";
  const selectedCellValue = activeWorksheet ? displayCell(activeWorksheet[selectedAddress], true) : "";

  function recordSaveError(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }

  function rememberWordSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !wordEditorRef.current?.contains(selection.anchorNode)) return;
    wordSelectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreWordSelection() {
    const editor = wordEditorRef.current;
    const range = wordSelectionRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) {
      editor?.focus();
      return false;
    }
    const selection = window.getSelection();
    if (!selection) return false;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function applyWordCommand(command: string, value?: string) {
    if (!wordEditorRef.current) return;
    restoreWordSelection();
    document.execCommand(command, false, value);
    rememberWordSelection();
    setHasEdits(true);
  }

  function applyWordInlineStyle(property: "fontFamily" | "fontSize" | "color" | "backgroundColor", value: string) {
    if (!wordEditorRef.current || !restoreWordSelection()) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    span.style[property] = value;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
    wordSelectionRef.current = nextRange.cloneRange();
    setHasEdits(true);
  }

  function applyWordBlockFormat(styleName: string) {
    const tags: Record<string, string> = {
      normal: "p",
      title: "p",
      subtitle: "p",
      heading1: "h1",
      heading2: "h2",
      heading3: "h3",
    };
    const tag = tags[styleName];
    if (!tag) return;
    applyWordCommand("formatBlock", `<${tag}>`);
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const block = node instanceof HTMLElement ? node.closest("p,h1,h2,h3") : node?.parentElement?.closest("p,h1,h2,h3");
    if (!(block instanceof HTMLElement) || !wordEditorRef.current?.contains(block)) return;
    block.removeAttribute("data-word-style");
    block.style.fontFamily = "";
    block.style.fontSize = "";
    block.style.fontWeight = "";
    block.style.color = "";
    if (styleName === "title" || styleName === "subtitle") {
      block.dataset.wordStyle = styleName === "title" ? "Title" : "Subtitle";
      block.style.fontFamily = "Arial";
      block.style.fontSize = styleName === "title" ? "26pt" : "15pt";
      block.style.fontWeight = styleName === "title" ? "700" : "400";
      if (styleName === "subtitle") block.style.color = "#5f6b65";
    }
    setHasEdits(true);
  }

  function applyWordParagraphStyle(property: "lineHeight" | "marginBottom", value: string) {
    if (!restoreWordSelection()) return;
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const block = node instanceof HTMLElement ? node.closest("p,h1,h2,h3") : node?.parentElement?.closest("p,h1,h2,h3");
    if (!(block instanceof HTMLElement) || !wordEditorRef.current?.contains(block)) return;
    block.style[property] = value;
    setHasEdits(true);
  }

  function replaceAllWordText() {
    const editor = wordEditorRef.current;
    const search = findText;
    if (!editor || !search) {
      setReplaceFeedback("Enter text to find.");
      return;
    }
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(escaped, "gi");
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let replaced = 0;
    let node = walker.nextNode();
    while (node) {
      const current = node.textContent ?? "";
      const matches = current.match(matcher);
      if (matches?.length) {
        replaced += matches.length;
        node.textContent = current.replace(matcher, replaceText);
      }
      node = walker.nextNode();
    }
    setReplaceFeedback(replaced ? `Replaced ${replaced} match${replaced === 1 ? "" : "es"}.` : "No matches found.");
    if (replaced) setHasEdits(true);
  }

  useEffect(() => {
    onDirtyChange(hasEdits);
  }, [hasEdits, onDirtyChange]);

  useEffect(() => {
    const handleSelectionChange = () => rememberWordSelection();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  useEffect(() => {
    if (!pdf) {
      setPdfUrl("");
      return;
    }
    const url = URL.createObjectURL(blob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob, pdf]);

  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void import("pdf-lib").then(async ({ PDFDocument }) => {
      const document = await PDFDocument.load(await blob.arrayBuffer());
      if (!active) return;
      const pageCount = document.getPageCount();
      setPdfPageCount(pageCount);
      setAnnotationPage((current) => Math.min(current, pageCount));
      setPdfPagesToAdd(0);
      if (canEdit && document.getSubject() === "IMARA editable document") {
        setEditing(true);
      }
    }).catch((reason: unknown) => {
      if (active) recordSaveError(reason, "Unable to prepare this PDF for editing.");
    });
    return () => { active = false; };
  }, [blob, canEdit, pdf]);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError("");
    if (pdf) return () => { active = false; };

    void loadOfficePreview(file, blob)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        setActiveSheet(result.workbook?.SheetNames[0] ?? "");
        setSlideDrafts(result.slides ?? []);
        const loadedSheets = result.workbook?.Sheets ?? {};
        const hasCellContent = Object.values(loadedSheets).some((sheet) =>
          Object.keys(sheet).some((key) => !key.startsWith("!") && Boolean(sheet[key] && (sheet[key].v !== undefined || sheet[key].f))),
        );
        if (canEdit && result.workbook && !hasCellContent) {
          setEditing(true);
          setSelectedCell("A1");
        }
        if (canEdit && result.paragraphs?.length && result.paragraphs.every((paragraph) => !paragraph.trim())) {
          setEditing(true);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "This file could not be previewed.");
      });
    return () => { active = false; };
  }, [file, blob, canEdit, pdf]);

  useEffect(() => {
    if (editing && preview?.paragraphs && wordEditorRef.current) {
      wordEditorRef.current.focus();
    }
  }, [editing, preview?.paragraphs]);

  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  function updateCell(row: number, column: number, value: string) {
    if (!preview?.workbook || !activeWorksheet) return;
    const address = cellReference(row, column);
    const current = activeWorksheet[address];
    if (value === "") {
      delete activeWorksheet[address];
    } else if (value.startsWith("=") && value.length > 1 && extension !== "csv" && extension !== "tsv") {
      const formulaCell = { ...(current ?? {}), t: "n", f: value.slice(1) };
      delete formulaCell.v;
      delete formulaCell.w;
      activeWorksheet[address] = formulaCell;
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

  function addSpreadsheetRow() {
    if (!preview?.workbook || !activeWorksheet) return;
    const newEnd = { row: range.end.row + 1, column: range.end.column };
    activeWorksheet["!ref"] = `${cellReference(range.start.row, range.start.column)}:${cellReference(newEnd.row, newEnd.column)}`;
    setPreview({ ...preview, workbook: { ...preview.workbook, Sheets: { ...preview.workbook.Sheets } } });
    setChangedCells((current) => current.includes(`${activeSheet}!+row`) ? current : [...current, `${activeSheet}!+row`]);
    setHasEdits(true);
  }

  function addSpreadsheetColumn() {
    if (!preview?.workbook || !activeWorksheet) return;
    const newEnd = { row: range.end.row, column: range.end.column + 1 };
    activeWorksheet["!ref"] = `${cellReference(range.start.row, range.start.column)}:${cellReference(newEnd.row, newEnd.column)}`;
    setPreview({ ...preview, workbook: { ...preview.workbook, Sheets: { ...preview.workbook.Sheets } } });
    setChangedCells((current) => current.includes(`${activeSheet}!+column`) ? current : [...current, `${activeSheet}!+column`]);
    setHasEdits(true);
  }

  function addSpreadsheetSheet() {
    if (!preview?.workbook) return;
    let index = preview.workbook.SheetNames.length + 1;
    let name = `Sheet${index}`;
    while (preview.workbook.SheetNames.includes(name)) {
      index += 1;
      name = `Sheet${index}`;
    }
    const workbook = { ...preview.workbook, SheetNames: [...preview.workbook.SheetNames, name], Sheets: { ...preview.workbook.Sheets, [name]: { "!ref": "A1" } } };
    setPreview({ ...preview, workbook });
    setActiveSheet(name);
    setSelectedCell("A1");
    setChangedCells((current) => [...current, `${name}!+sheet`]);
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
      setSelectedCell("A1");
      setHasEdits(false);
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
      setSelectedCell("A1");
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
    if (!annotation.trim() && !pdfPagesToAdd) {
      setError("Enter page text or add a page before saving.");
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
      const sourcePages = document.getPages();
      const sourcePageCount = sourcePages.length;
      const pageCount = sourcePageCount + pdfPagesToAdd;
      if (!Number.isInteger(annotationPage) || annotationPage < 1 || annotationPage > pageCount) {
        throw new Error(`Choose a page number from 1 to ${pageCount}.`);
      }
      const pageSize = sourcePages[0]?.getSize() ?? { width: 612, height: 792 };
      for (let index = 0; index < pdfPagesToAdd; index += 1) {
        document.addPage([pageSize.width, pageSize.height]);
      }
      const page = document.getPage(annotationPage - 1);
      const font = await document.embedFont(StandardFonts.Helvetica);
      const xPercent = Number(pdfX);
      const yPercent = Number(pdfY);
      const fontSize = Number(pdfFontSize);
      if (!Number.isFinite(xPercent) || xPercent < 0 || xPercent > 100 || !Number.isFinite(yPercent) || yPercent < 0 || yPercent > 100) {
        throw new Error("Page position must be between 0 and 100 percent.");
      }
      if (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 72) {
        throw new Error("Font size must be a whole number between 8 and 72.");
      }
      const colorMatch = pdfColor.match(/^#([0-9a-f]{6})$/i);
      if (!colorMatch) throw new Error("Choose a valid text color.");
      const maxWidth = Math.max(page.getWidth() * (1 - xPercent / 100) - 12, 24);
      const note = annotation.trim();
      const lines: string[] = [];
      for (const paragraph of note.split(/\n/)) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (font.widthOfTextAtSize(next, fontSize) > maxWidth && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        lines.push(line);
      }
      const lineHeight = fontSize * 1.35;
      const x = page.getWidth() * xPercent / 100;
      const y = page.getHeight() * (1 - yPercent / 100) - fontSize;
      if (annotation.trim() && (lines.length * lineHeight > y || x >= page.getWidth())) {
        throw new Error("The text does not fit in the selected page position. Move it up or left, reduce the font size, or shorten it.");
      }
      if (annotation.trim()) {
        lines.forEach((text, index) => {
          if (text) page.drawText(text, {
            x,
            y: y - index * lineHeight,
            size: fontSize,
            font,
            color: rgb(
              Number.parseInt(colorMatch[1].slice(0, 2), 16) / 255,
              Number.parseInt(colorMatch[1].slice(2, 4), 16) / 255,
              Number.parseInt(colorMatch[1].slice(4, 6), 16) / 255,
            ),
          });
        });
      }
      const updatedBlob = new Blob([await document.save()], { type: "application/pdf" });
      const summary = pdfPagesToAdd
        ? `Added ${pdfPagesToAdd} PDF page${pdfPagesToAdd === 1 ? "" : "s"}${annotation.trim() ? ` and text to page ${annotationPage}` : ""}`
        : `Added text to PDF page ${annotationPage}`;
      await upload(updatedBlob, summary);
      setAnnotation("");
      setPdfPageCount(pageCount);
      setPdfPagesToAdd(0);
      setHasEdits(false);
    } catch (reason) {
      recordSaveError(reason, "Unable to save the PDF annotation.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(updatedBlob: Blob, changeSummary: string) {
    if (onSave) {
      await onSave(updatedBlob, changeSummary);
    } else {
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
    }
    await onSaved(updatedBlob);
  }

  async function saveTextDocument() {
    if (!preview?.archive || !preview.paragraphXml || !preview.paragraphs || !wordEditorRef.current) return;
    if (!hasEdits) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const xml = new DOMParser().parseFromString(preview.paragraphXml, "application/xml");
      if (xml.querySelector("parsererror")) throw new Error("The document text could not be updated.");
      const blocks = documentBlocks(wordEditorRef.current.innerHTML);
      if (!blocks.length) {
        const empty = document.createElement("p");
        empty.appendChild(document.createElement("br"));
        blocks.push({ element: empty });
      }
      const listIds = await addNumberingDefinitions(preview.archive, blocks);
      const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, "p"));
      const body = xml.getElementsByTagNameNS(WORD_NAMESPACE, "body")[0];
      if (!body) throw new Error("The document body could not be found.");

      blocks.forEach((block, index) => {
        let paragraph = paragraphs[index];
        if (!paragraph) {
          paragraph = xml.createElementNS(WORD_NAMESPACE, "w:p");
          const section = Array.from(body.children).find((child) => child.localName === "sectPr");
          body.insertBefore(paragraph, section ?? null);
          paragraphs.push(paragraph);
        }
        let paragraphProperties = Array.from(paragraph.children).find((child) => child.localName === "pPr");
        const runNodes = Array.from(paragraph.childNodes).filter((child) => child !== paragraphProperties);
        runNodes.forEach((child) => paragraph.removeChild(child));

        const blockTag = block.element.tagName.toLowerCase();
        const headingStyle = blockTag === "h1"
          ? "Heading1"
          : blockTag === "h2"
            ? "Heading2"
            : blockTag === "h3"
              ? "Heading3"
              : "";
        const wordStyle = block.element.getAttribute("data-word-style") || headingStyle;
        const blockStyle = block.element instanceof HTMLElement ? block.element.style : null;
        const alignment = ["left", "center", "right", "justify"].includes(blockStyle?.textAlign ?? "")
          ? blockStyle?.textAlign ?? ""
          : "";
        if (wordStyle || alignment || block.listKind || blockStyle?.lineHeight || blockStyle?.marginBottom || blockStyle?.marginLeft) {
          if (!paragraphProperties) {
            paragraphProperties = xml.createElementNS(WORD_NAMESPACE, "w:pPr");
            paragraph.insertBefore(paragraphProperties, paragraph.firstChild);
          }
          const existingStyle = Array.from(paragraphProperties.children).find((child) => child.localName === "pStyle");
          if (wordStyle) {
            const style = existingStyle ?? xml.createElementNS(WORD_NAMESPACE, "w:pStyle");
            style.setAttributeNS(WORD_NAMESPACE, "w:val", wordStyle);
            if (!existingStyle) paragraphProperties.appendChild(style);
          } else existingStyle?.remove();
          if (alignment) {
            const existing = Array.from(paragraphProperties.children).find((child) => child.localName === "jc");
            existing?.remove();
            const justification = xml.createElementNS(WORD_NAMESPACE, "w:jc");
            justification.setAttributeNS(WORD_NAMESPACE, "w:val", alignment === "justify" ? "both" : alignment);
            paragraphProperties.appendChild(justification);
          }
          if (block.listKind) {
            const existing = Array.from(paragraphProperties.children).find((child) => child.localName === "numPr");
            existing?.remove();
            const numberId = listIds.get(block.listKind);
            if (numberId) {
              const numbering = xml.createElementNS(WORD_NAMESPACE, "w:numPr");
              const level = xml.createElementNS(WORD_NAMESPACE, "w:ilvl");
              level.setAttributeNS(WORD_NAMESPACE, "w:val", "0");
              const number = xml.createElementNS(WORD_NAMESPACE, "w:numId");
              number.setAttributeNS(WORD_NAMESPACE, "w:val", String(numberId));
              numbering.append(level, number);
              paragraphProperties.appendChild(numbering);
            }
          }
          if (blockStyle?.lineHeight || blockStyle?.marginBottom) {
            const existing = Array.from(paragraphProperties.children).find((child) => child.localName === "spacing");
            existing?.remove();
            const spacing = xml.createElementNS(WORD_NAMESPACE, "w:spacing");
            if (blockStyle.lineHeight) {
              const lineHeight = Number.parseFloat(blockStyle.lineHeight);
              if (Number.isFinite(lineHeight) && lineHeight > 0) {
                spacing.setAttributeNS(WORD_NAMESPACE, "w:line", String(Math.round(lineHeight * 240)));
                spacing.setAttributeNS(WORD_NAMESPACE, "w:lineRule", "auto");
              }
            }
            if (blockStyle.marginBottom) {
              const marginBottom = Number.parseFloat(blockStyle.marginBottom);
              const unit = blockStyle.marginBottom.match(/[a-z%]+$/i)?.[0].toLowerCase();
              if (Number.isFinite(marginBottom) && marginBottom >= 0 && unit === "pt") {
                spacing.setAttributeNS(WORD_NAMESPACE, "w:after", String(Math.round(marginBottom * 20)));
              } else if (Number.isFinite(marginBottom) && marginBottom >= 0 && unit === "px") {
                spacing.setAttributeNS(WORD_NAMESPACE, "w:after", String(Math.round(marginBottom * 15)));
              }
            }
            if (spacing.attributes.length) paragraphProperties.appendChild(spacing);
          }
          if (blockStyle?.marginLeft) {
            const marginLeft = Number.parseFloat(blockStyle.marginLeft);
            const unit = blockStyle.marginLeft.match(/[a-z%]+$/i)?.[0].toLowerCase();
            const twips = unit === "pt" ? marginLeft * 20 : unit === "px" ? marginLeft * 15 : Number.NaN;
            if (Number.isFinite(twips) && twips >= 0) {
              const existing = Array.from(paragraphProperties.children).find((child) => child.localName === "ind");
              existing?.remove();
              const indentation = xml.createElementNS(WORD_NAMESPACE, "w:ind");
              indentation.setAttributeNS(WORD_NAMESPACE, "w:left", String(Math.round(twips)));
              paragraphProperties.appendChild(indentation);
            }
          }
        }

        appendWordRuns(xml, paragraph, block.element);
        if (!paragraph.childNodes.length || (paragraph.childNodes.length === 1 && paragraph.firstChild === paragraphProperties)) {
          const run = xml.createElementNS(WORD_NAMESPACE, "w:r");
          run.appendChild(xml.createElementNS(WORD_NAMESPACE, "w:t"));
          paragraph.appendChild(run);
        }
      });
      paragraphs.slice(blocks.length).forEach((paragraph) => paragraph.remove());
      const source = new XMLSerializer().serializeToString(xml);
      preview.archive.file("word/document.xml", source);
      const updatedBlob = await preview.archive.generateAsync({ type: "blob", mimeType: file.mimeType });
      const updatedParagraphs = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, "p"))
        .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, "t")).map((text) => text.textContent ?? "").join(""));
      const summary = `Edited Word document text and formatting (${updatedParagraphs.length} paragraph${updatedParagraphs.length === 1 ? "" : "s"})`;
      await upload(updatedBlob, summary);
      const updatedParagraphHtml = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, "p"), wordParagraphHtml);
      setPreview({ ...preview, paragraphXml: source, paragraphs: updatedParagraphs, paragraphHtml: updatedParagraphHtml });
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
    const totalPdfPages = pdfPageCount + pdfPagesToAdd;
    return (
      <div className={`office-preview office-pdf-preview${editing ? " is-editing" : ""}`}>
        <div className="office-preview-toolbar pdf-editor-toolbar">
          {!editing && canEdit && <button className="button button-outline" onClick={() => setEditing(true)}><Pencil size={15} />Add text</button>}
          {editing && <>
            <label htmlFor="pdf-annotation-page">Page</label>
            <input id="pdf-annotation-page" type="number" min={1} max={totalPdfPages} value={annotationPage} onChange={(event) => setAnnotationPage(Number(event.target.value))} aria-label="PDF page number" />
            <span className="pdf-page-total">of {totalPdfPages}</span>
            <button className="button button-outline" onClick={() => {
              const nextPageCount = pdfPagesToAdd + 1;
              setPdfPagesToAdd(nextPageCount);
              setAnnotationPage(pdfPageCount + nextPageCount);
              setHasEdits(true);
            }} disabled={busy}><span aria-hidden="true">+</span> Add page</button>
            <span className="pdf-toolbar-spacer" />
            <button className="button button-green" onClick={() => void savePdfAnnotation()} disabled={busy || !hasEdits}><Save size={15} />{busy ? "Saving…" : "Save PDF"}</button>
            <button className="button button-outline" onClick={() => { setEditing(false); setError(""); setAnnotation(""); setPdfPagesToAdd(0); setHasEdits(false); }} disabled={busy}><X size={15} />Cancel</button>
          </>}
        </div>
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        {editing && <div className="pdf-editor-controls">
          <label className="pdf-editor-field pdf-text-field" htmlFor="pdf-page-text">
            <span>Page text</span>
            <textarea id="pdf-page-text" value={annotation} maxLength={5000} onChange={(event) => { setAnnotation(event.target.value); setHasEdits(Boolean(event.target.value.trim()) || pdfPagesToAdd > 0); }} placeholder="Write the content to place on this page…" />
          </label>
          <div className="pdf-editor-options">
            <label className="pdf-editor-field"><span>Horizontal position (%)</span><input aria-label="Horizontal position percentage" type="number" min={0} max={100} value={pdfX} onChange={(event) => setPdfX(event.target.value)} /></label>
            <label className="pdf-editor-field"><span>Vertical position (%)</span><input aria-label="Vertical position percentage" type="number" min={0} max={100} value={pdfY} onChange={(event) => setPdfY(event.target.value)} /></label>
            <label className="pdf-editor-field"><span>Font size</span><select aria-label="Text font size" value={pdfFontSize} onChange={(event) => setPdfFontSize(event.target.value)}>{[10, 12, 14, 16, 18, 24, 32, 48, 64].map((size) => <option key={size} value={size}>{size} pt</option>)}</select></label>
            <label className="pdf-editor-field pdf-color-field"><span>Text color</span><input aria-label="Text color" type="color" value={pdfColor} onChange={(event) => setPdfColor(event.target.value)} /></label>
          </div>
          <p className="office-preview-hint">Text is placed at the selected position on the chosen page. Add pages before saving. PDF text currently supports basic English characters and punctuation.</p>
        </div>}
        {pdfUrl && <iframe className="file-pdf-preview" src={`${pdfUrl}#page=${annotationPage}`} title={file.name} />}
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
          {editing && extension !== "csv" && extension !== "tsv" && <>
            <button className="button button-outline" onClick={addSpreadsheetSheet} disabled={busy}>+ Sheet</button>
            <button className="button button-outline" onClick={addSpreadsheetRow} disabled={busy || !canAddSpreadsheetRow}>+ Row</button>
            <button className="button button-outline" onClick={addSpreadsheetColumn} disabled={busy || !canAddSpreadsheetColumn}>+ Column</button>
          </>}
          {canEdit && (editing
            ? <><button className="button button-green" onClick={() => void saveSpreadsheet()} disabled={busy || !changedCells.length}><Save size={15} />{busy ? "Saving…" : "Save changes"}</button><button className="button button-outline" onClick={() => void cancelSpreadsheetEdit()} disabled={busy}>Cancel</button></>
            : <button className="button button-outline" onClick={() => void startSpreadsheetEdit()} disabled={busy}><Pencil size={15} />Edit sheet</button>)}
        </div>
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        {editing && <div className="office-sheet-formula">
          <span className="office-sheet-address">{selectedAddress}</span>
          <span className="office-sheet-fx">fx</span>
          <input
          aria-label={`Formula or value for cell ${selectedAddress}`}
          onChange={(event) => {
            const { row, column } = decodeCellReference(selectedAddress);
            updateCell(row, column, event.target.value);
          }}
          placeholder="Type a value or formula, for example =SUM(A1:A5)"
          value={selectedCellValue}
          />
        </div>}
        <div className="office-sheet-scroll">
          <table className="office-sheet-grid">
            <thead><tr>            <th aria-label="Row number" />{columns.map((column) => <th key={column}>{columnName(column)}</th>)}</tr></thead>
            <tbody>{rows.map((row) => <tr key={row}>
              <th>{row + 1}</th>
              {columns.map((column) => {
                const address = cellReference(row, column);
                const value = displayCell(activeWorksheet[address], editing);
                return <td key={address}>{editing
                  ? <input
                    aria-label={`Cell ${address}`}
                    className={selectedAddress === address ? "selected" : ""}
                    value={value}
                    onFocus={() => setSelectedCell(address)}
                    onChange={(event) => updateCell(row, column, event.target.value)}
                  />
                  : value}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        <p className="office-preview-hint">{range.end.row - range.start.row + 1 > PREVIEW_ROWS || range.end.column - range.start.column + 1 > PREVIEW_COLUMNS
          ? `Showing up to ${PREVIEW_ROWS} rows and ${PREVIEW_COLUMNS} columns. `
          : ""}
          {editing && (!canAddSpreadsheetRow || !canAddSpreadsheetColumn)
          ? "The editable grid is capped at 120 rows and 26 columns. "
          : ""}{editing ? "Select a cell and type, or enter a value or formula in the formula bar. Formulas are stored in the workbook and calculated when opened in a spreadsheet app." : "Choose Edit sheet to update cells."}</p>
      </div>
    );
  }

  if (preview?.paragraphs) {
    return (
      <div className="office-preview office-document-preview">
        {canEdit && !preview.wordReadOnlyReason && <div className="office-preview-toolbar word-editor-toolbar" role="toolbar" aria-label="Word editing tools">
          {editing ? <>
            <div className="word-editor-tool-group word-editor-history" aria-label="History">
              <button type="button" className="word-editor-tool" aria-label="Undo" title="Undo" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("undo")}><Undo2 size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Redo" title="Redo" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("redo")}><Redo2 size={16} /></button>
            </div>
            <span className="word-editor-tool-divider" aria-hidden="true" />
            <div className="word-editor-tool-group word-editor-select-group" aria-label="Text style">
              <select aria-label="Paragraph style" defaultValue="normal" onChange={(event) => applyWordBlockFormat(event.target.value)} onFocus={rememberWordSelection}>
                <option value="normal">Normal</option>
                <option value="title">Title</option>
                <option value="subtitle">Subtitle</option>
                <option value="heading1">Heading 1</option>
                <option value="heading2">Heading 2</option>
                <option value="heading3">Heading 3</option>
              </select>
              <select aria-label="Font family" defaultValue="Arial" onChange={(event) => applyWordInlineStyle("fontFamily", event.target.value)} onFocus={rememberWordSelection}>
                {["Arial", "Aptos", "Calibri", "Georgia", "Times New Roman", "Verdana"].map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
              <select aria-label="Font size" defaultValue="11" onChange={(event) => applyWordInlineStyle("fontSize", `${event.target.value}pt`)} onFocus={rememberWordSelection}>
                {[8, 9, 10, 11, 12, 14, 16, 18, 24, 36].map((size) => <option key={size} value={size}>{size} pt</option>)}
              </select>
            </div>
            <div className="word-editor-tool-group" aria-label="Character formatting">
              <button type="button" className="word-editor-tool" aria-label="Bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("bold")}><Bold size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Italic" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("italic")}><Italic size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("underline")}><Underline size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Strikethrough" title="Strikethrough" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("strikeThrough")}><Strikethrough size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Clear formatting" title="Clear formatting" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("removeFormat")}><Eraser size={16} /></button>
              <label className="word-editor-color" title="Text color">
                <span>Text</span><input aria-label="Text color" type="color" defaultValue="#000000" onFocus={rememberWordSelection} onChange={(event) => applyWordInlineStyle("color", event.target.value)} />
              </label>
              <label className="word-editor-color" title="Text highlight">
                <Highlighter size={14} /><input aria-label="Text highlight color" type="color" defaultValue="#fff29a" onFocus={rememberWordSelection} onChange={(event) => applyWordInlineStyle("backgroundColor", event.target.value)} />
              </label>
            </div>
            <span className="word-editor-tool-divider" aria-hidden="true" />
            <div className="word-editor-tool-group" aria-label="Paragraph alignment and lists">
              <button type="button" className="word-editor-tool" aria-label="Align left" title="Align left" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("justifyLeft")}><AlignLeft size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Align center" title="Align center" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("justifyCenter")}><AlignCenter size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Align right" title="Align right" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("justifyRight")}><AlignRight size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Justify" title="Justify" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("justifyFull")}><AlignJustify size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Bulleted list" title="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("insertUnorderedList")}><List size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Numbered list" title="Numbered list" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("insertOrderedList")}><ListOrdered size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Decrease indent" title="Decrease indent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("outdent")}><IndentDecrease size={16} /></button>
              <button type="button" className="word-editor-tool" aria-label="Increase indent" title="Increase indent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyWordCommand("indent")}><IndentIncrease size={16} /></button>
            </div>
            <div className="word-editor-tool-group word-editor-select-group" aria-label="Paragraph spacing">
              <select aria-label="Line spacing" defaultValue="1.15" onChange={(event) => applyWordParagraphStyle("lineHeight", event.target.value)} onFocus={rememberWordSelection}>
                <option value="1">Single</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">Double</option>
              </select>
              <select aria-label="Paragraph spacing" defaultValue="0pt" onChange={(event) => applyWordParagraphStyle("marginBottom", event.target.value)} onFocus={rememberWordSelection}>
                <option value="0pt">No paragraph gap</option><option value="6pt">6 pt after</option><option value="12pt">12 pt after</option>
              </select>
            </div>
            <button type="button" className={`word-editor-tool${findReplaceOpen ? " is-active" : ""}`} aria-label="Find and replace" title="Find and replace" onMouseDown={(event) => event.preventDefault()} onClick={() => { setFindReplaceOpen((open) => !open); setReplaceFeedback(""); }}><Search size={16} /></button>
            <span className="word-editor-status" role="status">{hasEdits ? "Unsaved changes" : "All changes saved"}</span>
            <button className="button button-green word-editor-save" onClick={() => void saveTextDocument()} disabled={busy}><Save size={15} />{busy ? "Saving…" : "Save"}</button>
            <button className="button button-outline word-editor-cancel" onClick={() => { setEditing(false); setHasEdits(false); setPasteFeedback(""); }} disabled={busy}><X size={15} /><span>Cancel</span></button>
          </> : <button className="button button-outline" onClick={() => { setPasteFeedback(""); setEditing(true); setHasEdits(false); }}><Pencil size={15} />Edit document</button>}
        </div>}
        {preview.wordReadOnlyReason && <p className="office-preview-hint word-editor-readonly" role="status">{preview.wordReadOnlyReason}</p>}
        {error && <p className="form-alert office-preview-error" role="alert"><PlanLimitMessage message={error} /></p>}
        {editing && findReplaceOpen && <div className="word-find-replace" role="group" aria-label="Find and replace text">
          <label><span>Find</span><input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="Text to find" /></label>
          <label><span>Replace with</span><input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replacement text" /></label>
          <button type="button" className="button button-outline" onClick={replaceAllWordText}>Replace all</button>
          {replaceFeedback && <span role="status">{replaceFeedback}</span>}
        </div>}
        {editing
          ? <div className="word-editor-scroll">
            <article className="word-editor-page">
              <div
                ref={wordEditorRef}
                className="word-editor-canvas"
                contentEditable={canEdit && editing}
                suppressContentEditableWarning
                role="textbox"
                aria-label={`Write content in ${file.name}`}
                aria-multiline="true"
                onInput={() => { rememberWordSelection(); setHasEdits(true); }}
                onKeyUp={rememberWordSelection}
                onMouseUp={rememberWordSelection}
                onPaste={(event) => {
                  event.preventDefault();
                  const clipboardHtml = event.clipboardData.getData("text/html");
                  const clipboardText = event.clipboardData.getData("text/plain");
                  if (clipboardHtml) {
                    const sanitized = sanitizeWordClipboardHtml(clipboardHtml);
                    if (sanitized.unsupported) {
                      setPasteFeedback("Paste cancelled: this editor does not yet support images, tables, or hyperlinks. Use plain text or paste supported text formatting.");
                      return;
                    }
                    document.execCommand("insertHTML", false, sanitized.html);
                  } else {
                    document.execCommand("insertText", false, clipboardText);
                  }
                  setPasteFeedback("");
                  setHasEdits(true);
                  rememberWordSelection();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setPasteFeedback("Drag and drop is disabled in this editor. Copy and paste supported text instead.");
                }}
                dangerouslySetInnerHTML={{ __html: preview.paragraphHtml?.join("") ?? "" }}
              />
            </article>
          </div>
          : <DocxPagePreview blob={blob} />}
        {editing && pasteFeedback && <p className="office-preview-hint word-editor-readonly" role="status">{pasteFeedback}</p>}
        {editing
          ? <p className="office-preview-hint">Use the toolbar for text and paragraph formatting, find and replace, and undo or redo. Changes are saved to the original Word file.</p>
          : <p className="office-preview-hint">Word pages are rendered with their original layout. Choose Edit document to make changes.</p>}
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
