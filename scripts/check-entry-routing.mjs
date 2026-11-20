// Logic-only checks of the actual main.ts functions. This does not render or
// replace the application and is not a visual acceptance claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { DecryptionController } from '../src/decryption.ts';
import { openingShowsDetail, ARRAY_OPENING_END } from '../src/wallpaper-opening.ts';
import { webArrayArrival } from '../src/archive-arrival.ts';

const path = new URL('../src/main.ts', import.meta.url);
const source = await readFile(path, 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const arrivalChoice = parsed.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(parsed) === 'webArrival'));
assert(arrivalChoice);
const arrivalCode = ts.transpileModule(`${arrivalChoice.getText(parsed)}\nwebArrival;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const [query, wallpaper, expected] of [
  ['', false, true], ['?time=24&freeze=1', false, false], ['?review=1', false, false],
  ['?arrival=web&time=24&freeze=1&review=1', false, true], ['', true, false],
]) assert.equal(vm.runInNewContext(arrivalCode, { isWallpaper: wallpaper, reviewParams: new URLSearchParams(query) }), expected,
  `Natural web entry and explicit reference review must not share a timeline: ${query}`);
const names = ['setMode', 'openFile', 'openProjection', 'openModal', 'bootFrame', 'cancelProjectionEntry'];
const functions = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
assert.equal(functions.length, names.length);
const helpers = parsed.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['projectionStarted','projectionFromArchive','projectionEntryTrace','markProjectionEntry','ease'].includes(d.name.getText(parsed))));
const keyboard = parsed.statements.find(node => node.getText(parsed).startsWith('document.addEventListener("keydown"'));
assert(keyboard);
const code = ts.transpileModule([...helpers,...functions,keyboard].map(node => node.getText(parsed)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function create(mode = 'archive', withScene = true) {
  const events = [], queue = [], opened = [], elements = new Map(), handlers = {};
  let context;
  class Element {
    constructor(name) {
      this.name = name; this.dataset = {}; this.style = { setProperty() {} }; this.inert = false;
      this.hidden = false; this.isConnected = true; this.children = [];
      this.firstChild = { textContent: '' }; this.id = name.replace('#', '');
      this.clientWidth = 1920; this.clientHeight = 1080; this.scrollTop = 213;
    }
    setAttribute(name, value) { this[name] = value; }
    focus() { context.document.activeElement = this; events.push(['focus', this.name]); }
    getBoundingClientRect() {
      return this.name === '#three-scene'
        ? { left: 100, top: 50, width: 960, height: 540 }
        : { left: 810, top: 430, width: 160, height: 66 };
    }
  }
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element(selector));
    return elements.get(selector);
  };
  const stage = $('#stage');
  stage.children = [$('#archive-ui'), $('#detail-ui'), $('#modal-root')];
  $('#detail-ui').hidden = mode !== 'detail';
  const trigger = $('.archive-project-file');
  const decryption = new DecryptionController();
  const scene = withScene ? {
    detailVisibility: 0, projectionReady: mode === 'detail', projectionFocus:0, anchor: [400, 600],
    setProjectionFocus(value) { this.projectionFocus = value; },
    beginProjection() { events.push(['projection-basis']); },
    endProjection() { events.push(['projection-release']); this.projectionFocus=0; this.projectionPhase=0; },
    setProjectionPresentation(value) { this.projectionPhase = value; return {phase:value,progress:value,perspective:12}; },
    projectProjector() { events.push(['aperture']); const [x,y]=this.anchor;
      const corners=[{x:x-12,y:y-2},{x:x+12,y:y-2},{x:x+12,y:y+2},{x:x-12,y:y+2}];
      return {origin:{x,y},corners,edge:[corners[0],corners[1]],outline:corners}; },
    setMode(value) { events.push(['scene-mode', value]); if (value === 'detail') decryption.enter(); else decryption.leave(); },
    projectCard(x, y) { events.push(['anchor', x, y]); return this.anchor; },
  } : undefined;
  const projectionViewer = {
    isOpen: false,
    open(record, options) { this.isOpen = true; opened.push({ record, options }); },
  };
  context = vm.createContext({
    $ , HTMLElement: Element, HTMLInputElement: class Input {}, mode, scene, projectionViewer,
    document: { activeElement: trigger, querySelector: $, body: $('body'), addEventListener: (name, fn) => handlers[name] = fn },
    started: true, viewer: undefined, playground: undefined, isGamepadEvent: e => e.gamepad === true,
    stepFile: direction => events.push(['step-file',direction]), stepColumn: direction => events.push(['step-column',direction]),
    ready: true, selected: 0, records: [{ id: 'X-001', projection: {} }, { id: 'X-002', projection: {} }],
    projectionRequest: 0, pendingDetailFocus: false, modal: null, modalClosing: false,
    workbench: undefined, rollingTitles: [], hoverCode: { finish() {} },
    motionActive: () => true, recordAccess() { events.push(['record-access']); }, syncWallpaperBackground() {},
    isWallpaper: false, frozenTime: null, lastStep: '', webArrival: true, webArrayArrival, lastPresentedBootTime: null,
    wallpaperHost: () => ({properties:{}}), openingShowsDetail, ARRAY_OPENING_END, ARRAY_REVEAL_START: 21.92, ARRAY_REVEAL_DURATION: .38,
    audio: { setScene() {}, play() {}, updateBoot() {} }, audioPreview: false,
    audioPreviewRequest: 0, configureAudio() {}, fit() {},
    bootSequence: { reset() {}, update() { return {step:'array'}; } }, renderDetail() {},
    tabTransition: { cancel() {} }, previousFocus: null, modalSiblings: [],
    searchQuery: '', filter: '', renderModal() {},
    performance: { now: () => 1000 }, requestAnimationFrame: cb => queue.push(cb),
    closeModal: cb => cb?.(),
    detailTransition: {
      show() { $('#detail-ui').hidden = false; events.push(['show-detail']); },
      hide(immediate) {
        events.push(['hide-detail', immediate, stage.dataset.projectionPending]);
        $('#detail-ui').hidden = true;
      },
    },
  });
  vm.runInContext(code, context);
  return { context, $, scene, decryption, trigger, opened, events, key(key, gamepad=false) { const event={key,gamepad,target:context.document.activeElement,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};handlers.keydown(event);return event; }, flush() { const queued = queue.splice(0); queued.forEach(cb => cb()); } };
}
const checks = [];

{
  const h = create(); h.context.openProjection(h.trigger);
  assert.equal(h.context.mode, 'detail');
  assert.equal(h.$('#stage').dataset.projectionPending, 'true');
  assert.equal(h.$('#stage').dataset.projectionRoute, 'array');
  assert.equal(h.$('#detail-content').inert, true);
  assert.equal(h.context.pendingDetailFocus, false);
  const request = h.context.projectionRequest;
  h.context.openProjection(h.trigger);
  assert.equal(h.context.projectionRequest, request, 'Repeated activation preserves the original route');
  h.scene.anchor = [620, 720]; h.scene.detailVisibility = .7; h.scene.projectionReady = true; h.flush();
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0].options.origin.x, 410);
  assert.equal(h.opened[0].options.origin.y, 410);
  assert.ok(h.events.some(e => e[0] === 'aperture'), 'Entry samples the actual rectangular projector');
  assert.ok(h.events.some(e => e[0] === 'projection-basis'), 'The displayed entry basis is frozen before opening');
  const originNow=h.opened[0].options.sampleCarrier().origin;
  h.scene.anchor=[700,800];
  const originMoved=h.opened[0].options.sampleCarrier().origin;
  assert.equal(originMoved.x-originNow.x,40);assert.equal(originMoved.y-originNow.y,40);
  h.opened[0].options.onCameraProgress(.6);assert.equal(h.scene.projectionFocus,.6);
  h.opened[0].options.onPresentation(.3);assert.equal(h.scene.projectionPhase,.3);
  assert.equal(h.opened[0].options.sampleCarrier().corners.length,4);
  h.context.projectionViewer.isOpen = false; h.opened[0].options.onClose();
  assert.equal(h.scene.projectionFocus,0);
  assert.ok(h.events.some(e => e[0] === 'projection-release'), 'Close releases even an unadvanced entry basis');
  assert.equal(h.context.mode, 'archive');
  assert.equal(h.$('#stage').dataset.projectionPending, undefined);
  assert.equal(h.$('#stage').dataset.projectionRoute, undefined);
  assert.equal(h.$('#detail-ui').hidden, true);
  assert.ok(h.events.some(e => e[0] === 'hide-detail' && e[1] === true && e[2] === 'true'));
  assert.equal(h.context.document.activeElement, h.trigger);
  checks.push('Actual moving aperture is sampled continuously in viewport coordinates, camera progress reaches ArchiveScene, and array return cannot flash the reading article');
}
{
  const h = create(); h.context.openProjection(h.trigger); h.context.setMode('archive'); h.flush();
  assert.equal(h.opened.length, 0); assert.equal(h.$('#detail-ui').hidden, true);
  checks.push('Esc/back invalidates the pending RAF and hides the never-exposed article synchronously');
}
{
  const h = create(); h.context.openProjection(h.trigger);
  const settings = h.$('.settings-button'); settings.focus();
  h.context.openModal('settings'); h.scene.detailVisibility = 1; h.scene.projectionReady = true; h.flush();
  assert.equal(h.context.mode, 'archive'); assert.equal(h.context.modal, 'settings');
  assert.equal(h.opened.length, 0); assert.equal(h.context.previousFocus, settings);
  h.context.openProjection(h.trigger); assert.equal(h.opened.length, 0);
  checks.push('A modal interrupts extraction, preserves its opener, and cannot be overtaken by a pending projection');
}
{
  const h = create('detail'); const scroll = h.$('#tab-panel').scrollTop;
  h.context.openProjection(h.$('.record-projection-entry'));
  assert.equal(h.$('#stage').dataset.projectionRoute, 'reading');
  assert.equal(h.opened.length, 1);
  h.context.projectionViewer.isOpen = false; h.opened[0].options.onClose();
  assert.equal(h.context.mode, 'detail'); assert.equal(h.$('#tab-panel').scrollTop, scroll);
  assert.equal(h.$('#stage').dataset.projectionRoute, 'reading', 'The original reading surface retains its return fade');
  assert.equal(h.$('#stage').dataset.projectionPending,undefined);assert.equal(h.$('#detail-content').inert,false);assert.equal(h.context.document.activeElement,h.$('.record-projection-entry'));
  assert.equal(h.events.some(e => e[0] === 'show-detail'), false);
  checks.push('Reading-origin projection returns to the same reading surface without rerender or scroll reset');
}
{
  const h = create(); h.context.openProjection(h.trigger); h.context.openFile();
  h.scene.detailVisibility = 1; h.scene.projectionReady = true; h.flush();
  assert.equal(h.opened.length, 0); assert.equal(h.context.mode, 'detail');
  assert.equal(h.$('#stage').dataset.projectionPending, undefined);
  checks.push('An explicit reading request takes over a pending extraction without a stale projection opening');
}
{
  const h = create('archive', false); h.context.openProjection(h.trigger);
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0].options.origin.x, 890);
  assert.equal(h.opened[0].options.origin.y, 463); assert.equal(h.$('#detail-content').inert, true);
  checks.push('Without a 3D carrier the fallback comes from the actual triggering control and keeps the article inert');
}
{
  const h=create('detail'); h.scene.projectionReady=false;
  const scroll=h.$('#tab-panel').scrollTop;
  h.context.openProjection(h.$('.record-projection-entry'));
  const settings=h.$('.settings-button');settings.focus();h.context.openModal('settings');
  h.scene.projectionReady=true;h.flush();
  assert.equal(h.opened.length,0);assert.equal(h.context.mode,'detail');
  assert.equal(h.$('#stage').dataset.projectionPending,undefined);assert.equal(h.$('#tab-panel').scrollTop,scroll);
  checks.push('A modal during a still-extracting reading-origin request retains the reading route and cancels stale projection work');
}

{
  const h=create('boot');
  const beforeEnd=h.context.bootFrame(ARRAY_OPENING_END-.01);
  assert.equal(beforeEnd.arrival.kind,'web');
  assert.ok(beforeEnd.arrival.field>.999);
  assert.equal(h.context.mode,'boot');
  h.context.bootFrame(ARRAY_OPENING_END);
  assert.equal(h.context.mode,'archive','Natural web entry stops at the archive array');
  h.context.bootFrame(35);
  assert.equal(h.context.mode,'archive','A late frame cannot auto-open the first archive');
  assert.equal(h.events.filter(e=>e[0]==='record-access').length,0);
  h.decryption.update(1,true,false);
  assert.equal(h.decryption.frame.phase,'waiting');
  assert.equal(h.decryption.clarity,0,'The default archive remains sealed');
  h.context.openFile();
  assert.equal(h.context.mode,'detail');
  h.decryption.update(.1,false,false);
  assert.equal(h.decryption.frame.phase,'waiting','Unsealing waits for physical clearance');
  h.decryption.update(.1,true,false);
  h.decryption.update(.5,true,false);
  assert.equal(h.decryption.frame.phase,'joining');
  assert.equal(h.events.filter(e=>e[0]==='record-access').length,1);
  checks.push('Natural first entry remains on the array with the first archive sealed; an explicit read starts unsealing only after physical clearance');
}
{
  const h=create('boot'); h.context.isWallpaper=true; h.context.webArrival=false;
  h.context.wallpaperHost=()=>({properties:{openingdetail:{value:'show'}}});
  h.context.bootFrame(ARRAY_OPENING_END);assert.equal(h.context.mode,'boot');
  h.context.bootFrame(35);assert.equal(h.context.mode,'detail');
  const review=create('boot');review.context.frozenTime=30;review.context.webArrival=false;
  assert.equal(review.context.bootFrame(30).arrival,undefined);assert.equal(review.context.mode,'boot');
  checks.push('Explicit wallpaper detail playback and frozen reference review retain their opt-in timeline');
}
{
  const h=create();h.$('#detail-content').style.opacity='1';h.$('#detail-content').inert=false;
  h.context.openFile();
  assert.equal(h.$('#detail-content').style.opacity,'0');
  assert.equal(h.$('#detail-content').inert,true);
  checks.push('Entering a different reading session clears the previous opaque paper before revealing its UI container');
}
{
  const h=create(); h.context.motionActive=()=>false;
  h.scene.projectionReady=false; h.context.openProjection(h.trigger);
  assert.equal(h.opened.length,1);
  assert.equal(h.opened[0].options.reducedMotion,true);
  checks.push('Reduced motion still requires intentional activation and does not wait for suppressed extraction motion');
}

{
  const reading=create('detail'); reading.context.document.activeElement=reading.$('#detail-content');
  for(const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) assert.equal(reading.key(key).defaultPrevented,false,'Reading keys stay with the reading surface');
  assert.equal(reading.events.some(e=>e[0].startsWith('step-')),false);
  assert.equal(reading.context.mode,'detail');
  const array=create();assert.equal(array.key('ArrowDown').defaultPrevented,true);
  assert.deepEqual(array.events.find(e=>e[0]==='step-file'),['step-file',1]);
  assert.equal(reading.key('ArrowDown',true).defaultPrevented,true,'Existing controller navigation is explicit');
  checks.push('Ordinary reading arrows retain native scrolling while array and gamepad navigation remain available');
}
{
  const reading=create('detail');reading.scene.projectionReady=false;
  const scroll=reading.$('#tab-panel').scrollTop;
  reading.context.openProjection(reading.$('.record-projection-entry'));
  reading.key('Escape');reading.scene.projectionReady=true;reading.flush();
  assert.equal(reading.context.mode,'detail');assert.equal(reading.opened.length,0);
  assert.equal(reading.$('#stage').dataset.projectionPending,undefined);
  assert.equal(reading.$('#detail-content').inert,false);
  assert.equal(reading.$('#tab-panel').scrollTop,scroll);
  assert.equal(reading.context.document.activeElement,reading.$('.record-projection-entry'));
  const array=create();array.context.openProjection(array.trigger);array.key('Escape');array.flush();
  assert.equal(array.context.mode,'archive');assert.equal(array.opened.length,0);
  checks.push('Esc during extraction preserves the originating reading or array route and cancels the queued projection');
}
const entryCss = await readFile(new URL('../src/archive-entry.css', import.meta.url), 'utf8');
const pendingPaper = entryCss.match(/\[data-projection-pending="true"\]\s+#detail-content\s*\{([^}]+)\}/)?.[1];
assert(pendingPaper, 'Pending projections have an explicit paper rule');
assert.match(pendingPaper, /visibility:\s*hidden/);
assert.match(pendingPaper, /pointer-events:\s*none/);
const report = { passed: true, scope: 'Actual main.ts state-transition functions with inert DOM/scene fixtures; no visual rendering claim', checks };
console.log(JSON.stringify(report, null, 2));
