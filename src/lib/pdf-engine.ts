import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Overlay } from "./overlay-types";
export type { Overlay, OverlayKind } from "./overlay-types";

export type PageInfo = { width: number; height: number; rotation: number };

function normalizeRotation(angle: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized))
    throw new Error("Page rotation must be 0, 90, 180, or 270 degrees.");
  return normalized;
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/encrypt|password|encrypted/i.test(message)) {
      throw new Error(
        "This PDF is password-protected. Unlock it before trying again.",
      );
    }
    throw error;
  }
}

export async function inspectPdf(bytes: Uint8Array): Promise<PageInfo[]> {
  const pdf = await loadPdf(bytes);
  return pdf.getPages().map((page) => {
    const crop = page.getCropBox();
    const rotation = normalizeRotation(page.getRotation().angle);
    return { width: crop.width, height: crop.height, rotation };
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function createDemoPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont("Helvetica");
  const bold = await pdf.embedFont("Helvetica-Bold");
  const pages = [
    {
      title: "Partnership proposal",
      kicker: "COMMUNITY DEVELOPMENT PARTNERSHIP",
      body: "This proposal outlines a partnership to expand access to practical skills training and digital services for the community.\n\nPrepared for: Partnership team\nProposed period: January–December 2026",
    },
    {
      title: "Scope of work",
      kicker: "PROGRAM AND RESPONSIBILITIES",
      body: "The program includes digital literacy training, small business mentoring, and a monthly consultation clinic.\n\nThe foundation will provide the curriculum, facilitators, and impact reports. The community cooperative will provide venues, coordinate participants, and appoint a local contact.\n\nPartners will review progress quarterly based on participation, course completion, and participant feedback.",
    },
    {
      title: "Approval",
      kicker: "NEXT STEPS",
      body: "The partners intend to build an open, measurable, and mutually beneficial collaboration. A detailed activity plan and annual budget will be agreed before the program begins.\n\nBy signing below, each representative confirms their intent to continue discussions and prepare a partnership agreement.\n\nCakrawala Foundation                         Community Cooperative\n\nName: ____________________                 Name: ____________________\nTitle: ____________________                  Title: ____________________",
    },
  ];
  pdf.setTitle("Partnership proposal — Cakrawala and Community Cooperative");
  for (let index = 0; index < pages.length; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    const content = pages[index];
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 595.28,
      height: 841.89,
      color: rgb(0.98, 0.97, 0.94),
    });
    page.drawRectangle({
      x: 52,
      y: 0,
      width: 4,
      height: 841.89,
      color: rgb(0.12, 0.36, 0.33),
    });
    page.drawText("CAKRAWALA  /  PARTNERSHIPS", {
      x: 78,
      y: 777,
      size: 9,
      font: bold,
      color: rgb(0.12, 0.36, 0.33),
    });
    page.drawText(content.kicker, {
      x: 78,
      y: 692,
      size: 9,
      font: bold,
      color: rgb(0.68, 0.42, 0.22),
    });
    page.drawText(content.title, {
      x: 78,
      y: 640,
      size: index === 0 ? 33 : 28,
      font: bold,
      color: rgb(0.14, 0.22, 0.21),
      maxWidth: 445,
    });
    page.drawRectangle({
      x: 78,
      y: 616,
      width: 64,
      height: 3,
      color: rgb(0.68, 0.42, 0.22),
    });
    let y = 576;
    for (const line of wrapText(content.body, 78)) {
      if (!line) {
        y -= 12;
        continue;
      }
      page.drawText(line, {
        x: 78,
        y,
        size: 11,
        font,
        color: rgb(0.24, 0.29, 0.27),
        maxWidth: 440,
      });
      y -= 18;
    }
    page.drawText(
      `PARTNERSHIP PROPOSAL  •  ${String(index + 1).padStart(2, "0")} / 03`,
      { x: 78, y: 45, size: 8, font, color: rgb(0.48, 0.53, 0.5) },
    );
  }
  return new Uint8Array(await pdf.save());
}

function dataUrlBytes(dataUrl: string): { bytes: Uint8Array; type: string } {
  const match = /^data:(image\/(?:png|jpeg));base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match)
    throw new Error("Image overlays must use a valid PNG or JPEG data URL.");
  const binary = atob(match[2]);
  return {
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    type: match[1].toLowerCase(),
  };
}

function displayedRectToPdf(
  page: PDFPage,
  overlay: Overlay,
  finalRotation: number,
) {
  const crop = page.getCropBox();
  const angle = normalizeRotation(finalRotation);
  const displayedWidth =
    angle === 90 || angle === 270 ? crop.height : crop.width;
  const displayedHeight =
    angle === 90 || angle === 270 ? crop.width : crop.height;
  const left = overlay.x * displayedWidth;
  const top = overlay.y * displayedHeight;
  const right = (overlay.x + overlay.width) * displayedWidth;
  const bottom = (overlay.y + overlay.height) * displayedHeight;
  const toPdf = (x: number, y: number): [number, number] => {
    switch (angle) {
      case 90:
        return [crop.x + y, crop.y + x];
      case 180:
        return [crop.x + crop.width - x, crop.y + y];
      case 270:
        return [crop.x + crop.width - y, crop.y + crop.height - x];
      default:
        return [crop.x + x, crop.y + crop.height - y];
    }
  };
  const corners = [
    toPdf(left, top),
    toPdf(right, top),
    toPdf(left, bottom),
    toPdf(right, bottom),
  ];
  const minX = Math.min(...corners.map(([x]) => x));
  const minY = Math.min(...corners.map(([, y]) => y));
  const x =
    minX + (angle === 90 ? bottom - top : angle === 180 ? right - left : 0);
  const y =
    minY + (angle === 180 ? bottom - top : angle === 270 ? right - left : 0);
  return {
    x,
    y,
    width: right - left,
    height: bottom - top,
    rotate: degrees(angle),
  };
}

function overlayColor(value: string | undefined, fallback: string) {
  const color = value ?? fallback;
  if (!/^#[\da-f]{6}$/i.test(color))
    throw new Error("Annotation colors must use #RRGGBB format.");
  return rgb(
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255,
  );
}

function pdfFont(overlay: Overlay, fonts: Record<string, PDFFont>) {
  const family = overlay.fontFamily ?? "sans";
  const suffix =
    overlay.bold && overlay.italic
      ? "BoldItalic"
      : overlay.bold
        ? "Bold"
        : overlay.italic
          ? "Italic"
          : "Regular";
  const keys: Record<string, Record<string, string>> = {
    sans: {
      Regular: "Helvetica",
      Bold: "HelveticaBold",
      Italic: "HelveticaOblique",
      BoldItalic: "HelveticaBoldOblique",
    },
    serif: {
      Regular: "TimesRoman",
      Bold: "TimesBold",
      Italic: "TimesItalic",
      BoldItalic: "TimesBoldItalic",
    },
    mono: {
      Regular: "Courier",
      Bold: "CourierBold",
      Italic: "CourierOblique",
      BoldItalic: "CourierBoldOblique",
    },
  };
  return fonts[keys[family]?.[suffix] ?? "Helvetica"];
}

function validateStandardFontText(text: string, font: PDFFont) {
  try {
    for (const character of text.replace(/[\r\n]/g, ""))
      font.encodeText(character);
  } catch {
    throw new Error(
      "This text contains characters unsupported by standard PDF fonts. Use ASCII characters or embed a font that supports this language.",
    );
  }
}

export type TextOverlayMeasurement = {
  lines: string[];
  padding: number;
  requiredHeight: number;
  lineHeight: number;
  fontSize: number;
  ascender: number;
};

function measureTextWithFont(
  overlay: Overlay,
  widthPoints: number,
  font: PDFFont,
): TextOverlayMeasurement {
  const size = overlay.fontSize ?? 18;
  const padding = overlay.textPadding ?? 6;
  if (!Number.isFinite(size) || size <= 0)
    throw new Error("Text size must be a positive number.");
  if (!Number.isFinite(padding) || padding < 0)
    throw new Error("Text padding must be a non-negative number.");
  if (!Number.isFinite(widthPoints) || widthPoints <= 2 * padding)
    throw new Error("Text box must be wider than its horizontal padding.");
  const text = overlay.text ?? "";
  validateStandardFontText(text, font);
  const availableWidth = widthPoints - 2 * padding;
  const lines: string[] = [];
  const widthOf = (value: string) => font.widthOfTextAtSize(value, size);
  const appendWord = (word: string, current: string): string => {
    if (current) {
      const combined = `${current} ${word}`;
      if (widthOf(combined) <= availableWidth) return combined;
      lines.push(current);
    }
    let line = "";
    for (const glyph of word) {
      if (widthOf(glyph) > availableWidth)
        throw new Error(
          "Text box is too narrow to fit a character. Increase its width or reduce the font size.",
        );
      if (line && widthOf(line + glyph) > availableWidth) {
        lines.push(line);
        line = glyph;
      } else line += glyph;
    }
    return line;
  };
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/))
      line = appendWord(word, line);
    lines.push(line);
  }
  if (!lines.length) lines.push("");
  const ascender = font.heightAtSize(size, { descender: false });
  const descender = Math.max(
    0,
    font.heightAtSize(size, { descender: true }) - ascender,
  );
  const lineHeight = size * 1.2;
  return {
    lines,
    padding,
    requiredHeight:
      padding * 2 + ascender + descender + lineHeight * (lines.length - 1),
    lineHeight,
    fontSize: size,
    ascender,
  };
}

export async function measureTextOverlay(
  overlay: Overlay,
  widthPoints: number,
): Promise<TextOverlayMeasurement> {
  const family = overlay.fontFamily ?? "sans";
  const italic = overlay.italic ?? false;
  const bold = overlay.bold ?? false;
  const name =
    family === "serif"
      ? bold
        ? italic
          ? StandardFonts.TimesRomanBoldItalic
          : StandardFonts.TimesRomanBold
        : italic
          ? StandardFonts.TimesRomanItalic
          : StandardFonts.TimesRoman
      : family === "mono"
        ? bold
          ? italic
            ? StandardFonts.CourierBoldOblique
            : StandardFonts.CourierBold
          : italic
            ? StandardFonts.CourierOblique
            : StandardFonts.Courier
        : bold
          ? italic
            ? StandardFonts.HelveticaBoldOblique
            : StandardFonts.HelveticaBold
          : italic
            ? StandardFonts.HelveticaOblique
            : StandardFonts.Helvetica;
  const pdf = await PDFDocument.create();
  return measureTextWithFont(overlay, widthPoints, await pdf.embedFont(name));
}

function applyOverlay(
  page: PDFPage,
  overlay: Overlay,
  rotation: number,
  fonts: Record<string, PDFFont>,
) {
  const rect = displayedRectToPdf(page, overlay, rotation);
  const opacity = overlay.opacity ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new Error("Annotation opacity must be between 0 and 1.");
  const color = overlayColor(
    overlay.color,
    overlay.kind === "highlight" ? "#facc15" : "#162c4d",
  );
  const thickness = overlay.strokeWidth ?? 2;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (!Number.isFinite(thickness) || thickness <= 0)
    throw new Error("Annotation stroke width must be a positive number.");
  if (overlay.kind === "image" || overlay.kind === "signature") {
    if (!overlay.dataUrl)
      throw new Error("Image and signature annotations require image data.");
    const source = dataUrlBytes(overlay.dataUrl);
    return { type: source.type, bytes: source.bytes, rect };
  }
  const vector = !["image", "signature"].includes(overlay.kind);
  if (vector) {
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(cosine, sine, -sine, cosine, rect.x, rect.y),
    );
  }
  try {
    if (overlay.kind === "text") {
      const font = pdfFont(overlay, fonts);
      const measured = measureTextWithFont(overlay, rect.width, font);
      if (rect.height + 1e-6 < measured.requiredHeight)
        throw new Error(
          "Text does not fit this box height. Increase the box height or shorten the text.",
        );
      measured.lines.forEach((line, index) =>
        page.drawText(line, {
          x: measured.padding,
          y:
            rect.height -
            measured.padding -
            measured.ascender -
            index * measured.lineHeight,
          size: measured.fontSize,
          font,
          color,
          opacity,
        }),
      );
      return;
    }
    if (overlay.kind === "line" || overlay.kind === "arrow") {
      const start = overlay.start ?? { x: 0, y: 1 };
      const end = overlay.end ?? { x: 1, y: 0 };
      if (
        ![start.x, start.y, end.x, end.y].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        )
      )
        throw new Error(
          "Line endpoints must be finite normalized coordinates between 0 and 1.",
        );
      const startPoint = {
        x: start.x * rect.width,
        y: (1 - start.y) * rect.height,
      };
      const endPoint = { x: end.x * rect.width, y: (1 - end.y) * rect.height };
      page.drawLine({
        start: startPoint,
        end: endPoint,
        thickness,
        color,
        opacity,
      });
      if (overlay.kind === "arrow") {
        const angle = Math.atan2(
          endPoint.y - startPoint.y,
          endPoint.x - startPoint.x,
        );
        const head = Math.max(8, thickness * 4);
        for (const side of [-1, 1]) {
          const a = angle + Math.PI + (side * Math.PI) / 6;
          page.drawLine({
            start: endPoint,
            end: {
              x: endPoint.x + Math.cos(a) * head,
              y: endPoint.y + Math.sin(a) * head,
            },
            thickness,
            color,
            opacity,
          });
        }
      }
      return;
    }
    const fill =
      overlay.kind === "highlight"
        ? (overlay.fill ?? overlay.color ?? "#facc15")
        : overlay.fill;
    const fillColor =
      fill && fill !== "none" ? overlayColor(fill, "#facc15") : undefined;
    if (overlay.kind === "circle") {
      page.drawEllipse({
        x: rect.width / 2,
        y: rect.height / 2,
        xScale: rect.width / 2,
        yScale: rect.height / 2,
        borderColor: color,
        borderWidth: thickness,
        color: fillColor,
        borderOpacity: opacity,
        opacity,
      });
    } else {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height,
        borderColor: overlay.kind === "highlight" ? undefined : color,
        borderWidth: overlay.kind === "highlight" ? 0 : thickness,
        color: fillColor,
        borderOpacity: opacity,
        opacity,
      });
    }
  } finally {
    if (vector) page.pushOperators(popGraphicsState());
  }
}

export async function exportPdf(
  bytes: Uint8Array,
  rotations: number[],
  overlays: Overlay[],
): Promise<Uint8Array> {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();
  if (rotations.length !== pages.length)
    throw new Error(
      "The number of page rotations must match the number of PDF pages.",
    );
  const normalized = rotations.map(normalizeRotation);
  const fontNames: Record<
    string,
    (typeof StandardFonts)[keyof typeof StandardFonts]
  > = {
    Helvetica: StandardFonts.Helvetica,
    HelveticaBold: StandardFonts.HelveticaBold,
    HelveticaOblique: StandardFonts.HelveticaOblique,
    HelveticaBoldOblique: StandardFonts.HelveticaBoldOblique,
    TimesRoman: StandardFonts.TimesRoman,
    TimesBold: StandardFonts.TimesRomanBold,
    TimesItalic: StandardFonts.TimesRomanItalic,
    TimesBoldItalic: StandardFonts.TimesRomanBoldItalic,
    Courier: StandardFonts.Courier,
    CourierBold: StandardFonts.CourierBold,
    CourierOblique: StandardFonts.CourierOblique,
    CourierBoldOblique: StandardFonts.CourierBoldOblique,
  };
  const fonts: Record<string, PDFFont> = {};
  for (const [key, name] of Object.entries(fontNames))
    fonts[key] = await pdf.embedFont(name);
  for (const overlay of overlays) {
    const page = pages[overlay.pageIndex];
    if (!page)
      throw new Error(
        `Annotation refers to an unavailable page: ${overlay.pageIndex}.`,
      );
    if (
      ![overlay.x, overlay.y, overlay.width, overlay.height].every(
        Number.isFinite,
      ) ||
      overlay.width <= 0 ||
      overlay.height <= 0
    ) {
      throw new Error(
        "Annotation position and size must be finite numbers with positive width and height.",
      );
    }
    const result = applyOverlay(
      page,
      overlay,
      normalized[overlay.pageIndex],
      fonts,
    );
    if (result) {
      const image =
        result.type === "image/png"
          ? await pdf.embedPng(result.bytes)
          : await pdf.embedJpg(result.bytes);
      page.drawImage(image, { ...result.rect });
    }
  }
  pages.forEach((page, index) => page.setRotation(degrees(normalized[index])));
  return new Uint8Array(await pdf.save());
}
