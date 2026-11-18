import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { validateContent, archiveText } from "./archive-content.mjs";

const template = JSON.parse(await readFile(new URL("../content/archives.json", import.meta.url), "utf8"));
function specimen() {
  const records = template.records.slice(0, 2);
  const names = records.map(r => r.category);
  return { layout: "collection", categories: names, columns: names, records: structuredClone(records) };
}
test("a two-record private collection validates without padding fictional records", () => {
  const content = specimen();
  assert.equal(validateContent(content).records.length, 2);
  content.columns.push("unoccupied"); content.categories.push("unoccupied");
  assert.throws(() => validateContent(content), /一至20/);
});
test("small and uneven collections retain valid reference slots and loop selections", async () => {
  const dir = await mkdtemp(join(tmpdir(), "archive-collection-"));
  try {
    await mkdir(join(dir, "src")); await mkdir(join(dir, "content"));
    await writeFile(join(dir, "package.json"), '{"type":"module"}');
    for (const name of ["data.ts", "archive-loop.ts"]) await copyFile(new URL(`../src/${name}`, import.meta.url), join(dir, "src", name));
    const content = specimen();
    for (const count of [2, 5]) {
      while (content.records.length < count) content.records.push({ ...content.records[1], id: `X-${String(content.records.length + 1).padStart(3, "0")}` });
      validateContent(content);
      await writeFile(join(dir, "content/archives.json"), JSON.stringify(content));
      execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
        import assert from 'node:assert/strict';
        import { records, fileAtSlot, fileLocation, columnFiles, archiveRowPeriod } from './src/data.ts';
        import { fileAtCell, selectionCell, wrap } from './src/archive-loop.ts';
        assert.ok(Number.isSafeInteger(archiveRowPeriod));
        for (let slot=0;slot<160;slot++) assert.ok(records[fileAtSlot(slot)]);
        for (let i=0;i<records.length;i++) assert.equal(fileAtSlot(fileLocation(i).slot),i);
        let cell={lane:2,row:12};
        for(let i=0;i<2000;i++) {
          const axis=i%5?'row':'lane', direction=i%7<3?-1:1;
          const lane=wrap(cell.lane+(axis==='lane'?direction:0),2);
          const files=columnFiles(lane);
          const record=files[wrap(cell.row-12+(axis==='row'?direction:0),files.length)];
          const next=selectionCell(record,cell,{axis,direction});
          assert.equal(fileAtCell(next),record); assert.equal(next[axis]-cell[axis],direction);
          assert.equal(fileAtCell({lane:next.lane-2,row:next.row-archiveRowPeriod}),record);
          cell=next;
        }
      `], { cwd: dir, stdio: "pipe" });
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("collection slot capacity cannot spill a record into the next catalog lane", () => {
  const content = specimen();
  content.categories = content.columns = [content.records[0].category];
  content.records = Array.from({ length: 21 }, (_, i) => ({ ...content.records[0], id: `X-${String(i + 1).padStart(3, "0")}` }));
  assert.throws(() => validateContent(content), /一至20/);
  content.records.pop();
  assert.equal(validateContent(content).records.length, 20);
});
test("story export preserves complete paragraphs and their narrative order", () => {
  const content = specimen(), record = content.records[0];
  record.chapters = [{ id: "first", title: "First event", paragraphs: ["First complete paragraph.", "Second complete paragraph."] }, { id: "second", title: "Later event", paragraphs: ["Final complete paragraph."] }];
  validateContent(content);
  const text = archiveText(record);
  assert.match(text, /First complete paragraph\.\n\nSecond complete paragraph\./);
  assert.ok(text.indexOf("First event") < text.indexOf("Later event"));
  assert.match(text, /Final complete paragraph\./);
});
test("research references cannot silently drop unknown or reversed edges", () => {
  const content = specimen();
  const node = (id, stage) => ({ id, stage, lane: 0, title: id, date: "fixture", status: "open", evidence: "test fixture", question: "", attempt: "", result: "", interpretation: "", retrospective: [], sources: [] });
  const projection = { kind: "research", label: "Fixture", description: "Synthetic validation only", nodes: [node("a", 0), node("b", 1)], edges: [{ from: "a", to: "b" }] };
  content.records[0].projection = projection;
  validateContent(content);
  projection.edges[0].to = "missing";
  assert.throws(() => validateContent(content), /连线/);
  projection.edges[0] = { from: "b", to: "a" };
  assert.throws(() => validateContent(content), /连线/);
});
test("research source links reject executable URLs", () => {
  const content = specimen();
  content.records[0].sources = [{ label: "Source", url: "javascript:alert(1)" }];
  assert.throws(() => validateContent(content), /HTTP/);
});
