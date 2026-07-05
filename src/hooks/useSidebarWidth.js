import { useState, useEffect, useCallback, useRef } from 'react';

// Main sidebar is 248px by default. The user can drag the right edge to make it
// slightly smaller (down to MIN) but not meaningfully bigger (capped at MAX = default).
export const SIDEBAR_DEFAULT = 248;
export const SIDEBAR_MIN = 208;
export const SIDEBAR_MAX = 248;
const STORAGE_KEY = 'legenex_sidebar_width';

function loadWidth() {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (!Number.isNaN(v)) return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, v));
  } catch {}
  return SIDEBAR_DEFAULT;
}

// Keeps a CSS variable in sync so any consumer (layout margin, sidebar width) reads the same value.
function applyVar(w) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
  }
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    applyVar(width);
  }, [width]);

  useEffect(() => {
    // Keep width in sync across tabs / other consumers.
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setWidth(loadWidth());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const startResize = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(STORAGE_KEY, String(loadCurrent())); } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // Read the latest committed width off the DOM var at mouse-up.
    const loadCurrent = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width');
      const v = parseInt(raw, 10);
      return Number.isNaN(v) ? SIDEBAR_DEFAULT : v;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { width, startResize };
}