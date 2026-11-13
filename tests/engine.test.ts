// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber, degrees, rgb } from "pdf-lib";
import { inflateSync } from "node:zlib";
import {
  createDemoPdf,
  exportPdf,
  inspectPdf,
  type Overlay,
} from "../src/lib/pdf-engine";

async function makePdf(
  rotation = 0,
  crop = { x: 0, y: 0, width: 300, height: 500 },
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 400,
    height: 600,
    color: rgb(0.9, 0.9, 0.9),
  });
  page.setCropBox(crop.x, crop.y, crop.width, crop.height);
  page.setRotation(degrees(rotation));
  return new Uint8Array(await pdf.save());
}

const png1px =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=";
const overlay: Overlay = {
  id: "stamp",
  pageIndex: 0,
  kind: "image",
  dataUrl: png1px,
  x: 0.2,
  y: 0.25,
  width: 0.3,
  height: 0.2,
};

async function loaded(bytes: Uint8Array) {
  return PDFDocument.load(bytes);
}

function decodedContentStreams(bytes: Uint8Array): string[] {
  const source = Buffer.from(bytes).toString("latin1");
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(
    (match) => {
      const raw = Buffer.from(match[1], "latin1");
      try {
        return [inflateSync(raw).toString("latin1")];
      } catch {
        return [raw.toString("latin1")];
      }
    },
  );
}

function imageTransform(bytes: Uint8Array): number[] {
  const content = decodedContentStreams(bytes).join("\n");
  const draw = content.match(/((?:[-\d.]+\s+){6}cm\s*)+\/[^\s]+\s+Do/);
  expect(draw).not.toBeNull();
  const matrices = [
    ...draw![0].matchAll(
      /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/g,
    ),
  ];
  return matrices
    .map((matrix) => matrix.slice(1, 7).map(Number))
    .reduce((left, right) => [
      left[0] * right[0] + left[2] * right[1],
      left[1] * right[0] + left[3] * right[1],
      left[0] * right[2] + left[2] * right[3],
      left[1] * right[2] + left[3] * right[3],
      left[0] * right[4] + left[2] * right[5] + left[4],
      left[1] * right[4] + left[3] * right[5] + left[5],
    ]);
}

describe("PDF engine", () => {
  it("inspects crop dimensions and initial page rotations", async () => {
    const pages = await inspectPdf(
      await makePdf(90, { x: 30, y: 40, width: 300, height: 500 }),
    );
    expect(pages).toEqual([{ width: 300, height: 500, rotation: 90 }]);
  });

  it("creates a readable three-page English partnership proposal demo", async () => {
    const bytes = await createDemoPdf();
    const pdf = await loaded(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toContain("Partnership proposal");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("exports a valid PDF with the requested absolute page rotation", async () => {
    const bytes = await makePdf(90);
    const result = await exportPdf(bytes, [270], []);
    const pdf = await loaded(result);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getRotation().angle).toBe(270);
  });

  it.each([0, 90, 180, 270])(
    "maps display-space overlay to its correctly rotated PDF transform (%i°)",
    async (rotation) => {
      const bytes = await makePdf(rotation, {
        x: 27,
        y: 39,
        width: 300,
        height: 500,
      });
      const result = await exportPdf(bytes, [rotation], [overlay]);
      const pdf = await loaded(result);
      expect(pdf.getPage(0).getRotation().angle).toBe(rotation);
      const displayedWidth = rotation === 90 || rotation === 270 ? 500 : 300;
      const displayedHeight = rotation === 90 || rotation === 270 ? 300 : 500;
      const width = overlay.width * displayedWidth;
      const height = overlay.height * displayedHeight;
      const left = overlay.x * displayedWidth;
      const top = overlay.y * displayedHeight;
      const toPdf = (x: number, y: number): [number, number] => {
        switch (rotation) {
          case 90:
            return [27 + y, 39 + x];
          case 180:
            return [27 + 300 - x, 39 + y];
          case 270:
            return [27 + 300 - y, 39 + 500 - x];
          default:
            return [27 + x, 39 + 500 - y];
        }
      };
      const corners = [
        toPdf(left, top),
        toPdf(left + width, top),
        toPdf(left, top + height),
        toPdf(left + width, top + height),
      ];
      const minX = Math.min(...corners.map(([x]) => x));
      const maxX = Math.max(...corners.map(([x]) => x));
      const minY = Math.min(...corners.map(([, y]) => y));
      const maxY = Math.max(...corners.map(([, y]) => y));
      const anchorX = rotation === 90 || rotation === 180 ? maxX : minX;
      const anchorY = rotation === 180 || rotation === 270 ? maxY : minY;
      const radians = (rotation * Math.PI) / 180;
      const expected = [
        Math.cos(radians) * width,
        Math.sin(radians) * width,
        -Math.sin(radians) * height,
        Math.cos(radians) * height,
        anchorX,
        anchorY,
      ];
      imageTransform(result).forEach((value, index) =>
        expect(value).toBeCloseTo(expected[index], 5),
      );
    },
  );

  it("accepts a valid PDF containing /Encrypt in a comment", async () => {
    const valid = await makePdf();
    const marker = new TextEncoder().encode(
      "\n% /Encrypt is only a comment, not a trailer entry\n",
    );
    const bytes = new Uint8Array(valid.length + marker.length);
    bytes.set(valid);
    bytes.set(marker, valid.length);
    expect(await inspectPdf(bytes)).toHaveLength(1);
  });

  it("rejects a PDF with an actual Encrypt trailer dictionary", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 500]);
    pdf.context.trailerInfo.Encrypt = pdf.context.obj({
      Filter: PDFName.of("Standard"),
      V: PDFNumber.of(1),
      R: PDFNumber.of(2),
    });
    const bytes = new Uint8Array(await pdf.save());
    await expect(inspectPdf(bytes)).rejects.toThrow(
      /kata sandi|password|terenkripsi/i,
    );
  });
});
