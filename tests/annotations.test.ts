// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { exportPdf, type Overlay } from "../src/lib/pdf-engine";

async function base(rotation = 0) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]);
  page.setCropBox(30, 40, 300, 500);
  page.setRotation(degrees(rotation));
  page.drawRectangle({
    x: 30,
    y: 40,
    width: 300,
    height: 500,
    color: rgb(1, 1, 1),
  });
  return new Uint8Array(await pdf.save());
}

function content(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString("latin1");
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((m) => {
      try {
        return [inflateSync(Buffer.from(m[1], "latin1")).toString("latin1")];
      } catch {
        return [m[1]];
      }
    })
    .join("\n");
}

const common = {
  id: "a",
  pageIndex: 0,
  x: 0.2,
  y: 0.2,
  width: 0.3,
  height: 0.1,
};

describe("vector annotation PDF export", () => {
  it("writes selectable standard-font text and multiline text into the PDF", async () => {
    const pdf = await PDFDocument.load(
      await exportPdf(
        await base(),
        [0],
        [
          {
            ...common,
            height: 0.4,
            kind: "text",
            text: "Partnership proposal\nNext steps",
            fontSize: 18,
            fontFamily: "sans",
          },
        ],
      ),
    );
    expect(pdf.getPage(0).node.Contents()).toBeTruthy();
    const output = content(new Uint8Array(await pdf.save()));
    expect(output).toMatch(/BT[\s\S]*Tj/);
    const shownText = [...output.matchAll(/<([\dA-F]+)> Tj/g)]
      .map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"))
      .join("")
      .toLowerCase();
    expect(shownText).toContain("partnershipproposalnextsteps");
    expect(output).toContain("/Rotate 0");
    expect(output).toContain("/CropBox [ 30 40 330 540 ]");
    expect(output).toContain("/BaseFont /Helvetica");
  });

  it("draws actual vector operators for line, arrow, rectangle, ellipse, and highlight", async () => {
    const overlays: Overlay[] = [
      { ...common, kind: "line" },
      { ...common, kind: "arrow" },
      { ...common, kind: "rectangle", fill: "#ff0000" },
      { ...common, kind: "circle" },
      { ...common, kind: "highlight" },
    ];
    const output = content(await exportPdf(await base(90), [90], overlays));
    expect(output).toContain(" m\n");
    expect(output).toContain(" l\n");
    expect(output).toMatch(/\nh\n/);
    expect(output).toMatch(/\nB\n/);
    expect(output).toMatch(/ c\n/);
  });

  it.each([0, 90, 180, 270])(
    "uses a single rotated local coordinate frame for vectors (%i°)",
    async (rotation) => {
      const output = content(
        await exportPdf(
          await base(rotation),
          [rotation],
          [{ ...common, kind: "line" }],
        ),
      );
      const radians = (rotation * Math.PI) / 180;
      const expected = [
        Math.cos(radians),
        Math.sin(radians),
        -Math.sin(radians),
        Math.cos(radians),
      ];
      const matrices = [
        ...output.matchAll(
          /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/g,
        ),
      ];
      expect(
        matrices.some((matrix) =>
          expected.every(
            (value, index) =>
              Math.abs(Number(matrix[index + 1]) - value) < 1e-5,
          ),
        ),
      ).toBe(true);
      expect(output).toContain("0 0 m\n0 0 m");
      expect(output).toContain(
        rotation === 90 || rotation === 270 ? "150 30" : "90 50",
      );
      expect(output).toContain("Q");
    },
  );

  it("transforms an ellipse from the local box center", async () => {
    const output = content(
      await exportPdf(await base(90), [90], [{ ...common, kind: "circle" }]),
    );
    expect(output).toMatch(/0 15\.000000000000007 m/);
    expect(output).toMatch(/150 15\.000000000000007 c/);
    expect(output).toContain("Q");
  });

  it("uses configured highlight fill and opacity", async () => {
    const output = content(
      await exportPdf(
        await base(),
        [0],
        [
          {
            ...common,
            kind: "highlight",
            color: "#123456",
            fill: "#00ff00",
            opacity: 0.7,
          },
        ],
      ),
    );
    expect(output).toContain("0 1 0 rg");
    expect(output).toContain("0.7");
  });

  it("preserves transparent fill on a rectangle", async () => {
    const output = content(
      await exportPdf(
        await base(),
        [0],
        [{ ...common, kind: "rectangle", fill: "none" }],
      ),
    );
    expect(output).not.toContain("0.98 0.97 0.94 rg");
  });

  it("maps each supported Times style to its actual StandardFonts name", async () => {
    const output = content(
      await exportPdf(
        await base(),
        [0],
        [
          {
            ...common,
            kind: "text",
            text: "Times",
            fontFamily: "serif",
            bold: true,
            italic: true,
            fontSize: 20,
          },
        ],
      ),
    );
    expect(output).toContain("/BaseFont /Times-BoldItalic");
    expect(output).toContain("/Times-BoldItalic-");
  });

  it("aligns text baseline to top local line-height", async () => {
    const output = content(
      await exportPdf(
        await base(),
        [0],
        [
          {
            ...common,
            kind: "text",
            text: "Times",
            fontFamily: "serif",
            fontSize: 20,
          },
        ],
      ),
    );
    expect(output).toContain("1 0 0 1 6 30.34000000000003 Tm");
  });

  it("keeps the image transform independent from vector graphics state", async () => {
    const output = content(
      await exportPdf(
        await base(90),
        [90],
        [
          {
            ...common,
            kind: "image",
            dataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=",
          },
          { ...common, kind: "line" },
        ],
      ),
    );
    expect(output).toContain(" Do");
    expect(output.indexOf("Do")).toBeLessThan(output.lastIndexOf("Q"));
  });

  it("rejects unsupported Unicode text with an actionable English error", async () => {
    await expect(
      exportPdf(
        await base(),
        [0],
        [{ ...common, kind: "text", text: "Hello 世界" }],
      ),
    ).rejects.toThrow(/unsupported.*character|font.*support/i);
  });
});
