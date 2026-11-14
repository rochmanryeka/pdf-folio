// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import { PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib/cjs/core";
import { exportPdf, type Overlay } from "../src/lib/pdf-engine";

async function makePdf(rotation: number) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  page.setCropBox(30, 40, 300, 500);
  page.setRotation(degrees(rotation));
  return new Uint8Array(await doc.save());
}
async function decoded(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const contents = document.getPage(0).node.Contents();
  const entries =
    contents instanceof PDFArray
      ? contents.asArray()
      : contents
        ? [contents]
        : [];
  return entries
    .map((entry) => {
      const stream = document.context.lookup(entry);
      return stream instanceof PDFRawStream
        ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")
        : "";
    })
    .join("\n");
}
const box = {
  id: "line",
  pageIndex: 0,
  x: 0.2,
  y: 0.2,
  width: 0.4,
  height: 0.3,
};

describe("manual line endpoints", () => {
  it.each(["line", "arrow"] as const)(
    "preserves reverse, horizontal, and vertical endpoints for %s",
    async (kind) => {
      const cases: Array<Pick<Overlay, "start" | "end">> = [
        { start: { x: 1, y: 0 }, end: { x: 0, y: 1 } },
        { start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
        { start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
      ];
      for (const rotation of [0, 90, 180, 270]) {
        for (const endpoints of cases) {
          const overlay: Overlay = { ...box, kind, ...endpoints };
          const exported = await exportPdf(
            await makePdf(rotation),
            [rotation],
            [overlay],
          );
          const output = await decoded(exported);
          const savedPdf = await PDFDocument.load(exported);
          expect(savedPdf.getPage(0).getRotation().angle).toBe(rotation);
          expect(savedPdf.getPage(0).getCropBox()).toMatchObject({
            x: 30,
            y: 40,
            width: 300,
            height: 500,
          });
          const displayedWidth =
            rotation === 90 || rotation === 270 ? 500 : 300;
          const displayedHeight =
            rotation === 90 || rotation === 270 ? 300 : 500;
          const startX = endpoints.start!.x * overlay.width * displayedWidth;
          const startY =
            (1 - endpoints.start!.y) * overlay.height * displayedHeight;
          const endX = endpoints.end!.x * overlay.width * displayedWidth;
          const endY =
            (1 - endpoints.end!.y) * overlay.height * displayedHeight;
          const commands = [
            ...output.matchAll(/([-0-9.]+) ([-0-9.]+) ([ml])\n/g),
          ];
          const hasPoint = (x: number, y: number, op: string) =>
            commands.some(
              (match) =>
                match[3] === op &&
                Math.abs(Number(match[1]) - x) < 1e-4 &&
                Math.abs(Number(match[2]) - y) < 1e-4,
            );
          expect(
            hasPoint(startX, startY, "m"),
            `rotation=${rotation}, kind=${kind}, expected ${startX},${startY}; content=${output.slice(0, 700)}`,
          ).toBe(true);
          expect(hasPoint(endX, endY, "l")).toBe(true);
          if (kind === "arrow")
            expect(commands.filter((match) => match[3] === "l")).toHaveLength(
              3,
            );
          expect(output).toContain("Q");
        }
      }
    },
  );

  it("keeps legacy diagonal defaults when endpoints are omitted", async () => {
    const output = await decoded(
      await exportPdf(await makePdf(0), [0], [{ ...box, kind: "line" }]),
    );
    expect(output).toContain("0 0 m\n120.00000000000003 150 l");
  });
});
