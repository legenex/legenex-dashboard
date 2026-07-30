import React, { useCallback, useContext, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { AuthContext } from '@/lib/AuthContext';
import { capturePageElement } from '@/lib/progress/capture';
import CaptureShell from './CaptureShell';

// Offscreen capture.
//
// The previous approach navigated the browser to each page, captured it, then
// navigated back. It worked, but being dragged around your own app to take a
// screenshot is intolerable, and it made capturing a whole section a tour.
//
// This mounts the page component into a hidden, fixed-width container in the
// current document instead. Nothing navigates. Because the container width is
// set here rather than inherited from the window, desktop, tablet and mobile
// captures are all possible from one browser at any size, which the navigating
// version could never do.
//
// It cannot be done on the server: Base44 functions run Deno with no browser, so
// there is no renderer. A headless browser on a runner is the only server-side
// option and that is the infrastructure item in docs/screenshot-automation.md.
//
// Page components are resolved from the real files by glob, so this cannot drift
// from the router the way a hand-maintained component map would.

const PAGE_MODULES = import.meta.glob('/src/pages/**/*.jsx');
// Section layouts draw the sub-menu (Campaigns, Webhooks, Conversion Events and
// so on). Resolved by component name from the manifest's layout chain so this
// cannot drift from the router.
const LAYOUT_MODULES = import.meta.glob('/src/components/**/*Layout.jsx');

const LAYOUT_PATHS = {
  LeadsLayout: '/src/components/leads/LeadsLayout.jsx',
  OperationsLayout: '/src/components/operations/OperationsLayout.jsx',
  DistributionLayout: '/src/components/distribution/DistributionLayout.jsx',
  FinancesLayout: '/src/components/finances/FinancesLayout.jsx',
  AdManagerLayout: '/src/components/admanager/AdManagerLayout.jsx',
  ToolsLayout: '/src/components/tools/ToolsLayout.jsx',
};

// Layout routes that must never be mounted for a capture. ProtectedRoute and
// PermissionRoute gate on auth and would redirect; AppLayout runs the Meta auto
// sync on mount and would write ad spend rows once per captured page.
const SKIP_LAYOUTS = new Set(['ProtectedRoute', 'PermissionRoute', 'AppLayout']);

async function loadSectionLayout(layouts) {
  const name = (layouts || []).find((l) => !SKIP_LAYOUTS.has(l) && LAYOUT_PATHS[l]);
  if (!name) return null;
  const loader = LAYOUT_MODULES[LAYOUT_PATHS[name]];
  if (!loader) return null;
  const mod = await loader();
  return mod?.default || null;
}

export const CAPTURE_WIDTHS = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
};

export const ALL_VIEWPORTS = ['desktop', 'tablet', 'mobile'];

// Parse the inline props the router passes, e.g. view="sold".
function parseProps(raw) {
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

async function loadComponent(componentPath) {
  if (!componentPath) throw new Error('No component path recorded for this surface');
  const key = componentPath.startsWith('/') ? componentPath : `/${componentPath}`;
  const loader = PAGE_MODULES[key];
  if (!loader) throw new Error(`Component ${componentPath} is not a page module, so it cannot be rendered offscreen`);
  const mod = await loader();
  if (!mod?.default) throw new Error(`${componentPath} has no default export`);
  return mod.default;
}

// A boundary so one page that cannot render outside its usual shell is reported
// as a failed capture rather than taking the whole run down.
class CaptureBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { this.props.onError?.(error); }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function makeHost(width) {
  const host = document.createElement('div');
  host.setAttribute('data-progress-capture-ui', 'true');
  host.setAttribute('data-offscreen-capture', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    // An ancestor with a transform becomes the containing block for
    // position:fixed descendants. The operator Sidebar is fixed, so without this
    // it would anchor to the real viewport instead of the capture container and
    // land outside the frame.
    transform: 'translateZ(0)',
    // Kept at the document origin rather than pushed to left: -100000px.
    // html2canvas crops relative to the document, so an element parked far
    // outside it produced an empty canvas. Invisible via opacity and a negative
    // z-index instead, which still gives it real layout, and the clone is made
    // opaque again in the onclone hook.
    top: '0',
    left: '0',
    width: `${width}px`,
    minHeight: '900px',
    background: getComputedStyle(document.body).backgroundColor || '#0A0E15',
    opacity: '0',
    zIndex: '-2147483647',
    pointerEvents: 'none',
    overflow: 'visible',
  });
  document.body.appendChild(host);
  return host;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Settle heuristic: react-query exposes how many fetches are in flight, so wait
// for zero with a floor and a ceiling. A page that never settles is captured
// anyway, because a screenshot of a stuck page is itself worth seeing.
async function waitForSettle({ minMs = 1200, maxMs = 15000 } = {}) {
  const started = Date.now();
  await wait(minMs);
  while (Date.now() - started < maxMs) {
    if (queryClientInstance.isFetching() === 0) {
      await wait(350);
      if (queryClientInstance.isFetching() === 0) return true;
    }
    await wait(250);
  }
  return false;
}

/**
 * Render one page offscreen and capture it. Resolves to the PageSnapshot record.
 * Always resolves: a failure produces a snapshot with capture_status failed.
 */
export async function captureOffscreen(page, {
  viewport = 'desktop',
  mask = true,
  role,
  capturedBy,
  authValue,
} = {}) {
  const width = CAPTURE_WIDTHS[viewport] || CAPTURE_WIDTHS.desktop;
  let host = null;
  let root = null;
  let renderError = null;

  // Sidebar writes --sidebar-width on the document element. Capturing must not
  // leave the real page's layout shifted, so the value is restored afterwards.
  const priorSidebarWidth = document.documentElement.style.getPropertyValue('--sidebar-width');

  try {
    const Component = await loadComponent(page.component_path);
    const props = parseProps(page.component_props);
    let layouts = page.layouts;
    if (typeof layouts === 'string') {
      try { layouts = JSON.parse(layouts); } catch { layouts = []; }
    }
    const SectionLayout = await loadSectionLayout(layouts);

    host = makeHost(width);
    root = createRoot(host);

    // Rendered inside the real chrome: sidebar, section sub-menu, then the page.
    // A screenshot of the page body alone is not what anyone reviews, since half
    // the things worth commenting on live in the navigation.
    const page_ = (
      <CaptureBoundary onError={(e) => { renderError = e; }}>
        <Component {...props} />
      </CaptureBoundary>
    );

    await new Promise((resolve) => {
      root.render(
        // The already-resolved auth value is handed in rather than mounting a
        // second AuthProvider, which would re-run the network auth check for
        // every page and viewport and leave the sidebar rendering its
        // unauthenticated state while the capture was taken.
        <AuthContext.Provider value={authValue}>
          <QueryClientProvider client={queryClientInstance}>
            <MemoryRouter initialEntries={[page.route || '/']}>
              <Routes>
                <Route element={<CaptureShell />}>
                  {SectionLayout ? (
                    <Route element={<SectionLayout />}>
                      <Route path="*" element={page_} />
                    </Route>
                  ) : (
                    <Route path="*" element={page_} />
                  )}
                </Route>
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthContext.Provider>,
      );
      setTimeout(resolve, 80);
    });

    if (renderError) throw renderError;
    const settled = await waitForSettle();
    if (renderError) throw renderError;

    if (!host.firstChild || host.scrollHeight < 40) {
      throw new Error('The page rendered empty outside its normal layout');
    }

    return await capturePageElement({
      pageKey: page.page_key,
      route: page.route,
      element: host,
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
    if (host && host.parentNode) host.parentNode.removeChild(host);
    if (priorSidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', priorSidebarWidth);
    } else {
      document.documentElement.style.removeProperty('--sidebar-width');
    }
  }
}

/**
 * Run a batch offscreen, one at a time so the query client is not swamped.
 * Reports progress as it goes and can be stopped.
 */
export function useOffscreenCapture({ role, capturedBy, mask = true, onDone } = {}) {
  // Snapshot of the live auth context, reused for every offscreen render.
  const authValue = useContext(AuthContext);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  const run = useCallback(async (pages, { viewports = ['desktop'], label = 'pages' } = {}) => {
    const targets = (pages || []).filter((p) => p.component_path);
    if (targets.length === 0) return;

    cancelRef.current = false;
    setRunning(true);
    const total = targets.length * viewports.length;
    let done = 0;
    let failed = 0;

    for (const page of targets) {
      for (const viewport of viewports) {
        if (cancelRef.current) break;
        setProgress({ done, total, failed, current: page.title, viewport, label });
        // eslint-disable-next-line no-await-in-loop
        const snap = await captureOffscreen(page, { viewport, mask, role, capturedBy, authValue });
        if (snap?.capture_status === 'failed') failed += 1;
        done += 1;
      }
      if (cancelRef.current) break;
    }

    setProgress({ done, total, failed, current: null, label, finished: true, cancelled: cancelRef.current });
    setRunning(false);
    onDone?.({ done, total, failed, cancelled: cancelRef.current });
  }, [mask, role, capturedBy, onDone, authValue]);

  return { run, cancel, running, progress, clear: () => setProgress(null) };
}
