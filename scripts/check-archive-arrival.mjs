// Timing and state regression checks. Real rendered keyframes are reviewed by
// reference/archive-flow-review; this script makes no visual acceptance claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { webArrayArrival, presentedOpeningTime, ArchiveDocumentArrival } from '../src/archive-arrival.ts';
import { DocumentDecryption } from '../src/document-decryption.ts';
import { DecryptionController } from '../src/decryption.ts';
import { ARRAY_OPENING_END } from '../src/wallpaper-opening.ts';

const bootSource = await readFile(new URL('../src/boot-motion.ts', import.meta.url), 'utf8');
const start = Number(bootSource.match(/export const ARRAY_REVEAL_START = ([\d.]+)/)?.[1]);
assert.ok(Number.isFinite(start));
const end = ARRAY_OPENING_END;
const checks = [];
const first = webArrayArrival(start, start, end);
const final = webArrayArrival(end, start, end);
assert.equal(first.opacity, 0);
assert.equal(first.field, 0);
assert.equal(final.opacity, 1);
assert.equal(final.field, 1);
assert.equal(final.camera, 1);
assert.equal(final.selection, 1);
assert.equal(final.brand, 1);
assert.equal(final.entryZ, 0);
assert.equal(final.phase, 'ready');
for (const key of ['opacity', 'field', 'camera', 'selection', 'entryZ', 'brand']) {
  let prior = first[key];
  for (let time = start; time <= end + .001; time += 1 / 240) {
    const current = webArrayArrival(time, start, end)[key];
    assert.ok(current >= prior - 1e-12, `${key} cannot reverse into a second entrance`);
    prior = current;
  }
}
assert.ok(webArrayArrival(start + .38, start, end).opacity < .15,
  'The old 380 ms edge-on cut cannot uncover a complete array');
const epsilon = .0001;
assert.ok((final.camera - webArrayArrival(end - epsilon, start, end).camera) / epsilon < 1e-6,
  'The final camera arrives with zero velocity');
checks.push('One monotone web arrival reaches the exact interactive field, lift and camera endpoint without a second wave packet');
assert.equal(webArrayArrival(start + .32 * (end - start), start, end).brand, 0);
assert.ok(Math.abs(webArrayArrival(start + .92 * (end - start), start, end).brand - 1) < 1e-12);
checks.push('Brand timing reaches its final value before the opening layout is released');

let presented = start - .12;
const caughtUp = presentedOpeningTime(end + 8, presented, start - .12, end);
assert.ok(caughtUp - presented <= .050000001);
assert.ok(caughtUp < start, 'A shader stall cannot skip the veil and jump to the array');
presented = caughtUp;
for (let frame = 0; frame < 90; frame++) {
  const next = presentedOpeningTime(end + 8, presented, start - .12, end);
  if (presented < end) assert.ok(next - presented <= .050000001);
  presented = next;
}
assert.ok(presented > end);
assert.equal(presentedOpeningTime(18, 23, start - .12, end), 18, 'Explicit backward seeks remain exact');
assert.equal(presentedOpeningTime(10, 9, start - .12, end), 10, 'Earlier 2D timing is unchanged');
checks.push('Slow first GPU frames advance the existing opening clock by at most 50 ms; earlier artwork and explicit seeks remain exact');

const paper = new ArchiveDocumentArrival();
for (let i = 0; i < 180; i++) paper.update(1 / 60, true, false, true, false);
assert.equal(paper.frame.visibility, 0, 'Clear glass cannot cover an unframed, still-extracting carrier');
for (let i = 0; i < 180; i++) paper.update(1 / 60, true, true, false, false);
assert.equal(paper.frame.visibility, 0, 'Physical readiness alone must not precede unsealing');
assert.equal(paper.frame.phase, 'unsealing');
paper.update(1 / 60, true, true, true, false);
assert.ok(paper.frame.visibility > 0 && paper.frame.visibility < .001, 'First paper frame is a gradual reveal');
let prior = paper.frame.visibility;
for (let i = 0; i < 70; i++) {
  paper.update(1 / 60, true, true, true, false);
  assert.ok(paper.frame.visibility >= prior);
  prior = paper.frame.visibility;
}
assert.equal(paper.frame.visibility, 1);
paper.update(1 / 60, true, false, false, false);
assert.equal(paper.frame.visibility, 1, 'Camera inspection cannot reseal a visible reading surface');
for (let i = 0; i < 20; i++) paper.update(1 / 60, false, false, false, false);
assert.equal(paper.frame.visibility, 0);
assert.equal(paper.frame.phase, 'hidden');
paper.reset();
paper.update(0, true, true, true, true);
assert.equal(paper.frame.visibility, 1, 'Reduced surface motion is immediate once actual readiness is satisfied');
paper.reset();
assert.equal(paper.frame.visibility, 0, 'New record entry cannot reuse the prior opaque paper');
checks.push('Paper waits for physical clearance, framed camera and current unsealing, reveals over 1.1 s, closes and resets without retaining opaque state');

const documentReveal = new DocumentDecryption();
documentReveal.reset({ querySelectorAll: () => [] }, false);
const clear = { clarity: 1 };
documentReveal.update(0, clear, false, 0);
documentReveal.update(10, clear, false, 0);
assert.equal(documentReveal.progress, 0, 'Text cannot finish behind an invisible paper');
documentReveal.update(10 + 1 / 60, clear, false, .1);
assert.ok(documentReveal.progress > 0 && documentReveal.progress < .02);
const beforeStall = documentReveal.progress;
documentReveal.update(30, clear, false, .2);
assert.ok(documentReveal.progress - beforeStall <= .05 / 1.1 + 1e-12,
  'Text cannot skip its visible unsealing after a GPU stall');
for (let i = 1; i <= 90; i++) documentReveal.update(30 + i / 60, clear, false, 1);
assert.equal(documentReveal.progress, 1);
checks.push('Text reveal begins on visible paper and uses presented frame increments rather than expiring behind a slow render');

// Execute the actual Scene.setMode method without a renderer. Full explicit
// film completion must keep its existing already-unsealed reading handoff.
const sceneSource = await readFile(new URL('../src/scene.ts', import.meta.url), 'utf8');
const sceneAst = ts.createSourceFile('scene.ts', sceneSource, ts.ScriptTarget.Latest, true);
const sceneClass = sceneAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'ArchiveScene');
const setMode = sceneClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(sceneAst) === 'setMode');
const modeContext = vm.createContext({});
vm.runInContext(ts.transpileModule(`class ModeHarness { ${setMode.getText(sceneAst)} }; globalThis.ModeHarness=ModeHarness;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, modeContext);
function modeHarness(arrival, clear) {
  const harness = new modeContext.ModeHarness();
  Object.assign(harness, {
    cancelPointer() {}, setHover() {}, targetDetail: 0, clock: 0, rotation: 0,
    scanBlend: arrival ? 0 : 1, lastCinematic: { arrival },
    decryption: new DecryptionController(), documentArrival: new ArchiveDocumentArrival(),
  });
  if (clear) harness.decryption.finish();
  harness.setMode('detail');
  return harness;
}
assert.equal(modeHarness(undefined, true).documentArrival.frame.visibility, 1,
  'Explicit full reference/wallpaper playback inherits its completed unsealing');
assert.equal(modeHarness(undefined, false).documentArrival.frame.visibility, 0,
  'An incomplete film cannot bypass the physical paper gate');
assert.equal(modeHarness(webArrayArrival(end, start, end), true).documentArrival.frame.visibility, 0,
  'Natural web entry never inherits the film-only paper state');
checks.push('Actual Scene.setMode preserves completed reference/wallpaper reading while keeping fresh and incomplete entries behind the paper gate');

console.log(JSON.stringify({ passed: true, scope: 'Deterministic timing and state only', checks }, null, 2));
