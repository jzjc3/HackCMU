/** Decorative mouse cursor only: never captures, cancels, or synthesizes map input. */
export function attachMapExplorer({surface, layer, sprite, hotspot, reducedMotion = false}: {
  surface: SVGSVGElement;
  layer: HTMLDivElement;
  sprite: HTMLImageElement;
  hotspot: HTMLSpanElement;
  reducedMotion?: boolean;
}): () => void {
  const doc = surface.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let ready = sprite.complete && sprite.naturalWidth > 0;
  let active = false;
  let disposed = false;
  let frame = 0;
  let lastTime = 0;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  let surfaceWidth = 0, surfaceHeight = 0;
  const spriteWidth = sprite.offsetWidth;
  const spriteHeight = sprite.offsetHeight;
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, name: string, listener: EventListener) => {
    // Capture observes drag movement even when d3 stops bubbling. All input stays native.
    target.addEventListener(name, listener, {capture: true, passive: true});
    cleanups.push(() => target.removeEventListener(name, listener, true));
  };
  const hide = () => {
    active = false;
    layer.style.visibility = 'hidden';
    surface.removeAttribute('data-explorer-active');
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  const paintSprite = () => {
    // Keep the figure inside the map at its edges, without moving the click point.
    const left = x >= spriteWidth + 7 ? x - spriteWidth - 7 : x + 7;
    const top = y >= spriteHeight + 4 ? y - spriteHeight - 4 : y + 7;
    sprite.style.left = `${Math.max(0, Math.min(left, surfaceWidth - spriteWidth)) - x}px`;
    sprite.style.top = `${Math.max(0, Math.min(top, surfaceHeight - spriteHeight)) - y}px`;
    sprite.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const tick = (time: number) => {
    frame = 0;
    if (!active || disposed) return;
    // Exponential smoothing, ~24 ms time constant. Distance is never speed-limited.
    const amount = 1 - Math.exp(-Math.max(0, time - lastTime) / 24);
    lastTime = time;
    x += (targetX - x) * amount;
    y += (targetY - y) * amount;
    const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < 0.1;
    if (settled) { x = targetX; y = targetY; }
    paintSprite();
    if (!settled) frame = win.requestAnimationFrame(tick);
  };
  const update = (event: Event) => {
    const pointer = event as PointerEvent;
    if (disposed || !ready || pointer.pointerType !== 'mouse' || pointer.isPrimary === false || doc.hidden) {
      hide();
      return;
    }
    const bounds = surface.getBoundingClientRect();
    const hit = doc.elementFromPoint(pointer.clientX, pointer.clientY);
    // Hit testing, rather than event.target, also excludes controls during pointer capture.
    if (!hit || !surface.contains(hit) || hit.closest('foreignObject, [data-map-cursor="native"]') ||
      pointer.clientX < bounds.left || pointer.clientX >= bounds.right ||
      pointer.clientY < bounds.top || pointer.clientY >= bounds.bottom) {
      hide();
      return;
    }
    targetX = pointer.clientX - bounds.left;
    targetY = pointer.clientY - bounds.top;
    surfaceWidth = bounds.width;
    surfaceHeight = bounds.height;
    // The small ring is the exact native click point; only the figure is smoothed.
    hotspot.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    if (!active || reducedMotion || motion.matches || event.type === 'pointerdown') {
      x = targetX;
      y = targetY;
      paintSprite();
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      lastTime = win.performance.now();
      frame = win.requestAnimationFrame(tick);
    }
    active = true;
    layer.style.visibility = 'visible';
    surface.setAttribute('data-explorer-active', '');
  };
  const loaded = () => { ready = sprite.naturalWidth > 0; if (!ready) hide(); };
  const failed = () => { ready = false; hide(); };
  const changedMotion = () => {
    if (active && (reducedMotion || motion.matches)) {
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      x = targetX; y = targetY;
      paintSprite();
    }
  };
  listen(sprite, 'load', loaded);
  listen(sprite, 'error', failed);
  listen(doc, 'pointermove', update);
  listen(doc, 'pointerdown', update);
  // pointerleave does not bubble, but capture still sees region/path leave events.
  listen(surface, 'pointerleave', event => { if (event.target === surface) hide(); });
  listen(doc, 'pointercancel', hide);
  listen(doc, 'pointerout', event => { if (!(event as PointerEvent).relatedTarget) hide(); });
  listen(doc, 'keydown', hide);
  listen(doc, 'visibilitychange', hide);
  listen(doc, 'scroll', hide);
  listen(win, 'blur', hide);
  listen(win, 'pagehide', hide);
  listen(win, 'resize', hide);
  listen(motion, 'change', changedMotion);
  // Panels can resize the map without resizing the window. Wait for fresh pointer
  // coordinates after a layout change rather than leaving the explorer behind.
  const resizeObserver = new ResizeObserver(hide);
  resizeObserver.observe(surface);
  cleanups.push(() => resizeObserver.disconnect());
  hide();
  return () => {
    disposed = true;
    hide();
    cleanups.forEach(cleanup => cleanup());
  };
}
