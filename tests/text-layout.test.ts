// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { inflateSync } from "node:zlib";
import {
  exportPdf,
  measureTextOverlay,
  type Overlay,
} from "../src/lib/pdf-engine";

const base: Overlay = {
  id: "layout",
  pageIndex: 0,
  kind: "text",
  x: 0.1,
  y: 0.1,
  width: 0.5,
  height: 0.5,
  text: "A measured line with several words",
  fontSize: 18,
};

async function pdf(rotation = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  page.setCropBox(30, 40, 300, 500);
  page.setRotation(degrees(rotation));
  return new Uint8Array(await doc.save());
}

function operators(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString("latin1");
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((match) => {
      try {
        return [
          inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"),
        ];
      } catch {
        return [match[1]];
      }
    })
    .join("\n");
}

describe("text layout measurement and export", () => {
  it("wraps using actual font widths and measures padded multiline height", async () => {
    const result = await measureTextOverlay(
      { ...base, text: "Measured words wrap naturally" },
      100,
    );
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.join(" ").replace(/\s+/g, " ")).toBe(
      "Measured words wrap naturally",
    );
    expect(result.padding).toBe(6);
    expect(result.lineHeight).toBeCloseTo(21.6);
    expect(result.requiredHeight).toBeGreaterThan(
      12 + result.ascender + result.lineHeight * (result.lines.length - 1),
    );
    expect(
      result.lines.every((line) => result.fontSize && line.length > 0),
    ).toBe(true);
    const metricPdf = await PDFDocument.create();
    const font = await metricPdf.embedFont(StandardFonts.Helvetica);
    expect(
      result.lines.every(
        (line) => font.widthOfTextAtSize(line, result.fontSize) <= 88 + 1e-6,
      ),
    ).toBe(true);
    expect(result.requiredHeight).toBeCloseTo(
      12 +
        font.heightAtSize(result.fontSize, { descender: true }) +
        result.lineHeight * (result.lines.length - 1),
    );
  });

  it("breaks long unspaced text by supported glyph and preserves explicit blank lines", async () => {
    const result = await measureTextOverlay(
      { ...base, text: "ABCDEFGHIJKLMN\n\nNext" },
      35,
    );
    expect(result.lines).toContain("");
    expect(result.lines.join("")).toBe("ABCDEFGHIJKLMNNext");
    expect(result.lines.every((line) => line.length > 0 || line === "")).toBe(
      true,
    );
  });

  it("rejects a box narrower than one rendered glyph", async () => {
    await expect(
      measureTextOverlay({ ...base, text: "W", fontSize: 18 }, 13),
    ).rejects.toThrow(/narrow|wide|fit/i);
  });

  it("reports unsupported standard-font glyphs while measuring", async () => {
    await expect(
      measureTextOverlay({ ...base, text: "Hello 世界" }, 200),
    ).rejects.toThrow(/unsupported.*character|font.*support/i);
  });

  it("exports wrapped text at the padded x and measured top baseline", async () => {
    const overlay = {
      ...base,
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      text: "One two three four five six seven eight nine",
      fontSize: 18,
    };
    const measured = await measureTextOverlay(overlay, 120);
    const content = operators(await exportPdf(await pdf(), [0], [overlay]));
    expect(content).toMatch(
      new RegExp(
        `1 0 0 1 ${measured.padding} ${overlay.height * 500 - measured.padding - measured.ascender} Tm`,
      ),
    );
    expect(content.match(/ Tj/g)?.length).toBe(measured.lines.length);
    expect(content).toContain("/CropBox [ 30 40 330 540 ]");
  });

  it("rejects text whose measured content exceeds its box instead of clipping", async () => {
    await expect(
      exportPdf(
        await pdf(),
        [0],
        [{ ...base, height: 0.02, text: "Too tall\nfor this box" }],
      ),
    ).rejects.toThrow(/height|shorten|resize/i);
  });
});
