import puppeteer from "puppeteer-core";
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  PDFName,
  PDFDict,
} from "pdf-lib";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const base = process.env.BASE || "http://127.0.0.1:4186/";
const out =
  process.env.QA_OUT ||
  "C:/Users/Rochman/AppData/Local/hermes/cache/scratch/pdf-qa";
const downloadDir = path.join(out, `downloads-${process.pid}`);
await mkdir(out, { recursive: true });
await mkdir(downloadDir, { recursive: true });
const results = [];
const errors = [];
const failed = [];
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--user-data-dir=${out}/chrome-e2e-${process.pid}`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.emulateMediaFeatures([
  { name: "prefers-reduced-motion", value: "reduce" },
]);
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.status() >= 400) failed.push({ url: r.url(), status: r.status() });
});
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloadDir,
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForFile(file) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await stat(file)).size > 0) return await readFile(file);
    } catch {}
    await pause(100);
  }
  throw new Error(`Missing download: ${file}`);
}
async function clickLabel(label) {
  const handle = await page.$(`button[aria-label="${label}"]`);
  assert(handle, `Missing control ${label}`);
  await handle.click();
}
async function textButton(text) {
  const handle = await page.evaluateHandle(
    (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === text,
      ),
    text,
  );
  const el = handle.asElement();
  assert(el, `Missing button ${text}`);
  await el.click();
}
async function ready() {
  await page.waitForFunction(
    () =>
      document.querySelector(".page-stage canvas")?.width > 200 &&
      !document.querySelector(".workspace-loading"),
  );
  await pause(450);
}
try {
  await page.goto(base, { waitUntil: "networkidle0" });
  assert.equal(await page.title(), "Folio — PDF Studio");
  await ready();
  assert.equal(
    await page.$eval("h1", (e) => e.textContent),
    "Partnership proposal.pdf",
  );
  results.push("Production identity and real demo render");
  await page.screenshot({ path: path.join(out, "studio-dark.png") });
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "dark",
  );
  await clickLabel("Toggle theme");
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "light",
  );
  await page.reload({ waitUntil: "networkidle0" });
  await ready();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "light",
  );
  await page.screenshot({ path: path.join(out, "studio-light.png") });
  await clickLabel("Toggle theme");
  results.push("Manual theme toggle and persistence");
  await clickLabel("Rotate page 90°");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="rotation-status"]').textContent ===
      "90°",
  );
  await clickLabel("Undo");
  assert.equal(
    await page.$eval('[data-testid="rotation-status"]', (e) => e.textContent),
    "0°",
  );
  await clickLabel("Redo");
  assert.equal(
    await page.$eval('[data-testid="rotation-status"]', (e) => e.textContent),
    "90°",
  );
  await clickLabel("Undo");
  results.push("Rotate / undo / redo");
  await clickLabel("Signature");
  await page.waitForSelector('[role="dialog"]');
  const tabs = await page.$$('button[role="tab"]');
  await tabs[1].click();
  await page.type("#sign-name", "Rochman");
  await textButton("Use signature");
  await page.waitForSelector(".pdf-object");
  assert.equal(await page.$$(".pdf-object").then((a) => a.length), 1);
  results.push("Typed signature inserted");
  // Drag actual object with real pointer gestures, then resize a corner.
  await page.$eval(".pdf-object", (e) => e.scrollIntoView({ block: "center" }));
  const before = await page.$eval(".pdf-object", (e) => ({
    x: e.getBoundingClientRect().x,
    y: e.getBoundingClientRect().y,
    width: e.getBoundingClientRect().width,
  }));
  await page.mouse.move(before.x + 40, before.y + 15);
  await page.mouse.down();
  await page.mouse.move(before.x + 90, before.y - 25, { steps: 12 });
  await page.mouse.up();
  await pause(150);
  const after = await page.$eval(".pdf-object", (e) => ({
    x: e.getBoundingClientRect().x,
    y: e.getBoundingClientRect().y,
    width: e.getBoundingClientRect().width,
  }));
  assert(after.x > before.x + 30);
  assert(after.y < before.y - 20);
  const corner = await page.$(".pdf-object .resize-dot:last-child");
  assert(corner);
  const cb = await corner.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + 35, cb.y + 15, { steps: 10 });
  await page.mouse.up();
  await pause(150);
  const resized = await page.$eval(
    ".pdf-object",
    (e) => e.getBoundingClientRect().width,
  );
  assert(Math.abs(resized - after.width) > 10);
  results.push("Real signature drag and resize gestures");
  await page.keyboard.press("Delete");
  assert.equal(await page.$$(".pdf-object").then((a) => a.length), 0);
  await page.keyboard.down("Control");
  await page.keyboard.press("z");
  await page.keyboard.up("Control");
  assert.equal(await page.$$(".pdf-object").then((a) => a.length), 1);
  results.push("Delete and keyboard undo");
  await clickLabel("Signature");
  await page.waitForSelector('[role="dialog"]');
  const pad = await page.$(".signature-pad canvas");
  assert(pad);
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 75);
  await page.mouse.down();
  for (let i = 0; i < 20; i++)
    await page.mouse.move(
      box.x + 40 + i * 12,
      box.y + 75 + Math.sin(i * 0.8) * 25,
    );
  await page.mouse.up();
  await textButton("Use signature");
  await page.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 2,
  );
  results.push("Freehand signature drawing");
  // Actual upload, cropped and initially rotated PDF.
  const fixture = await PDFDocument.create();
  const font = await fixture.embedFont(StandardFonts.Helvetica);
  const first = fixture.addPage([500, 700]);
  first.setCropBox(30, 40, 420, 610);
  first.setRotation(degrees(90));
  first.drawText("Uploaded crop and rotation fixture", {
    x: 55,
    y: 570,
    font,
    size: 16,
    color: rgb(0.1, 0.1, 0.1),
  });
  const second = fixture.addPage([595, 842]);
  second.drawText("Second page", { x: 55, y: 700, font, size: 24 });
  const fixturePath = path.join(out, "upload-fixture.pdf");
  await writeFile(fixturePath, await fixture.save());
  await (
    await page.$('input[aria-label="Upload PDF"]')
  ).uploadFile(fixturePath);
  await page.waitForSelector('[role="dialog"]');
  await textButton("Open new document");
  await page.waitForFunction(
    () => document.querySelector("h1").textContent === "upload-fixture.pdf",
  );
  await ready();
  assert.equal(
    await page.$eval('[data-testid="rotation-status"]', (e) => e.textContent),
    "90°",
  );
  results.push(
    "Upload replaces after confirmation and respects original crop/rotation",
  );
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 80;
    const x = c.getContext("2d");
    x.fillStyle = "#1a50ed";
    x.fillRect(0, 0, 160, 80);
    x.fillStyle = "#ed291e";
    x.fillRect(0, 0, 60, 30);
    return c.toDataURL("image/png").split(",")[1];
  });
  const imagePath = path.join(out, "stamp.png");
  await writeFile(imagePath, Buffer.from(image, "base64"));
  await (
    await page.$('input[aria-label="Upload image"]')
  ).uploadFile(imagePath);
  await page.waitForSelector(".pdf-object");
  results.push("PNG image upload");
  await clickLabel("Signature");
  await page.waitForSelector('[role="dialog"]');
  const type = await page.$$('button[role="tab"]');
  await type[1].click();
  await page.type("#sign-name", "Approved");
  await textButton("Use signature");
  await page.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 2,
  );
  const expected = await page.$eval(".pdf-object", (e) => {
    const r = e.getBoundingClientRect(),
      p = e.closest(".page-stage").getBoundingClientRect();
    return {
      x: (r.x - p.x) / p.width,
      y: (r.y - p.y) / p.height,
      w: r.width / p.width,
      h: r.height / p.height,
    };
  });
  await page.screenshot({ path: path.join(out, "studio-edited.png") });
  await textButton("Download PDF");
  const downloaded = await waitForFile(
    path.join(downloadDir, "upload-fixture-edited.pdf"),
  );
  const exported = await PDFDocument.load(downloaded);
  assert.equal(exported.getPageCount(), 2);
  assert.equal(exported.getPage(0).getRotation().angle, 90);
  assert.deepEqual(exported.getPage(0).getCropBox(), {
    x: 30,
    y: 40,
    width: 420,
    height: 610,
  });
  const xobjects = exported
    .getPage(0)
    .node.Resources()
    .lookup(PDFName.of("XObject"), PDFDict);
  assert(xobjects.keys().length >= 2);
  results.push(
    "Real PDF download: 2 pages, rotation/crop retained, image and signature embedded",
  );
  const reopenPath = path.join(out, "upload-fixture-edited.pdf");
  await writeFile(reopenPath, downloaded);
  await (await page.$('input[aria-label="Upload PDF"]')).uploadFile(reopenPath);
  await page.waitForSelector('[role="dialog"]');
  await textButton("Open new document");
  await page.waitForFunction(
    () =>
      document.querySelector("h1").textContent === "upload-fixture-edited.pdf",
  );
  await ready();
  const actual = await page.$eval(".page-stage canvas", (c) => {
    const ctx = c.getContext("2d"),
      data = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width,
      minY = c.height,
      maxX = 0,
      maxY = 0,
      count = 0,
      redX = 0,
      redY = 0,
      red = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (data[i + 2] > 180 && data[i] < 80 && data[i + 1] < 130) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          count++;
        }
        if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) {
          redX += x;
          redY += y;
          red++;
        }
      }
    return {
      x: minX / c.width,
      y: minY / c.height,
      w: (maxX - minX + 1) / c.width,
      h: (maxY - minY + 1) / c.height,
      count,
      redX: redX / red / c.width,
      redY: redY / red / c.height,
    };
  });
  assert(actual.count > 100);
  for (const k of ["x", "y", "w", "h"])
    assert(
      Math.abs(expected[k] - actual[k]) < 0.015,
      `Export mismatch ${k}: ${expected[k]} / ${actual[k]}`,
    );
  assert(
    actual.redX < actual.x + actual.w / 2 &&
      actual.redY < actual.y + actual.h / 2,
  );
  await page.screenshot({ path: path.join(out, "reopened-export.png") });
  results.push(
    "Export reopened and blue/red pixels match on-screen geometry and image orientation",
  );
  // Navigate, invalid input, and modal keyboard dismissal.
  await clickLabel("Next page");
  await pause(300);
  assert.equal(await page.$eval(".footer-page b", (e) => e.textContent), "2");
  await clickLabel("Previous page");
  await pause(300);
  await clickLabel("Help");
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  const bad = path.join(out, "bad.pdf");
  await writeFile(bad, "not a pdf");
  await (await page.$('input[aria-label="Upload PDF"]')).uploadFile(bad);
  await page.waitForSelector('[role="alert"]');
  assert.equal(
    await page.$eval("h1", (e) => e.textContent),
    "upload-fixture-edited.pdf",
  );
  results.push(
    "Navigation, Escape dismissal, invalid PDF preserves current document",
  );
  const responsive = [];
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await pause(120);
    const m = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(m.scrollWidth <= m.width);
    responsive.push(m);
  }
  results.push("No document overflow at 6 viewport widths");
  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle0" });
  await ready();
  await page.screenshot({ path: path.join(out, "studio-mobile.png") });
  assert.equal(await page.$(".pages-panel"), null);
  await clickLabel("Pages panel");
  assert(await page.$(".pages-panel"));
  await clickLabel("Close panel");
  await clickLabel("Rotate page 90°");
  assert.equal(
    await page.$eval('[data-testid="rotation-status"]', (e) => e.textContent),
    "90°",
  );
  results.push("Mobile panel disclosure and editing controls");
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  results.push("Zero browser errors and failed HTTP assets");
  const report = {
    passed: results.length,
    results,
    errors,
    failed,
    responsive,
    exportGeometry: { expected, actual },
  };
  await writeFile(
    path.join(out, "e2e-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await page
    .screenshot({ path: path.join(out, "failure.png") })
    .catch(() => {});
  console.error(JSON.stringify({ results, errors, failed }, null, 2));
  throw e;
} finally {
  await browser.close();
}
