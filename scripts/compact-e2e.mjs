import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
const base = process.env.BASE || "http://127.0.0.1:4186/";
const out =
  process.env.QA_OUT ||
  "C:/Users/Rochman/AppData/Local/hermes/cache/scratch/folio-v120";
const downloads = path.join(out, `downloads-${process.pid}`);
await mkdir(downloads, { recursive: true });
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--user-data-dir=${out}/chrome-${process.pid}`],
});
const results = [],
  errors = [],
  requests = [];
const p = await browser.newPage();
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (e) => {
  if (e.type() === "error") errors.push(e.text());
});
p.on("request", (r) => requests.push(r.url()));
const cdp = await p.createCDPSession();
await cdp.send("Page.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: downloads,
});
async function click(label) {
  const el = await p.$(`button[aria-label="${label}"]`);
  assert(el, `Missing ${label}`);
  await el.click();
}
async function ready() {
  await p.waitForFunction(
    () =>
      document.querySelector(".page-stage canvas")?.width > 100 &&
      !document.querySelector(".workspace-loading"),
  );
  await new Promise((r) => setTimeout(r, 400));
}
try {
  const sizes = [];
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await p.setViewport({ width, height: 900 });
    await p.goto(base, { waitUntil: "networkidle0" });
    await ready();
    const value = await p.evaluate(() => {
      const toolbar = document
        .querySelector(".editor-toolbar")
        .getBoundingClientRect();
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        toolbarTop: toolbar.top,
        headerBottom: document
          .querySelector(".app-header")
          .getBoundingClientRect().bottom,
        documentHeaders: document.querySelectorAll(".document-header").length,
        rightDuplicateButtons: document.querySelectorAll(
          ".tools-panel .tool-card",
        ).length,
        h1: document.querySelector("h1")?.textContent,
        version: document.querySelector(".studio-version")?.textContent,
      };
    });
    assert.equal(value.documentHeaders, 0);
    assert.equal(value.rightDuplicateButtons, 0);
    assert(value.scrollWidth <= width);
    assert(Math.abs(value.toolbarTop - value.headerBottom) <= 1);
    assert.equal(value.h1, "Partnership proposal.pdf");
    assert(value.version.includes("1.2.1"));
    sizes.push(value);
    for (const label of ["Open PDF", "Download PDF"]) {
      const buttons=await p.$$(`button[aria-label="${label}"]`);
      assert.equal(buttons.length,1,`Exactly one ${label}`);
      const box = await (
        await p.$(`.header-actions button[aria-label="${label}"]`)
      ).boundingBox();
      assert(box && box.x >= width/2 && box.x+box.width<=width && box.y >= 0 && box.y + box.height <= value.headerBottom, JSON.stringify({label,width,box,headerBottom:value.headerBottom}));
    }
    if (width === 390 || width === 1440)
      await p.screenshot({ path: path.join(out, `compact-${width}.png`) });
  }
  results.push(
    "Header removed and toolbar directly below app header at 6 viewport widths",
    "Duplicate right-hand tools removed",
    "Single Open/download buttons visible on the right side of the global header",
    "Version 1.2.1 shown",
  );
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(base, { waitUntil: "networkidle0" });
  await ready();
  assert.equal(await p.$(".pages-panel"), null);
  await click("Pages panel");
  const panel = await p.$eval(".pages-panel", (e) => ({
    top: e.getBoundingClientRect().top,
    bottom: e.getBoundingClientRect().bottom,
  }));
  assert.equal(panel.top, 58);
  assert(panel.bottom <= 844);
  assert(await p.$(".pages-panel h1"));
  await click("Close panel");
  assert.equal(await p.$(".pages-panel"), null);
  results.push("Mobile sidebar moved to 58px with file information retained");
  const [chooser] = await Promise.all([
    p.waitForFileChooser(),
    click("Open PDF"),
  ]);
  assert(chooser);
  await chooser.cancel();
  results.push("Mobile Open PDF triggers real file chooser");
  await click("Download PDF");
  const file = path.join(downloads, "Partnership proposal-edited.pdf");
  let bytes;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await stat(file)).size > 0) {
        bytes = await readFile(file);
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(bytes);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3);
  results.push(
    "Mobile download works with sidebar closed and produces a valid 3-page PDF",
  );
  const badge = await p.evaluate(() => ({
    text: /powered by netlify/i.test(document.body.innerText),
    nodes: document.querySelectorAll(
      'netlify-hud,[id*="netlify"],[data-netlify-hud]',
    ).length,
    scripts: [...document.scripts]
      .map((s) => s.src)
      .filter((s) => s.includes("/.netlify/scripts/hud")),
  }));
  assert.equal(badge.text, false);
  assert.equal(badge.nodes, 0);
  assert.equal(badge.scripts.length, 0);
  assert(!requests.some((u) => u.includes("/.netlify/scripts/hud")));
  results.push("No Netlify built-with badge, HUD node, script, or request");
  assert.deepEqual(errors, []);
  const report = {
    base,
    passed: results.length,
    results,
    sizes,
    badge,
    errors,
  };
  await writeFile(
    path.join(out, "compact-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
