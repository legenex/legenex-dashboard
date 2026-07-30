import React, { useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider } from '@/lib/AuthContext';
import { capturePageElement } from '@/lib/progress/capture';
import { setCaptureMode, CaptureModeProvider } from '@/lib/progress/captureMode';
import {
  CAPTURE_WIDTHS, ALL_VIEWPORTS, widthFor, parseProps, visualLayouts,
} from '@/lib/progress/captureTargets';

// Re-exported so callers have one obvious place to import capture constants from.
export { CAPTURE_WIDTHS, ALL_VIEWPORTS };

// Offscreen capture.
//
// Mounts the REAL application shell (sidebar, section sub-navigation, page) into
// a hidden fixed-width container in the current document, photographs it, then
// unmounts. Nothing navigates, so you are never dragged around your own app to
// take a screenshot.
//
// Two things it gets right that the earlier versions did not:
//
//   1. It rebuilds the actual layout chain from the manifest, so the screenshot
//      shows the sidebar and sub-menu. Those are part of the page under review;
//      capturing the page component alone left out most of what there is to
//      comment on.
//   2. It un-clips the app's scroll containers, so a tall page is captured in
//      full instead of being cut off at one screen. AppLayout is h-screen with an
//      inner overflow-y-auto, which crops everything below the fold.
//
// It cannot be done on the server: Base44 functions run Deno with no browser, so
// there is nothing to render into. A headless browser on a runner is the only
// server side option, and that is the item in docs/screenshot-automation.md.

const PAGE_MODULES = import.meta.glob('/src/pages/**/*.jsx');
const LAYOUT_MODULES = import.meta.glob('/src/components/**/*Layout.jsx');

// The app shell is built to fill the viewport and scroll inside itself. For a
// capture we want the opposite: let it grow to its content so nothing is cropped.
const UNCLIP_CSS = `
[data-offscreen-capture] { height: auto !important; overflow: visible !important; }
[data-offscreen-capture] .h-screen { height: auto !important; min-height: 0 !important; }
[data-offscreen-capture] .overflow-hidden { overflow: visible !important; }
[data-offscreen-capture] .overflow-y-auto,
[data-offscreen-capture] .overflow-auto,
[data-offscreen-capture] .app-scroll {
  overflow: visible !important;
  height: auto !important;
  max-height: none !important;
}
[data-offscreen-capture] .sticky, [data-offscreen-capture] .fixed { position: relative !important; }
`;

export function widthFor(viewport) {
  return CAPTURE_WIDTHS[viewport] || CAPTURE_WIDTHS.desktop;
}

// Layout routes that must NOT be mounted for a capture.
//
// ProtectedRoute and PermissionRoute gate on auth and would redirect the
// memory router instead of rendering the page. Everything else in the chain is
// chrome we want in the frame, including AppLayout: its side effects are held
// off by capture mode, so mounting it is what puts the real sidebar and header
// in the screenshot.
const NON_VISUAL_LAYOUTS = new Set(['ProtectedRoute', 'PermissionRoute']);

export function visualLayouts(layouts) {
  let list = layouts;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  return (list || []).filter((name) => name && !NON_VISUAL_LAYOUTS.has(name));
}

// Parse the inline props the router passes, for example view="sold".
export function parseProps(raw) {
  const out = {};
  if (!raw) return out;
  const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let m;
  while ((m = re.exec(raw))) {
    const value = m[2] ?? m[3] ?? m[4];
    if (value === undefined) continue;
    out[m[1]] = value.trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function findModule(modules, name) {

  return Object.keys(modules).find((k) => k.endsWith(`/${name}.jsx`));
}

async function loadComponent(componentPath) {
  if (!componentPath) throw new Error('No component path recorded for this surface');
  const key = componentPath.startsWith('/') ? componentPath : `/${componentPath}`;
  const loader = PAGE_MODULES[key];
  if (!loader) throw new Error(`${componentPath} is not a page module, so it cannot be rendered offscreen`);
  const mod = await loader();
  if (!mod?.default) throw new Error(`${componentPath} has no default export`);
  return mod.default;
}

// Rebuild the layout chain the router really wraps this route in, so the
// screenshot includes the sidebar and section sub-navigation.
async function loadLayouts(layouts) {
  const loaded = [];
  for (const name of visualLayouts(layouts)) {
    const key = findModule(LAYOUT_MODULES, name);
    if (!key) continue;
    // eslint-disable-next-line no-await-in-loop
    const mod = await LAYOUT_MODULES[key]();
    if (mod?.default) loaded.push({ name, Component: mod.default });
  }
  return loaded;
}

class CaptureBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

// The capture surface is an IFRAME, not a div.
//
// This matters and it is not a detail. Tailwind's responsive classes are viewport
// media queries, so a 390px wide div inside a 1900px window still renders the
// desktop layout squeezed into 390px. Every "mobile" capture taken that way is a
// lie about what a phone shows.
//
// A same-origin iframe created in JavaScript has its OWN viewport, so media
// queries evaluate against the capture width and the real mobile layout appears.
// x-frame-options blocks LOADING a url in a frame; it does not apply here,
// because nothing is loaded: the document is built in place and React renders
// into it.
function makeFrame(width) {
  const frame = document.createElement('iframe');
  frame.setAttribute('data-progress-capture-ui', 'true');
  frame.setAttribute('data-offscreen-capture', 'true');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  Object.assign(frame.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${width}px`,
    height: '1200px',
    border: '0',
    opacity: '0',
    zIndex: '-2147483647',
    pointerEvents: 'none',
  });
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();

  // Carry the stylesheets across, or the capture is unstyled markup.
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    if (node.id === 'progress-capture-unclip') return;
    doc.head.appendChild(node.cloneNode(true));
  });
  // The theme lives as a class on <html>, and the app's base styles hang off body.
  doc.documentElement.className = document.documentElement.className;
  doc.body.className = document.body.className;
  doc.body.style.background = getComputedStyle(document.body).backgroundColor || '#0A0E15';
  doc.body.style.margin = '0';

  const unclip = doc.createElement('style');
  unclip.textContent = UNCLIP_CSS;
  doc.head.appendChild(unclip);

  return frame;
}

function injectUnclipStyle() {
  const existing = document.getElementById('progress-capture-unclip');
  if (existing) return existing;
  const style = document.createElement('style');
  style.id = 'progress-capture-unclip';
  style.textContent = UNCLIP_CSS;
  document.head.appendChild(style);
  return style;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for the page's queries to settle, with a floor and a ceiling. A page that
// never settles is captured anyway: a screenshot of a stuck page is itself worth
// seeing, and it is recorded in the snapshot notes.
async function waitForSettle({ minMs = 1400, maxMs = 15000 } = {}) {
  const started = Date.now();
  await wait(minMs);
  while (Date.now() - started < maxMs) {
    if (queryClientInstance.isFetching() === 0) {
      await wait(400);
      if (queryClientInstance.isFetching() === 0) return true;
    }
    await wait(250);
  }
  return false;
}

/**
 * Render one page offscreen, inside its real layout chain, and capture it.
 * Always resolves: a failure produces a snapshot with capture_status failed and
 * the reason attached, so a gap is visible rather than looking unreviewed.
 */
export async function captureOffscreen(page, {
  viewport = 'desktop',
  mask = true,
  role,
  capturedBy,
} = {}) {
  const width = widthFor(viewport);
  let frame = null;
  let root = null;
  let renderError = null;

  try {
    const [Component, layouts] = await Promise.all([
      loadComponent(page.component_path),
      loadLayouts(page.layouts),
    ]);
    const props = parseProps(page.component_props);

    injectUnclipStyle();
    setCaptureMode(true);
    frame = makeFrame(width);
    // React renders into the FRAME's document, so the app lays itself out
    // against the frame's viewport and the responsive classes resolve to the
    // real layout for that width.
    root = createRoot(frame.contentDocument.body);

    // Nest the real layouts around the page so the capture includes the sidebar
    // and section sub-navigation, matching what an operator actually sees.
    const leaf = <Route path="*" element={<Component {...props} />} />;
    const tree = layouts.reduceRight(
      (child, { name, Component: Layout }) => (
        <Route key={name} element={<Layout />}>{child}</Route>
      ),
      leaf,
    );

    await new Promise((resolve) => {
      root.render(
        <CaptureModeProvider>
          <AuthProvider>
          <QueryClientProvider client={queryClientInstance}>
            <MemoryRouter initialEntries={[page.route || '/']}>
              <CaptureBoundary onError={(e) => { renderError = e; }}>
                <Routes>{tree}</Routes>
              </CaptureBoundary>
            </MemoryRouter>
          </QueryClientProvider>
          </AuthProvider>
        </CaptureModeProvider>,
      );
      setTimeout(resolve, 80);
    });

    if (renderError) throw renderError;
    const settled = await waitForSettle();
    if (renderError) throw renderError;

    const body = frame.contentDocument.body;
    if (!body.firstChild || body.scrollHeight < 40) {
      throw new Error('The page rendered empty outside its normal layout');
    }
    // Grow the frame to the full content height, so html2canvas measures the
    // whole page rather than the initial 1200px window.
    frame.style.height = `${body.scrollHeight}px`;
    await wait(120);

    return await capturePageElement({
      pageKey: page.page_key,
      route: page.route,
      element: body,
      viewport,
      width,
      mask,
      role,
      capturedBy,
      notes: settled ? null : 'Captured before all queries settled',
    });
  } catch (err) {
    return capturePageElement({
      pageKey: page.page_key,
      route: page.route,
      element: null,
      viewport,
      width,
      mask,
      role,
      capturedBy,
      forcedError: String(err?.message || err),
    });
  } finally {
    if (root) { try { root.unmount(); } catch { /* already gone */ } }
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    setCaptureMode(false);
  }
}

/**
 * Run a batch offscreen, one at a time so the query client is not swamped.
 * Every viewport by default: needing to ask for tablet and mobile separately was
 * busywork.
 */
export function useOffscreenCapture({ role, capturedBy, mask = true, onDone } = {}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const run = useCallback(async (pages, { viewports = ALL_VIEWPORTS, label = 'pages' } = {}) => {
    const targets = (pages || []).filter((p) => p.component_path);
    if (targets.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    const total = targets.length * viewports.length;
    let done = 0;
    let failed = 0;
    const failures = [];

    for (const page of targets) {
      for (const viewport of viewports) {
        if (cancelRef.current) break;
        setProgress({ done, total, failed, current: page.title, viewport, label, failures });
        // eslint-disable-next-line no-await-in-loop
        const snap = await captureOffscreen(page, { viewport, mask, role, capturedBy });
        if (snap?.capture_status === 'failed') {
          failed += 1;
          failures.push({ page: page.title, viewport, reason: snap.failure_reason });
        }
        done += 1;
      }
      if (cancelRef.current) break;
    }

    setProgress({
      done, total, failed, failures, current: null, label,
      finished: true, cancelled: cancelRef.current,
    });
    setRunning(false);
    onDone?.({ done, total, failed, failures, cancelled: cancelRef.current });
  }, [mask, role, capturedBy, onDone]);

  return { run, cancel, running, progress, clear: () => setProgress(null) };
}
