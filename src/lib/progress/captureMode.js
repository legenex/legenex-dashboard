// A single flag saying "we are rendering a page offscreen purely to photograph
// it".
//
// The offscreen capturer mounts the real application shell so the screenshot
// includes the sidebar and sub-navigation, which is the whole point: those are
// part of the page being reviewed. But mounting the real shell also mounts its
// side effects, and a screenshot must never cause the app to DO anything. The
// Meta auto-sync in particular writes ad spend records on an interval.
//
// Anything with a side effect checks this flag and stands down.

let capturing = false;

export function setCaptureMode(on) {
  capturing = Boolean(on);
}

export function isCaptureMode() {
  return capturing;
}
