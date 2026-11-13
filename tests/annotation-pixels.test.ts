// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exportPdf, type Overlay } from "../src/lib/pdf-engine";

const crop = { x: 30, y: 40, width: 300, height: 500 };
const scale = 1.5;
const overlays: Overlay[] = [
  {
    id: "red",
    pageIndex: 0,
    kind: "rectangle",
    x: 0.1,
    y: 0.12,
    width: 0.2,
    height: 0.14,
    fill: "#ff0000",
    color: "#ff0000",
    strokeWidth: 0.5,
  },
  {
    id: "green",
    pageIndex: 0,
    kind: "circle",
    x: 0.43,
    y: 0.12,
    width: 0.22,
    height: 0.18,
    fill: "#00ff00",
    color: "#00ff00",
    strokeWidth: 0.5,
  },
  {
    id: "blue-line",
    pageIndex: 0,
    kind: "line",
    x: 0.12,
    y: 0.5,
    width: 0.3,
    height: 0.1,
    color: "#0000ff",
    strokeWidth: 2,
  },
  {
    id: "blue-arrow",
    pageIndex: 0,
    kind: "arrow",
    x: 0.5,
    y: 0.5,
    width: 0.28,
    height: 0.1,
    color: "#0000ff",
    strokeWidth: 2,
  },
  {
    id: "text",
    pageIndex: 0,
    kind: "text",
    x: 0.12,
    y: 0.72,
    width: 0.7,
    height: 0.18,
    text: "Pixel text line one\nPixel text line two",
    color: "#000000",
    fontFamily: "serif",
    bold: true,
    italic: true,
    fontSize: 16,
  },
];

type PixelBounds = { left: number; top: number; right: number; bottom: number };

async function blankCroppedPage(rotation: number) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]);
  page.setCropBox(crop.x, crop.y, crop.width, crop.height);
  page.setRotation(degrees(rotation));
  page.drawRectangle({
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height,
    color: rgb(1, 1, 1),
  });
  return new Uint8Array(await pdf.save());
}

async function render(bytes: Uint8Array) {
  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<html><body><script type="module">import * as pdfjs from "/pdf.mjs"; window.pdfjs=pdfjs;</script></body></html>',
        );
        return;
      }
      const name = request.url === "/pdf.mjs" ? "pdf.mjs" : "pdf.worker.mjs";
      response.setHeader("Content-Type", "text/javascript");
      response.end(
        await readFile(resolve("node_modules/pdfjs-dist/build", name)),
      );
    } catch {
      response.statusCode = 500;
      response.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address() as { port: number };
  const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForFunction(() =>
      Boolean((window as unknown as { pdfjs: unknown }).pdfjs),
    );
    return await page.evaluate(
      async ({ data, scale }) => {
        const { getDocument, GlobalWorkerOptions } = (
          window as unknown as { pdfjs: typeof import("pdfjs-dist") }
        ).pdfjs;
        GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
        const loadingTask = getDocument({ data: new Uint8Array(data) });
        const document = await loadingTask.promise;
        const pdfPage = await document.getPage(1),
          viewport = pdfPage.getViewport({ scale });
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d")!;
        await pdfPage.render({ canvas, canvasContext: context, viewport })
          .promise;
        const pixels = Array.from(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
        );
        const text = (await pdfPage.getTextContent()).items
          .map((item: { str?: string }) => item.str || "")
          .join("\n");
        await loadingTask.destroy();
        return { pixels, width: canvas.width, height: canvas.height, text };
      },
      { data: Array.from(bytes), scale },
    );
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.close(() => done()));
  }
}

function boundsWhere(
  image: Awaited<ReturnType<typeof render>>,
  isMatch: (r: number, g: number, b: number) => boolean,
): PixelBounds {
  let left = image.width,
    top = image.height,
    right = -1,
    bottom = -1;
  const { pixels, width, height } = image;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isMatch(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left)
    throw new Error("No pixels matched requested annotation color.");
  return { left, top, right, bottom };
}

function expectedBounds(
  image: Awaited<ReturnType<typeof render>>,
  overlay: Overlay,
): PixelBounds {
  return {
    left: overlay.x * image.width,
    top: overlay.y * image.height,
    right: (overlay.x + overlay.width) * image.width,
    bottom: (overlay.y + overlay.height) * image.height,
  };
}

function expectBoundsNear(
  actual: PixelBounds,
  expected: PixelBounds,
  tolerancePoints: number,
  rotation: number,
) {
  const pointTolerance = tolerancePoints * scale;
  for (const edge of ["left", "top", "right", "bottom"] as const) {
    expect(
      Math.abs(actual[edge] - expected[edge]),
      `${edge} pixel bound differs by >${tolerancePoints}pt at ${rotation}°`,
    ).toBeLessThanOrEqual(pointTolerance);
  }
}

describe("PDF vector export pixels", () => {
  it.each([0, 90, 180, 270])(
    "renders normalized vector and text bounds on a nonzero CropBox at %i°",
    async (rotation) => {
      const exported = await exportPdf(
        await blankCroppedPage(rotation),
        [rotation],
        overlays,
      );
      const image = await render(exported);
      const [rectangle, ellipse, line, arrow] = overlays;
      const red = boundsWhere(image, (r, g, b) => r > 220 && g < 45 && b < 45);
      const green = boundsWhere(
        image,
        (r, g, b) => r < 45 && g > 220 && b < 45,
      );
      const blue = boundsWhere(image, (r, g, b) => r < 45 && g < 45 && b > 220);
      expectBoundsNear(red, expectedBounds(image, rectangle), 2, rotation);
      expectBoundsNear(green, expectedBounds(image, ellipse), 2, rotation);

      // Include the arrowhead's geometric extent: at shallow angles its wing can
      // legitimately rise above the shaft endpoint (the object box is the shaft).
      const w = arrow.width * image.width,
        h = arrow.height * image.height;
      const angle = Math.atan2(-h, w),
        head = Math.max(8, (arrow.strokeWidth ?? 2) * 4) * scale;
      const endX = (arrow.x + arrow.width) * image.width,
        endY = arrow.y * image.height;
      const tips = [-1, 1].map((side) => ({
        x: endX + Math.cos(angle + Math.PI + (side * Math.PI) / 6) * head,
        y: endY + Math.sin(angle + Math.PI + (side * Math.PI) / 6) * head,
      }));
      const combinedLine = {
        left: Math.min(
          line.x * image.width,
          arrow.x * image.width,
          ...tips.map((p) => p.x),
        ),
        top: Math.min(
          line.y * image.height,
          arrow.y * image.height,
          ...tips.map((p) => p.y),
        ),
        right: Math.max(
          (line.x + line.width) * image.width,
          endX,
          ...tips.map((p) => p.x),
        ),
        bottom: Math.max(
          (line.y + line.height) * image.height,
          (arrow.y + arrow.height) * image.height,
          ...tips.map((p) => p.y),
        ),
      };
      expectBoundsNear(blue, combinedLine, 2, rotation);
      expect(image.text).toContain("Pixel text line one");
      expect(image.text).toContain("Pixel text line two");
    },
    30000,
  );
});
