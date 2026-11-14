import puppeteer from "puppeteer-core";
import { PDFDocument, degrees, StandardFonts } from "pdf-lib";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const base = process.env.BASE || "http://127.0.0.1:4186/";
const out =
  process.env.QA_OUT ||
  "C:/Users/Rochman/AppData/Local/hermes/cache/scratch/pdf-annotations-qa";
const downloads = path.join(out, `downloads-${process.pid}`);
await mkdir(downloads, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--user-data-dir=${out}/chrome-${process.pid}`],
});
const p = await browser.newPage();
await p.setViewport({ width: 1440, height: 1000 });
const errors = [],
  failed = [],
  results = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
p.on("response", (r) => {
  if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
});
const cdp = await p.createCDPSession();
await cdp.send("Page.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function button(name) {
  const h = await p.evaluateHandle(
    (name) =>
      [
        ...(
          document.querySelector('[role="dialog"]') || document
        ).querySelectorAll("button"),
      ].find(
        (e) =>
          e.getAttribute("aria-label") === name ||
          e.textContent.trim() === name,
      ),
    name,
  );
  const el = h.asElement();
  assert(el, `Missing button ${name}`);
  await el.click();
}
async function fill(label, value) {
  const h = await p.evaluateHandle(
    (label) =>
      [...document.querySelectorAll("input,textarea,select")].find(
        (e) =>
          e.getAttribute("aria-label") === label ||
          [...document.querySelectorAll("label")].some(
            (l) => l.htmlFor === e.id && l.textContent.trim() === label,
          ),
      ),
    label,
  );
  const el = h.asElement();
  assert(el, `Missing field ${label}`);
  await el.focus();
  await p.keyboard.down("Control");
  await p.keyboard.press("a");
  await p.keyboard.up("Control");
  await el.type(value);
}
async function waitFile(name) {
  const file = path.join(downloads, name);
  for (let i = 0; i < 100; i++) {
    try {
      if ((await stat(file)).size > 0) {
        await pause(150);
        return await readFile(file);
      }
    } catch {}
    await pause(100);
  }
  throw new Error(`No download ${name}`);
}
async function drawShape(kind, index = 0) {
  const before = await p.$$eval(".pdf-object", (a) => a.length);
  await button(`Add ${kind}`);
  assert.equal(
    await p.$$eval(".pdf-object", (a) => a.length),
    before,
    "Tool selection should not insert a shape",
  );
  await p.$eval(".page-stage", (e) => e.scrollIntoView({ block: "center" }));
  const box = await (await p.$(".page-stage")).boundingBox();
  const x = 0.12 + (index % 3) * 0.21,
    y = 0.35 + Math.floor(index / 3) * 0.22;
  await p.mouse.move(box.x + x * box.width, box.y + y * box.height);
  await p.mouse.down();
  await p.mouse.move(
    box.x + (x + 0.16) * box.width,
    box.y + (y + 0.12) * box.height,
    { steps: 12 },
  );
  await p.mouse.up();
  await p.waitForFunction(
    (n) => document.querySelectorAll(".pdf-object").length === n + 1,
    {},
    before,
  );
}
async function ready() {
  await p.waitForFunction(
    () =>
      document.querySelector(".page-stage canvas")?.width > 200 &&
      !document.querySelector(".workspace-loading"),
  );
  await pause(500);
}
try {
  await p.goto(base, { waitUntil: "networkidle0" });
  await ready();
  assert.equal(await p.$eval("html", (e) => e.lang), "en");
  assert.equal(
    await p.$eval("h1", (e) => e.textContent),
    "Partnership proposal.pdf",
  );
  results.push("English workspace and demo");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([500, 700]);
  page.setCropBox(30, 40, 420, 610);
  page.setRotation(degrees(90));
  page.drawText("Original searchable content", {
    x: 55,
    y: 570,
    size: 14,
    font,
  });
  const file = path.join(out, "annotation-fixture.pdf");
  await writeFile(file, await pdf.save());
  await (await p.$('input[aria-label="Upload PDF"]')).uploadFile(file);
  await p.waitForFunction(
    () => document.querySelector("h1").textContent === "annotation-fixture.pdf",
  );
  await ready();
  await button("Add text");
  await p.waitForSelector('[role="dialog"]');
  await fill("Text content", "Reviewed by Folio\nApproved for release");
  await button("Add text");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 1,
  );
  assert(
    await p.$eval(".pdf-object", (e) =>
      e
        .querySelector("canvas")
        ?.getAttribute("aria-label")
        ?.includes("Reviewed by Folio"),
    ),
  );
  results.push("Multiline text annotation added");
  for (const [index, kind] of [
    "line",
    "arrow",
    "rectangle",
    "circle",
    "highlight",
  ].entries()) {
    await drawShape(kind, index);
  }
  assert.equal((await p.$$(".pdf-object")).length, 6);
  results.push("Line, arrow, rectangle, circle and highlight added");
  // Real move, unlocked resize, duplicate and history.
  const target = await p.$('button[aria-label="Select circle"]');
  assert(target, "Circle selection target");
  await target.focus();
  await pause(100);
  await target.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const before = await target.boundingBox();
  await p.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await p.mouse.down();
  await p.mouse.move(
    before.x + before.width / 2 + 35,
    before.y + before.height / 2 - 25,
    { steps: 12 },
  );
  await p.mouse.up();
  await pause(120);
  const after = await target.boundingBox();
  assert(after.x > before.x + 20);
  results.push("Real shape drag");
  await button("Duplicate object");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 7,
  );
  await p.keyboard.press("Delete");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 6,
  );
  await button("Undo");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 7,
  );
  await button("Redo");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 6,
  );
  results.push("Duplicate/delete/undo/redo for annotations");
  await p.screenshot({ path: path.join(out, "annotations-preview.png") });
  await button("Download PDF");
  const exported = await waitFile("annotation-fixture-edited.pdf");
  const verify = await PDFDocument.load(exported);
  assert.equal(verify.getPage(0).getRotation().angle, 90);
  assert.deepEqual(verify.getPage(0).getCropBox(), {
    x: 30,
    y: 40,
    width: 420,
    height: 610,
  });
  const reopen = path.join(out, "annotations-export.pdf");
  await writeFile(reopen, exported);
  await (await p.$('input[aria-label="Upload PDF"]')).uploadFile(reopen);
  await p.waitForSelector('[role="dialog"]');
  await button("Open new document");
  await p.waitForFunction(
    () => document.querySelector("h1").textContent === "annotations-export.pdf",
  );
  await ready();
  assert.equal((await p.$$(".pdf-object")).length, 0);
  await p.screenshot({ path: path.join(out, "annotations-reopened.png") });
  results.push("Export reopened with preserved crop and initial rotation");
  // Inspect exported searchable text independently from React overlay state.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const exportedTask = getDocument({ data: new Uint8Array(exported) });
  const exportedDoc = await exportedTask.promise;
  const textItems = await (await exportedDoc.getPage(1)).getTextContent();
  const extracted = textItems.items.map((item) => item.str || "").join(" ");
  assert(extracted.includes("Original searchable content"));
  assert(extracted.includes("Reviewed by Folio"));
  assert(extracted.includes("Approved for release"));
  await exportedTask.destroy();
  results.push("Original and added multiline text remain searchable");
  const responsive = [];
  for (const width of [360, 390, 768, 1024, 1440]) {
    await p.setViewport({ width, height: 900 });
    await pause(150);
    const size = await p.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      toolbarRight: document
        .querySelector(".editor-toolbar")
        .getBoundingClientRect().right,
    }));
    assert(size.scrollWidth <= width);
    responsive.push(size);
  }
  results.push("Annotation workspace responsive");
  await p.setViewport({ width: 390, height: 844 });
  await p.reload({ waitUntil: "networkidle0" });
  await ready();
  await drawShape("circle");
  await p.waitForSelector(".pdf-object");
  await button("Object properties");
  await p.waitForSelector('[role="dialog"]');
  await p.screenshot({ path: path.join(out, "mobile-properties.png") });
  await p.keyboard.press("Escape");
  results.push("Mobile annotation properties accessible");
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  const report = {
    passed: results.length,
    results,
    errors,
    failed,
    responsive,
  };
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await p.screenshot({ path: path.join(out, "failure.png") }).catch(() => {});
  console.error(JSON.stringify({ results, errors, failed }, null, 2));
  throw e;
} finally {
  await browser.close();
}
