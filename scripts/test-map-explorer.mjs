import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loader, compile, moduleUrl} from './test-loader.mjs';

const {attachMapExplorer} = await loader()('components/mind-travel/map-explorer-controller.ts');
const resizeObservers = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.disconnected = false; resizeObservers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  notify() { if (!this.disconnected) this.callback(); }
};
class Target extends EventTarget {
  listeners = new Map();
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    const set = this.listeners.get(type) ?? new Set(); set.add(listener); this.listeners.set(type, set);
  }
  removeEventListener(type, listener, options) {
    // Node's EventTarget requires an options object for capture removal.
    super.removeEventListener(type, listener, typeof options === 'boolean' ? {capture: options} : options);
    this.listeners.get(type)?.delete(listener);
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
function fixture({ready = true, reducedMotion = false, osReducedMotion = false} = {}) {
  let now = 100, nextFrame = 1;
  const frames = new Map();
  const win = new Target();
  const motion = Object.assign(new Target(), {matches: osReducedMotion});
  Object.assign(win, {matchMedia: () => motion, performance: {now: () => now},
    requestAnimationFrame: fn => { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id)});
  const doc = Object.assign(new Target(), {defaultView: win, hidden: false});
  const attributes = new Map();
  const surface = Object.assign(new Target(), {ownerDocument: doc,
    getBoundingClientRect: () => ({left: 100, top: 50, right: 1100, bottom: 650, width: 1000, height: 600}),
    contains: element => element === surface || element?.parent === surface,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key)});
  const region = {parent: surface, closest: () => null};
  let hit = region;
  doc.elementFromPoint = () => hit;
  const layer = {style: {}};
  const sprite = Object.assign(new Target(), {complete: ready, naturalWidth: ready ? 81 : 0,
    offsetWidth: 30, offsetHeight: 58, style: {}});
  const hotspot = {style: {}};
  const cleanup = attachMapExplorer({surface, layer, sprite, hotspot, reducedMotion});
  const resizeObserver = resizeObservers.at(-1);
  const event = (target, type, props = {}) => {
    const e = new Event(type, {cancelable: true});
    for (const [key, value] of Object.entries(props)) Object.defineProperty(e, key, {value});
    target.dispatchEvent(e); return e;
  };
  return {win, doc, surface, sprite, hotspot, layer, motion, frames, cleanup, event, resizeObserver,
    hit: value => {hit = value;}, region,
    move: (x = 400, y = 300, props = {}) => event(doc, 'pointermove', {clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true, ...props}),
    down: (props = {}) => event(doc, 'pointerdown', {clientX: 400, clientY: 300, pointerType: 'mouse', ...props}),
    visible: () => attributes.has('data-explorer-active') && layer.style.visibility === 'visible',
    step: (ms = 16) => { now += ms; const current = [...frames.values()]; frames.clear(); current.forEach(fn => fn(now)); },
    targets: [win, doc, surface, sprite, motion]};
}
const translation = el => el.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/).slice(1).map(Number);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }

check('no cursor suppression until successful image load and mouse entry', () => {
  const f = fixture({ready: false});
  f.move(); assert(!f.visible()); assert.equal(f.frames.size, 0);
  f.sprite.naturalWidth = 81; f.event(f.sprite, 'load'); assert(!f.visible());
  f.move(); assert(f.visible()); assert.deepEqual(translation(f.hotspot), [300, 250]); f.cleanup();
});
check('cached image enters immediately, exact hotspot independent of smoothed figure', () => {
  const f = fixture(); f.move(); f.move(500, 350);
  assert.deepEqual(translation(f.hotspot), [400, 300]);
  assert.deepEqual(translation(f.sprite), [300, 250]); assert.equal(f.frames.size, 1);
  f.step(); const [x] = translation(f.sprite); assert(x > 300 && x < 400); f.cleanup();
});
check('large jumps have no speed cap; idle animation settles and stops', () => {
  const f = fixture(); f.move(110, 100); f.move(1050, 100); f.step();
  assert(translation(f.sprite)[0] > 450, 'moves proportionally more than 400 px in one frame');
  for (let i = 0; i < 40; i++) f.step();
  assert.deepEqual(translation(f.sprite), [950, 50]); assert.equal(f.frames.size, 0); f.cleanup();
});
check('mouse down snaps figure to exact point and does not cancel native input', () => {
  const f = fixture(); f.move(200, 100); f.move(600, 400);
  const event = f.down(); assert(!event.defaultPrevented);
  assert.deepEqual(translation(f.sprite), [300, 250]); assert.equal(f.frames.size, 0); f.cleanup();
});
check('hit testing hides on overlaid controls even if event target is captured by map', () => {
  const f = fixture(); f.move(); f.move(450, 310);
  f.hit({closest: () => null});
  f.move(450, 310, {target: f.surface}); assert(!f.visible()); assert.equal(f.frames.size, 0);
  f.hit(f.region); f.move(); assert(f.visible()); f.cleanup();
});
check('map region buttons remain valid targets; explicitly native embedded controls do not', () => {
  const f = fixture(); f.move(); assert(f.visible());
  f.hit({parent: f.surface, closest: () => ({tagName: 'INPUT'})}); f.move(); assert(!f.visible()); f.cleanup();
});
check('leaving a descendant region does not hide the explorer while still over the map', () => {
  const f = fixture(); f.move(); f.event(f.surface, 'pointerleave', {target: f.region});
  assert(f.visible()); f.event(f.surface, 'pointerleave'); assert(!f.visible()); f.cleanup();
});
check('outside bounds or null hit hides and restores native cursor', () => {
  const f = fixture(); f.move(); f.move(1101, 300); assert(!f.visible());
  f.move(); f.hit(null); f.move(); assert(!f.visible()); f.cleanup();
});
check('mouse -> touch -> pen -> mouse preserves native non-mouse input', () => {
  const f = fixture(); f.move();
  assert(!f.down({pointerType: 'touch'}).defaultPrevented); assert(!f.visible());
  f.move(400, 300, {pointerType: 'pen'}); assert(!f.visible());
  f.move(400, 300, {pointerType: 'mouse', isPrimary: false}); assert(!f.visible());
  f.move(400, 300, {pointerType: ''}); assert(!f.visible());
  f.move(); assert(f.visible()); f.cleanup();
});
check('image error while active immediately restores native cursor; load can recover', () => {
  const f = fixture(); f.move(); f.move(450, 310); f.event(f.sprite, 'error');
  assert(!f.visible()); assert.equal(f.frames.size, 0); f.move(); assert(!f.visible());
  f.sprite.naturalWidth = 0; f.event(f.sprite, 'load'); f.move(); assert(!f.visible());
  f.sprite.naturalWidth = 81; f.event(f.sprite, 'load'); f.move(); assert(f.visible()); f.cleanup();
});
for (const [target, type] of [['surface', 'pointerleave'], ['doc', 'pointercancel'], ['win', 'blur'],
  ['win', 'resize'], ['win', 'pagehide'], ['doc', 'scroll'], ['doc', 'keydown'], ['doc', 'visibilitychange']]) {
  check(`${type} hides, cancels animation and returns exact entry position`, () => {
    const f = fixture(); f.move(); f.move(450, 310); f.event(f[target], type);
    assert(!f.visible()); assert.equal(f.frames.size, 0);
    f.move(550, 400); assert.deepEqual(translation(f.sprite), [450, 350]); f.cleanup();
  });
}
check('document exit and hidden document do not leave a ghost cursor', () => {
  const f = fixture(); f.move(); f.event(f.doc, 'pointerout', {relatedTarget: f.region}); assert(f.visible());
  f.event(f.doc, 'pointerout', {relatedTarget: null}); assert(!f.visible());
  f.doc.hidden = true; f.move(); assert(!f.visible()); f.cleanup();
});
for (const option of ['reducedMotion', 'osReducedMotion']) {
  check(`${option} follows immediately with no animation frames`, () => {
    const f = fixture({[option]: true}); f.move(); f.move(600, 400);
    assert.deepEqual(translation(f.sprite), [500, 350]); assert.equal(f.frames.size, 0); f.cleanup();
  });
}
check('system reduced motion changing mid-flight cancels interpolation', () => {
  const f = fixture(); f.move(); f.move(600, 400); f.motion.matches = true; f.event(f.motion, 'change');
  assert.deepEqual(translation(f.sprite), [500, 350]); assert.equal(f.frames.size, 0); f.cleanup();
});
check('panel layout resize hides stale coordinates and next move uses the new map bounds', () => {
  const f = fixture(); f.move(); f.move(600, 400); assert.equal(f.frames.size, 1);
  assert.equal(f.resizeObserver.target, f.surface);
  f.surface.getBoundingClientRect = () => ({left: 0, top: 50, right: 376, bottom: 650, width: 376, height: 600});
  f.resizeObserver.notify(); assert(!f.visible()); assert.equal(f.frames.size, 0);
  f.move(200, 250); assert(f.visible());
  assert.deepEqual(translation(f.hotspot), [200, 200]); assert.deepEqual(translation(f.sprite), [200, 200]);
  f.cleanup(); assert(f.resizeObserver.disconnected);
  f.resizeObserver.notify(); assert(!f.visible());
});
check('figure stays inside all map corners without altering the hotspot', () => {
  const f = fixture({reducedMotion: true});
  for (const [clientX, clientY] of [[101, 51], [1099, 51], [101, 649], [1099, 649]]) {
    f.move(clientX, clientY);
    const [x, y] = translation(f.sprite);
    const left = x + Number.parseFloat(f.sprite.style.left), top = y + Number.parseFloat(f.sprite.style.top);
    assert(left >= 0 && left + 30 <= 1000); assert(top >= 0 && top + 58 <= 600);
    assert.deepEqual(translation(f.hotspot), [clientX - 100, clientY - 50]);
  }
  f.cleanup();
});
check('click, pan and wheel event defaults remain available to d3 and React', () => {
  const f = fixture(); f.move();
  for (const type of ['click', 'mousedown', 'mousemove', 'mouseup', 'wheel']) {
    let observed = 0; const listener = () => observed++;
    f.surface.addEventListener(type, listener);
    assert(!f.event(f.surface, type).defaultPrevented); assert.equal(observed, 1);
    f.surface.removeEventListener(type, listener);
  }
  f.cleanup();
});
check('unmount removes every listener and frame; stale events cannot reactivate', () => {
  const f = fixture(); f.move(); f.move(600, 400);
  assert(f.targets.every(target => target.listenerCount > 0)); f.cleanup();
  assert(f.targets.every(target => target.listenerCount === 0)); assert.equal(f.frames.size, 0); assert(!f.visible());
  assert(f.resizeObserver.disconnected);
  f.event(f.sprite, 'load'); f.move(); f.step(); assert(!f.visible());
  f.cleanup(); assert.equal(f.frames.size, 0);
});
// Render real WorldMap and cursor JSX to check that preview use is opt-in.
const controllerUrl = moduleUrl(compile(await readFile('components/mind-travel/map-explorer-controller.ts', 'utf8')));
const cursorUrl = moduleUrl(compile(await readFile('components/mind-travel/MapExplorerCursor.tsx', 'utf8'))
  .replace("from 'react'", `from ${JSON.stringify(import.meta.resolve('react'))}`)
  .replace("from './map-explorer-controller'", `from ${JSON.stringify(controllerUrl)}`));
const {WorldMap} = await loader({'./MapExplorerCursor': cursorUrl})('components/mind-travel/WorldMap.tsx');
check('real WorldMap defaults to native preview and renders decorative cursor only on opt-in', () => {
  const props = {features: [{type: 'Feature', id: 'Africa', properties: {name: 'Africa'},
    geometry: {type: 'Polygon', coordinates: [[[0, 0], [0, 20], [20, 20], [20, 0], [0, 0]]]}}],
    world: {dims: [], memories: [], overrides: {}}, selected: null, onSelect() {}};
  const preview = renderToStaticMarkup(React.createElement(WorldMap, props));
  assert(!preview.includes('map-explorer-cursor'));
  const main = renderToStaticMarkup(React.createElement(WorldMap, {...props, explorerCursor: true}));
  assert(main.includes('data-testid="map-explorer-cursor" aria-hidden="true"'));
  assert(main.includes('src="/images/map-explorer.webp"'));
  assert(main.includes('draggable="false"'));
  assert(!main.includes('data-explorer-active'), 'SSR never hides native cursor before ready mouse entry');
});
console.log(`Map explorer: ${checks} behavior checks passed.`);
