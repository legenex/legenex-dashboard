import { useSyncExternalStore } from 'react';

// A single flag saying "we are rendering a page offscreen purely to photograph
// it".
//
// The offscreen capturer mounts the real application shell so the screenshot
// includes the sidebar and sub-navigation, which is the whole point: those are
// part of the page being reviewed. But mounting the real shell also mounts its
// side effects, and a screenshot must never cause the app to DO anything. The
// Meta auto-sync in particular writes ad spend records on an interval.
//
// Exposed both as a plain read (for hooks that only need the value at call time)
// and as a subscribable hook, so a mounted component actually re-renders when
// capture mode changes rather than reading a stale value.

let capturing = false;
const listeners = new Set();

export function setCaptureMode(on) {
  const next = Boolean(on);
  if (next === capturing) return;
  capturing = next;
  listeners.forEach((fn) => {
    try { fn(); } catch { /* a bad listener must not break a capture */ }
  });
}

export function isCaptureMode() {
  return capturing;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCaptureMode() {
  return useSyncExternalStore(subscribe, isCaptureMode, () => false);
}
