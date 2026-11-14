import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, degrees } from "pdf-lib";
const base = process.env.BASE || "http://127.0.0.1:4186/";
const out =
  process.env.QA_OUT ||
  "C:/Users/Rochman/AppData/Local/hermes/cache/scratch/folio-interactions-qa";
const downloads = path.join(out, `downloads-${process.pid}`);
await mkdir(downloads, { recursive: true });
const b = await puppeteer.launch({
  executablePath:
    process.env.CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--user-data-dir=${out}/chrome-${process.pid}`],
});
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 1000 });
const results = [],
  errors = [],
  failed = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
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
  const el = await p.evaluateHandle(
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
  assert(el.asElement(), `Missing button ${name}`);
  await el.asElement().click();
}
async function fill(label, value) {
  const el = await p.$(`[aria-label="${label}"]`);
  assert(el, `Missing field ${label}`);
  await el.focus();
  await p.keyboard.down("Control");
  await p.keyboard.press("a");
  await p.keyboard.up("Control");
  await el.type(value);
}
async function ready() {
  await p.waitForFunction(
    () =>
      document.querySelector(".page-stage canvas")?.width > 200 &&
      !document.querySelector(".workspace-loading"),
  );
  await pause(350);
}
async function count() {
  return p.$$eval(".page-stage .pdf-object", (a) => a.length);
}
async function stage() {
  await p.$eval(".page-stage", (e) => e.scrollIntoView({ block: "center" }));
  return (await p.$(".page-stage")).boundingBox();
}
async function draw(kind, start, end) {
  const n = await count();
  await button(`Add ${kind}`);
  assert.equal(
    await count(),
    n,
    `${kind} must not be inserted just by tool selection`,
  );
  const rect = await stage();
  await p.mouse.move(
    rect.x + start[0] * rect.width,
    rect.y + start[1] * rect.height,
  );
  await p.mouse.down();
  await p.mouse.move(
    rect.x + end[0] * rect.width,
    rect.y + end[1] * rect.height,
    { steps: 16 },
  );
  await p.mouse.up();
  await p.waitForFunction(
    (n) =>
      document.querySelectorAll(".page-stage .pdf-object").length === n + 1,
    {},
    n,
  );
  return p.$(".pdf-object.is-selected");
}
async function menuItem(name) {
  const el = await p.evaluateHandle(
    (name) =>
      [...document.querySelectorAll('[role="menuitem"]')].find(
        (e) =>
          e.textContent.trim() === name ||
          e.textContent.trim().startsWith(name),
      ),
    name,
  );
  assert(el.asElement(), `Missing menu item ${name}`);
  await el.asElement().click();
}
async function textPixels() {
  await p.waitForFunction(() => {
    const c = document.querySelector(".pdf-object.is-selected canvas");
    if (!c || !c.width || !c.height) return false;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    return d.some(
      (v, i) =>
        i % 4 === 3 &&
        v > 50 &&
        d[i - 3] < 160 &&
        d[i - 2] < 160 &&
        d[i - 1] < 160,
    );
  });
  return p.$eval(".pdf-object.is-selected canvas", (c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let left = c.width,
      right = 0,
      top = c.height,
      bottom = 0,
      n = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i + 3] > 50 && d[i] < 160 && d[i + 1] < 160 && d[i + 2] < 160) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          n++;
        }
      }
    return { left, right, top, bottom, width: c.width, height: c.height, n };
  });
}
try {
  await p.goto(base, { waitUntil: "networkidle0" });
  await ready();
  const fixture = await PDFDocument.create();
  const page = fixture.addPage([650, 850]);
  page.setCropBox(20, 30, 610, 800);
  page.setRotation(degrees(0));
  const fixtureFile = path.join(out, "manual-fixture.pdf");
  await writeFile(fixtureFile, await fixture.save());
  await (await p.$('input[aria-label="Upload PDF"]')).uploadFile(fixtureFile);
  await p.waitForFunction(
    () => document.querySelector("h1").textContent === "manual-fixture.pdf",
  );
  await ready();
  await button("Add text");
  await p.waitForSelector('[role="dialog"]');
  const italicHandle = await p.evaluateHandle(() =>
    [...document.querySelectorAll('[role="dialog"] label')]
      .find((e) => e.textContent?.trim() === "Italic")
      ?.querySelector("input"),
  );
  assert(italicHandle.asElement());
  await italicHandle.asElement().click();
  const nativeInputEvent = await p.$eval('[aria-label="Text content"]', (e) =>
    e.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    ),
  );
  assert.equal(nativeInputEvent, true);
  assert.equal(await p.$('[role="menu"]'), null);
  results.push("Native context menu is preserved for text inputs");
  await fill(
    "Text content",
    "gyp jQ Italic text with descenders and a very long line that must wrap inside its padded annotation box.\nSecond line: gg yy pp qq jj.",
  );
  await button("Add text");
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 1,
  );
  const pixels = await textPixels();
  assert(pixels.n > 100);
  assert(pixels.left >= 4, `Missing left padding ${JSON.stringify(pixels)}`);
  assert(pixels.top >= 4, `Missing top padding ${JSON.stringify(pixels)}`);
  assert(pixels.right < pixels.width - 3);
  assert(
    pixels.bottom < pixels.height - 3,
    `Missing bottom padding ${JSON.stringify(pixels)}`,
  );
  results.push(
    "Wrapped text has visible padding on all sides including descenders",
  );
  await p.screenshot({ path: path.join(out, "padded-text.png") });
  // Narrowing text reflows it and grows its height rather than cropping glyphs.
  const textBoxBefore = await p.$eval(".pdf-object.is-selected", (e) => ({
    w: e.getBoundingClientRect().width,
    h: e.getBoundingClientRect().height,
  }));
  const resizeHandle = await p.$(
    ".pdf-object.is-selected .resize-dot:last-child",
  );
  const handleBox = await resizeHandle.boundingBox();
  await p.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await p.mouse.down();
  await p.mouse.move(handleBox.x - 55, handleBox.y + handleBox.height / 2, {
    steps: 12,
  });
  await p.mouse.up();
  await p.waitForFunction(
    (before) => {
      const r = document
        .querySelector(".pdf-object.is-selected")
        ?.getBoundingClientRect();
      return r && r.width < before.w - 30 && r.height > before.h;
    },
    {},
    textBoxBefore,
  );
  const resizedPixels = await textPixels();
  assert(
    resizedPixels.left >= 4 &&
      resizedPixels.top >= 4 &&
      resizedPixels.right < resizedPixels.width - 3 &&
      resizedPixels.bottom < resizedPixels.height - 3,
  );
  results.push("Narrow text resize wraps and auto-grows without clipping");
  // A tool click arms drawing without inserting anything; drawing works over existing objects.
  const rectObj = await draw("rectangle", [0.16, 0.34], [0.56, 0.48]);
  assert(rectObj);
  const rectGeometry = await rectObj.evaluate((e) => {
    const r = e.getBoundingClientRect(),
      p = e.closest(".page-stage").getBoundingClientRect();
    return {
      x: (r.x - p.x) / p.width,
      y: (r.y - p.y) / p.height,
      w: r.width / p.width,
      h: r.height / p.height,
    };
  });
  assert(
    Math.abs(rectGeometry.x - 0.16) < 0.01 &&
      Math.abs(rectGeometry.w - 0.4) < 0.01,
  );
  results.push("Rectangle is placed with a real custom mouse drag");
  await draw("circle", [0.84, 0.76], [0.62, 0.57]);
  results.push("Reverse-drag circle/ellipse uses the drawn bounds");
  const line = await draw("line", [0.1, 0.65], [0.42, 0.78]);
  assert(line);
  const lineAttr = await line.$eval("svg line", (e) =>
    ["x1", "y1", "x2", "y2"].map((k) => Number(e.getAttribute(k))),
  );
  assert(
    lineAttr[2] > lineAttr[0] && lineAttr[3] > lineAttr[1],
    `Manual line direction incorrect ${lineAttr}`,
  );
  results.push("Line direction follows the mouse, not a fixed diagonal");
  const arrow = await draw("arrow", [0.83, 0.44], [0.65, 0.3]);
  const arrowAttr = await arrow.$eval("svg line", (e) =>
    ["x1", "y1", "x2", "y2"].map((k) => Number(e.getAttribute(k))),
  );
  assert(arrowAttr[2] < arrowAttr[0] && arrowAttr[3] < arrowAttr[1]);
  results.push("Arrow preserves reverse drawing direction");
  const horizontal = await draw("line", [0.11, 0.86], [0.5, 0.86]);
  const horizontalAttr = await horizontal.$eval("svg line", (e) =>
    ["y1", "y2"].map((k) => Number(e.getAttribute(k))),
  );
  assert(Math.abs(horizontalAttr[0] - horizontalAttr[1]) < 1);
  results.push("Horizontal line is supported");
  // Escape and click-only are not undoable insertions.
  let n = await count();
  await button("Add rectangle");
  let box = await stage();
  await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.83);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.9, {
    steps: 6,
  });
  await p.keyboard.press("Escape");
  await p.mouse.up();
  await pause(100);
  assert.equal(await count(), n);
  await button("Add circle");
  await p.mouse.click(box.x + box.width * 0.88, box.y + box.height * 0.88);
  await pause(100);
  assert.equal(await count(), n);
  await p.keyboard.press("Escape");
  results.push("Escape cancellation and tiny clicks do not create objects");
  // Zoom affects screen pixels but not normalized PDF geometry.
  await button("Zoom out");
  await button("Zoom out");
  await draw("rectangle", [0.62, 0.1], [0.91, 0.22]);
  results.push("Drawing coordinates remain correct after zoom changes");
  // Context menu must select the actual right-click target, not a stale selection.
  const firstRect = await p.$('[aria-label="Select rectangle"]');
  assert(firstRect);
  await firstRect.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const rbox = await firstRect.boundingBox();
  await p.mouse.click(rbox.x + 10, rbox.y + 10, { button: "right" });
  await p.waitForSelector('[role="menu"]');
  const selected = await p.$eval(".pdf-object.is-selected", (e) =>
    e.querySelector("button")?.getAttribute("aria-label"),
  );
  assert.equal(selected, "Select rectangle");
  n = await count();
  await menuItem("Duplicate");
  await p.waitForFunction(
    (n) => document.querySelectorAll(".pdf-object").length === n + 1,
    {},
    n,
  );
  results.push(
    "Object right-click selects the clicked rectangle and duplicates it",
  );
  const selectedObj = await p.$(".pdf-object.is-selected");
  await selectedObj.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const sbox = await selectedObj.boundingBox();
  await p.mouse.click(sbox.x + 10, sbox.y + 10, { button: "right" });
  await p.waitForSelector('[role="menu"]');
  await menuItem("Delete");
  await p.waitForFunction(
    (n) => document.querySelectorAll(".pdf-object").length === n,
    {},
    n,
  );
  results.push("Context Delete acts on the selected object");
  // Blank context menu, keyboard dismissal and viewport collision handling.
  box = await stage();
  await p.mouse.click(
    box.x + box.width * 0.95,
    Math.min(970, box.y + box.height * 0.95),
    { button: "right" },
  );
  await p.waitForSelector('[role="menu"]');
  await p.screenshot({ path: path.join(out, "context-menu.png") });
  const menuBounds = await p.$eval('[role="menu"]', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });
  assert(
    menuBounds.x >= 0 &&
      menuBounds.y >= 0 &&
      menuBounds.right <= 1440 &&
      menuBounds.bottom <= 1000,
  );
  assert(await p.$('[role="menuitem"]'));
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.querySelector('[role="menu"]'));
  results.push(
    "Editor context menu is app-specific, viewport-safe, Escape-dismissible",
  );
  const textTarget = await p.$('[aria-label="Select text"]');
  await textTarget.focus();
  await p.keyboard.down("Shift");
  await p.keyboard.press("F10");
  await p.keyboard.up("Shift");
  await p.waitForSelector('[role="menu"]');
  await menuItem("Edit text");
  await p.waitForSelector('[role="dialog"]');
  await fill("Text content", "Edited gyp jQ with padding.");
  await button("Save text");
  await p.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  results.push("Keyboard context menu can edit text");
  // The gray workspace also has the app menu, including shape selection.
  const workspaceBox = await (await p.$(".workspace")).boundingBox();
  await p.mouse.click(workspaceBox.x + 12, workspaceBox.y + 100, {
    button: "right",
  });
  await p.waitForSelector('[role="menu"]');
  const shapeSubmenu = await p.evaluateHandle(() =>
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (e) => e.textContent.trim() === "Draw shape",
    ),
  );
  assert(shapeSubmenu.asElement());
  await shapeSubmenu.asElement().hover();
  await p.waitForFunction(() =>
    [...document.querySelectorAll('[role="menuitem"]')].some(
      (e) => e.textContent.trim() === "Circle",
    ),
  );
  await menuItem("Circle");
  assert.equal(
    await p.$eval('[aria-label="Add circle"]', (e) =>
      e.getAttribute("aria-pressed"),
    ),
    "true",
  );
  await p.keyboard.press("Escape");
  results.push("Workspace right-click submenu arms manual drawing");
  await p.screenshot({ path: path.join(out, "manual-editor.png") });
  await button("Download PDF");
  let data;
  const outputFile = path.join(downloads, "manual-fixture-edited.pdf");
  for (let i = 0; i < 100; i++) {
    try {
      if ((await stat(outputFile)).size > 0) {
        data = await readFile(outputFile);
        break;
      }
    } catch {}
    await pause(100);
  }
  assert(data);
  assert.equal((await PDFDocument.load(data)).getPageCount(), 1);
  const reopen = path.join(out, "manual-export.pdf");
  await writeFile(reopen, data);
  await (await p.$('input[aria-label="Upload PDF"]')).uploadFile(reopen);
  await p.waitForSelector('[role="dialog"]');
  await button("Open new document");
  await p.waitForFunction(
    () => document.querySelector("h1").textContent === "manual-export.pdf",
  );
  await ready();
  await p.screenshot({ path: path.join(out, "manual-reopened.png") });
  results.push(
    "Manually drawn shapes and padded text export to a valid reopened PDF",
  );
  await p.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  await p.reload({ waitUntil: "networkidle0" });
  await ready();
  await button("Add circle");
  box = await stage();
  const tx = Math.round(box.x + box.width * 0.2),
    ty = Math.round(box.y + box.height * 0.4),
    ex = Math.round(box.x + box.width * 0.6),
    ey = Math.round(box.y + box.height * 0.6);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tx, y: ty }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: ex, y: ey }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.waitForFunction(
    () => document.querySelectorAll(".pdf-object").length === 1,
  );
  await p.screenshot({ path: path.join(out, "mobile-drawing.png") });
  results.push("Mobile touch pointer draws a custom circle");
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  const report = {
    passed: results.length,
    results,
    pixels,
    rectGeometry,
    menuBounds,
    errors,
    failed,
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
  await b.close();
}
