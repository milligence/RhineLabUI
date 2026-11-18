import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const dir = resolve(process.env.OPTICAL_REVIEW_OUTPUT || `${root}/output`);
const port = Number(process.env.OPTICAL_REVIEW_PORT || 5184);
const url = `http://127.0.0.1:${port}`;
const mode = process.argv[2] || "all";
assert(
  ["all", "research", "cube", "fit"].includes(mode),
  "Mode must be all, research, cube, or fit.",
);
await mkdir(dir, { recursive: true });
const start = Date.now();
const log = (text) =>
  console.log(`${((Date.now() - start) / 1000).toFixed(1)}s ${text}`);
const report = {
  mode,
  scope:
    "Actual isolated product modules and CSS; synthetic research fixture; generic 3³ Cube",
  render:
    mode === "research" || mode === "fit"
      ? "Native DOM/CSS rendering of research projection; no renderer replacement or rendering suppression; Cube WebGL is not exercised in this mode"
      : "Native browser rendering, including real WebGL for Cube; no route interception or rendering suppression",
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  layouts: [],
};
report.sourceSha256AtStart = Object.fromEntries(
  await Promise.all(
    [
      "projection-viewer.ts",
      "research-projection.ts",
      "cube-projection.ts",
      "cube-rotation.ts",
      "projection.css",
      "archive-template.css",
    ].map(async (name) => [
      name,
      createHash("sha256")
        .update(await readFile(`${repo}/src/${name}`))
        .digest("hex"),
    ]),
  ),
);
const saveReport = () =>
  writeFile(`${dir}/report-${mode}.json`, JSON.stringify(report, null, 2));
let browser;
const server = spawn(
  process.execPath,
  [
    `${repo}/node_modules/vite/bin/vite.js`,
    "--config",
    `${root}/vite.config.mjs`,
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (d) => {
  serverLog += d.toString();
});
server.stderr.on("data", (d) => {
  serverLog += d.toString();
  log(`VITE ${d.toString().trim().slice(0, 500)}`);
});
const deadline = setTimeout(() => {
  log("QA deadline reached; stopping browser and Vite.");
  browser?.close().catch(() => {});
  server.kill();
  process.exit(2);
}, 240000);
process.on("exit", () => server.kill());
process.on("SIGINT", () => {
  server.kill();
  process.exit(130);
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function step(name, action) {
  const began = Date.now();
  log(`CHECK ${name}`);
  try {
    const evidence = await action();
    report.checks.push({
      name,
      status: "pass",
      ms: Date.now() - began,
      evidence,
    });
  } catch (error) {
    report.checks.push({
      name,
      status: "fail",
      ms: Date.now() - began,
      error: error.message,
    });
    log(`FAIL ${name}: ${error.message.slice(0, 500)}`);
  }
  await saveReport();
}
const stats = (page) => page.evaluate(() => window.opticalQA.stats());
async function screenshot(page, name) {
  await page.screenshot({ path: `${dir}/${name}.png`, timeout: 15000 });
  report.screenshots.push({
    name,
    path: `${dir}/${name}.png`,
    stats: await stats(page),
    viewport: page.viewportSize(),
  });
  log(`PNG ${name}`);
  await saveReport();
}
async function layout(page, name) {
  const result = await page.evaluate(() => {
    const selectors = [
      ".projection-shell",
      ".projection-header",
      ".projection-content",
      ".research-stage",
      ".projection-inspector",
      ".projection-timeline",
      ".cube-toolbar",
      ".cube-stage",
      ".cube-inspector",
    ];
    const rects = Object.fromEntries(
      selectors.map((s) => {
        const e = document.querySelector(s);
        if (!e) return [s, null];
        const r = e.getBoundingClientRect(),
          css = getComputedStyle(e);
        return [
          s,
          {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            scrollWidth: e.scrollWidth,
            clientWidth: e.clientWidth,
            overflowX: css.overflowX,
            overflowY: css.overflowY,
          },
        ];
      }),
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      rects,
      fontLoaded: document.fonts.check("16px MiSans"),
    };
  });
  report.layouts.push({ name, ...result });
  assert(
    result.document.width <= result.viewport.width + 1,
    `document width ${result.document.width} exceeds ${result.viewport.width}`,
  );
  const shell = result.rects[".projection-shell"];
  assert(
    shell && shell.x >= -1 && shell.width <= result.viewport.width + 1,
    "projection exceeds horizontal viewport",
  );
  const timeline = result.rects[".projection-timeline"];
  if (timeline)
    assert(
      timeline.y + timeline.height <= result.viewport.height + 1,
      "timeline clipped below viewport",
    );
  for (const s of [
    ".projection-header",
    ".projection-content",
    ".projection-timeline",
    ".cube-toolbar",
  ]) {
    const r = result.rects[s];
    if (r)
      assert(
        r.scrollWidth <= r.clientWidth + 2,
        `${s} internal horizontal overflow ${r.scrollWidth}/${r.clientWidth}`,
      );
  }
  return result;
}
async function loadPage(context, theme = "light", reduced = true) {
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    report.errors.push({ url: page.url(), message: error.message });
    log(`PAGE ERROR ${error.message.slice(0, 300)}`);
  });
  await page.goto(`${url}/?theme=${theme}&reduced=${reduced ? 1 : 0}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForFunction(() => window.opticalQA?.ready, null, {
    timeout: 15000,
  });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function touchGesture(page, kind) {
  const selector = kind === "research" ? ".research-stage" : ".cube-view";
  await page.locator(selector).scrollIntoViewIfNeeded();
  const r = await page.locator(selector).boundingBox();
  const before = (await stats(page))[kind];
  const cx = r.x + r.width / 2,
    cy = r.y + r.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const point = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(0, cx - 30, cy), point(1, cx + 30, cy)],
  });
  for (let i = 1; i <= 5; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        point(0, cx - 30 - 6 * i, cy - 3 * i),
        point(1, cx + 30 + 6 * i, cy + 3 * i),
      ],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await delay(100);
  const after = (await stats(page))[kind];
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await session.detach();
  if (kind === "research") {
    assert(after.scale > before.scale);
    assert.equal(after.selected, before.selected);
  } else {
    assert.notDeepEqual(
      after.inspectionQuaternion,
      before.inspectionQuaternion,
    );
    assert.notEqual(after.inspectionDistance, before.inspectionDistance);
    assert.deepEqual(after.observer, before.observer);
    assert.equal(after.countRevision, before.countRevision);
  }
  return { before, after, input: "Chromium native two-point touch dispatch" };
}
async function researchFitReview(context) {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 320, height: 740 },
  ]) {
    const key = `${viewport.width}x${viewport.height}`;
    const page = await loadPage(context, "light", true);
    page.setDefaultTimeout(6000);
    await page.setViewportSize(viewport);
    await page.locator("#open-research").click();
    await delay(100);
    await screenshot(page, `research-final-${key}-light`);
    await page.evaluate(() => window.opticalQA.setTheme(true));
    await screenshot(page, `research-final-${key}-dark`);
    await page.evaluate(() => window.opticalQA.setTheme(false));
    let fitted;
    await step(
      `Research overview fits every node inside the unobstructed stage ${key}`,
      async () => {
        const initial = (await stats(page)).research;
        assert(
          initial.scale >= 0.84 - 0.00001,
          "first entry must retain readable node scale",
        );
        await page.locator('[data-map="fit"]').click();
        fitted = (await stats(page)).research;
        const bounds = await page.evaluate(() => {
          const rect = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          };
          return {
            stage: rect(".research-stage"),
            label: rect(".research-stage-label"),
            tools: rect(".research-map-tools"),
            nodes: [...document.querySelectorAll(".research-node")].map(
              (node) => {
                const r = node.getBoundingClientRect();
                return {
                  id: node.dataset.node,
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                };
              },
            ),
          };
        });
        for (const node of bounds.nodes) {
          assert(
            node.left >= bounds.stage.left - 1 &&
              node.right <= bounds.stage.right + 1,
            `${node.id} falls outside stage width`,
          );
          assert(
            node.top >= bounds.label.bottom + 1 &&
              node.bottom <= bounds.tools.top - 1,
            `${node.id} intersects stage label or tools`,
          );
        }
        await screenshot(page, `research-fit-${key}`);
        return { initial, fitted, bounds };
      },
    );
    await step(
      `Research Home returns to the same whole-graph overview ${key}`,
      async () => {
        await page.locator('[data-map="in"]').click();
        await page.locator(".research-stage").focus();
        await page.keyboard.press("Home");
        const after = (await stats(page)).research;
        assert(Math.abs(after.scale - fitted.scale) < 0.00001);
        assert(
          Math.abs(after.x - fitted.x) < 0.1 &&
            Math.abs(after.y - fitted.y) < 0.1,
        );
        return after;
      },
    );
    await step(
      `Research overview wheel zoom is continuous and survives close/reopen ${key}`,
      async () => {
        const before = (await stats(page)).research;
        const r = await page.locator(".research-stage").boundingBox();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.wheel(0, -100);
        await delay(100);
        const zoomed = (await stats(page)).research;
        const ratio = zoomed.scale / before.scale;
        assert(
          ratio > 1 && ratio < 1.5,
          `small wheel input jumped by ${ratio.toFixed(3)}x`,
        );
        assert.equal(zoomed.selected, before.selected);
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !window.opticalQA.stats().open);
        assert.equal(
          await page.evaluate(() => document.activeElement?.id),
          "open-research",
        );
        await page.locator("#open-research").click();
        await delay(100);
        const restored = (await stats(page)).research;
        assert(Math.abs(restored.scale - zoomed.scale) < 0.00001);
        assert(
          Math.abs(restored.x - zoomed.x) < 0.1 &&
            Math.abs(restored.y - zoomed.y) < 0.1,
        );
        return { before, zoomed, restored, ratio };
      },
    );
    if (viewport.width === 1440)
      await step(
        "Disposing during animated close immediately restores inert state and focus",
        async () => {
          const result = await page.evaluate(() => {
            window.opticalQA.setReduced(false);
            window.opticalQA.closeAnimated();
            const closing =
              document.querySelector(".projection-shell").dataset.state;
            window.opticalQA.dispose();
            return {
              closing,
              open: window.opticalQA.stats().open,
              modalPresent: !!document.querySelector(".projection-shell"),
              inert: document.querySelector("#qa-launcher").inert,
              focus: document.activeElement?.id,
            };
          });
          assert.equal(result.closing, "closing");
          assert.equal(result.open, false);
          assert.equal(result.modalPresent, false);
          assert.equal(result.inert, false);
          assert.equal(result.focus, "open-research");
          return result;
        },
      );
    await page.close();
  }
}
try {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) break;
    } catch {}
    await delay(150);
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: JSON.parse(process.env.CHROMIUM_ARGS || "[]"),
    timeout: 15000,
  });
  log("Headless browser and isolated Vite ready");
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const page = await loadPage(context, "light", false);
  page.setDefaultTimeout(6000);
  if (mode !== "cube" && mode !== "fit") {
    await page.locator("#open-research").click();
    await page.waitForFunction(
      () => window.opticalQA.stats().research?.nodeCount === 5,
    );
    await delay(450);
    await screenshot(page, "research-desktop-light");
    await step(
      "Research pointer node selection synchronizes retrospective",
      async () => {
        await page.locator('[data-node="qa-node-1"]').click();
        const s = await stats(page);
        assert.equal(s.research.selected, "qa-node-1");
        assert.equal(s.research.retrospectiveNode, "qa-node-1");
        assert.match(
          await page.locator(".projection-recap").innerText(),
          /复盘样本 2/,
        );
        return s.research;
      },
    );
    await step("Research timeline scrub selects matching node", async () => {
      await page.locator(".projection-scrubber input").fill("2");
      const s = await stats(page);
      assert.equal(s.research.selected, "qa-node-2");
      assert.equal(s.research.retrospectiveNode, "qa-node-2");
      assert.match(
        await page.locator(".projection-recap").innerText(),
        /复盘样本 3/,
      );
      return s.research;
    });
    await step(
      "Research replay advances and pause freezes its timeline",
      async () => {
        await page.locator(".projection-scrubber input").fill("0");
        await page.locator('[data-research="play"]').click();
        await page.waitForFunction(
          () => window.opticalQA.stats().research?.selected === "qa-node-1",
          null,
          { timeout: 8000 },
        );
        await page.locator('[data-research="play"]').click();
        const before = await page
          .locator(".projection-scrubber input")
          .inputValue();
        await delay(350);
        const after = await page
          .locator(".projection-scrubber input")
          .inputValue();
        assert.equal(after, before);
        assert.equal((await stats(page)).research.playing, false);
        return { before, after, state: (await stats(page)).research };
      },
    );
    await step(
      "Research pan and wheel zoom operate without changing selected node",
      async () => {
        const before = (await stats(page)).research;
        const r = await page.locator(".research-stage").boundingBox();
        await page.mouse.move(r.x + r.width * 0.42, r.y + r.height * 0.72);
        await page.mouse.down();
        await page.mouse.move(
          r.x + r.width * 0.42 + 65,
          r.y + r.height * 0.72 - 25,
          { steps: 8 },
        );
        await page.mouse.up();
        await page.mouse.wheel(0, -100);
        await delay(100);
        const after = (await stats(page)).research;
        assert(Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 5);
        assert(after.scale > before.scale);
        assert.equal(after.selected, before.selected);
        return { before, after };
      },
    );
    await step(
      "Research view state survives close/reopen; Escape restores opener focus",
      async () => {
        const before = (await stats(page)).research;
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !window.opticalQA.stats().open);
        assert.equal(
          await page.evaluate(() => document.activeElement?.id),
          "open-research",
        );
        assert.equal(
          await page.locator("#qa-launcher").evaluate((e) => e.inert),
          false,
        );
        await page.locator("#open-research").click();
        await delay(450);
        const after = (await stats(page)).research;
        assert.equal(after.selected, before.selected);
        assert(Math.abs(after.scale - before.scale) < 0.0001);
        assert(
          Math.abs(after.x - before.x) < 0.1 &&
            Math.abs(after.y - before.y) < 0.1,
          `pan not restored: ${JSON.stringify({ before, after })}`,
        );
        return { before, after };
      },
    );
    await step("Projection traps keyboard focus", async () => {
      await page.locator(".projection-back").focus();
      await page.keyboard.press("Shift+Tab");
      const last = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        inside: !!document.activeElement?.closest(".projection-shell"),
      }));
      assert(last.inside);
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement?.className),
        "projection-back",
      );
      return last;
    });
    await step(
      "Research reduced motion can be enabled while open",
      async () => {
        await page.evaluate(() => window.opticalQA.setReduced(true));
        assert.equal((await stats(page)).research.reducedMotion, true);
        return (await stats(page)).research;
      },
    );
    await step("Desktop research layout stays in viewport", () =>
      layout(page, "research-desktop-light"),
    );
    await page.evaluate(() => window.opticalQA.close());
  }

  if (mode !== "research" && mode !== "fit") {
    await page
      .locator("#open-cube")
      .click({ noWaitAfter: true, timeout: 30000 });
    await page.waitForFunction(
      () =>
        window.opticalQA.stats().cube?.ready &&
        !window.opticalQA.stats().cube?.countPending,
      null,
      { timeout: 30000 },
    );
    await screenshot(page, "cube-desktop-light");
    await step(
      "Cube is genuinely rendered with 27 cells and a finite pixel estimate",
      async () => {
        const c = (await stats(page)).cube;
        assert.equal(c.present, 27);
        assert.equal(c.n, 3);
        assert.equal(c.error, "");
        assert(Number.isFinite(c.visibleCount));
        assert(c.countPasses > 0);
        return c;
      },
    );
    await step(
      "Cube free rotation and zoom preserve mathematical observer and visibility revision",
      async () => {
        const before = (await stats(page)).cube;
        const r = await page.locator(".cube-view").boundingBox();
        await page.mouse.move(r.x + r.width * 0.48, r.y + r.height * 0.52);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * 0.34, {
          steps: 14,
        });
        await page.mouse.up();
        await page.mouse.wheel(0, -100);
        await delay(250);
        const after = (await stats(page)).cube;
        assert.notDeepEqual(
          after.inspectionQuaternion,
          before.inspectionQuaternion,
        );
        assert.notEqual(after.inspectionDistance, before.inspectionDistance);
        assert.deepEqual(after.observer, before.observer);
        assert.equal(after.countRevision, before.countRevision);
        assert.equal(after.visibleCount, before.visibleCount);
        return { before, after };
      },
    );
    await step(
      "Cube slice remove/undo/redo changes and restores occupied cells",
      async () => {
        await page.locator('[data-tool="remove"]').click();
        await page.locator('[data-cell="13"]').click();
        let c = (await stats(page)).cube;
        assert.equal(c.present, 26);
        assert(c.undo > 0);
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("data-cell"),
          ),
          "13",
          "edited grid cell loses keyboard focus",
        );
        await page.locator('[data-action="undo"]').click();
        assert.equal((await stats(page)).cube.present, 27);
        await page.locator('[data-action="redo"]').click();
        assert.equal((await stats(page)).cube.present, 26);
        await page.locator('[data-action="undo"]').click();
        return (await stats(page)).cube;
      },
    );
    await step(
      "Cube mathematical observer drag changes point and triggers a new estimate",
      async () => {
        const before = (await stats(page)).cube;
        await page.locator(".cube-observer-view").scrollIntoViewIfNeeded();
        const r = await page.locator(".cube-observer-view").boundingBox();
        await page.mouse.move(r.x + r.width * 0.45, r.y + r.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width * 0.6, r.y + r.height * 0.4, {
          steps: 10,
        });
        await page.mouse.up();
        await page.waitForFunction(
          (revision) =>
            window.opticalQA.stats().cube.countRevision > revision &&
            !window.opticalQA.stats().cube.countPending,
          before.countRevision,
          { timeout: 6000 },
        );
        const after = (await stats(page)).cube;
        assert.notDeepEqual(after.observer.eye, before.observer.eye);
        return { before, after };
      },
    );
    await step(
      "Cube preset switch synchronizes retrospective and edited state persists after close",
      async () => {
        await page.locator(".cube-preset-rail select").selectOption("1");
        assert.equal((await stats(page)).cube.present, 26);
        assert.equal(
          await page
            .locator(".cube-experiment-recap")
            .getAttribute("data-experiment"),
          "qa-cube-gap",
        );
        await page.locator(".cube-experiment-recap summary").click();
        assert.match(
          await page.locator(".cube-recap-content").innerText(),
          /中心空格样本/,
        );
        await page.locator('[data-tool="remove"]').click();
        await page.locator('[data-cell="12"]').click();
        assert.equal((await stats(page)).cube.present, 25);
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !window.opticalQA.stats().open);
        assert.equal(
          await page.evaluate(() => document.activeElement?.id),
          "open-cube",
        );
        await page.locator("#open-cube").click();
        await page.waitForFunction(() => window.opticalQA.stats().cube?.ready);
        assert.equal((await stats(page)).cube.present, 25);
        assert.equal(
          await page.locator(".cube-preset-rail select").inputValue(),
          "1",
        );
        return (await stats(page)).cube;
      },
    );
    await step(
      "Cube free inspection orientation and distance survive close/reopen",
      async () => {
        await page.locator('[data-tool="inspect"]').click();
        await page.locator(".cube-view").scrollIntoViewIfNeeded();
        await page.evaluate(() => window.opticalQA.setReduced(true));
        const r = await page.locator(".cube-view").boundingBox();
        await page.mouse.move(r.x + r.width * 0.48, r.y + r.height * 0.52);
        await page.mouse.down();
        await page.mouse.move(r.x + r.width * 0.63, r.y + r.height * 0.42, {
          steps: 12,
        });
        await page.mouse.up();
        await page.mouse.wheel(0, -70);
        await delay(100);
        const before = (await stats(page)).cube;
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => !window.opticalQA.stats().open);
        await page
          .locator("#open-cube")
          .click({ noWaitAfter: true, timeout: 30000 });
        await page.waitForFunction(
          () =>
            window.opticalQA.stats().cube?.ready &&
            !window.opticalQA.stats().cube.countPending,
        );
        const after = (await stats(page)).cube;
        assert(
          before.inspectionQuaternion.every(
            (v, i) => Math.abs(v - after.inspectionQuaternion[i]) < 0.00001,
          ),
          "inspection orientation not restored",
        );
        assert(
          Math.abs(before.inspectionDistance - after.inspectionDistance) <
            0.00001,
          "inspection distance not restored",
        );
        assert.deepEqual(after.observer, before.observer);
        assert.equal(after.present, before.present);
        return { before, after };
      },
    );
    await step("Desktop cube layout stays in viewport", () =>
      layout(page, "cube-desktop-light"),
    );
  }
  await page.close();

  if (mode === "fit") await researchFitReview(context);

  if (mode !== "fit")
    for (const viewport of [
      { width: 1440, height: 960 },
      { width: 390, height: 844 },
      { width: 320, height: 740 },
    ]) {
      for (const theme of ["light", "dark"]) {
        const key = `${viewport.width}x${viewport.height}-${theme}`;
        log(`MATRIX ${key}`);
        const p = await loadPage(context, theme, true);
        p.setDefaultTimeout(6000);
        await p.setViewportSize(viewport);
        for (const kind of mode === "all" ? ["research", "cube"] : [mode]) {
          await step(`${kind} visual/layout ${key}`, async () => {
            await p
              .locator(`#open-${kind}`)
              .click({
                noWaitAfter: true,
                timeout: kind === "cube" ? 30000 : 6000,
              });
            if (kind === "cube")
              await p.waitForFunction(
                () =>
                  window.opticalQA.stats().cube?.ready &&
                  !window.opticalQA.stats().cube.countPending,
                null,
                { timeout: 30000 },
              );
            else await delay(150);
            await screenshot(p, `${kind}-${key}`);
            const result = await layout(p, `${kind}-${key}`);
            // At mobile widths, capture the same actual scroll surface where the
            // retrospective/observer controls continue below the initial canvas.
            if (viewport.width < 500) {
              const scrollSelector =
                kind === "research" ? ".research-body" : ".projection-content";
              await p
                .locator(scrollSelector)
                .evaluate(
                  (e, top) => (e.scrollTop = top),
                  kind === "research" ? 340 : 500,
                );
              await screenshot(p, `${kind}-${key}-reading`);
            }
            return result;
          });
          if (viewport.width === 390 && theme === "light")
            await step(`${kind} native two-finger pinch/twist input`, () =>
              touchGesture(p, kind),
            );
          await p.evaluate(() => window.opticalQA.close());
        }
        await p.close();
      }
    }
  report.finishedAt = new Date().toISOString();
  report.elapsedSeconds = (Date.now() - start) / 1000;
  report.summary = {
    pass: report.checks.filter((c) => c.status === "pass").length,
    fail: report.checks.filter((c) => c.status === "fail").length,
    pageErrors: report.errors.length,
    screenshots: report.screenshots.length,
  };
  if (report.summary.fail || report.summary.pageErrors) process.exitCode = 1;
  await saveReport();
  log(`COMPLETE ${JSON.stringify(report.summary)}`);
} catch (error) {
  process.exitCode = 1;
  report.fatal = { message: error.message, stack: error.stack, serverLog };
  await saveReport();
  log(`FATAL ${error.message}`);
} finally {
  await browser?.close().catch(() => {});
  server.kill();
  clearTimeout(deadline);
}
