import React, { createContext, useContext } from 'react';

// Capture mode: "this tree is being rendered offscreen purely to photograph it".
//
// The Progress Control Center mounts real application chrome offscreen so the
// screenshot includes the sidebar and section sub-navigation, which is the whole
// point: those are part of what is being reviewed. But mounting real chrome also
// mounts real side effects, once per page per viewport. Across 60 pages and
// three sizes that is nearly 200 mounts in a few minutes.
//
// Left alone, useMetaAutoSync would fire syncMetaSpend on each of those mounts
// and write ad spend rows. Taking a screenshot must never cause the app to DO
// anything.
//
// The rule: in capture mode, render exactly as normal and nothing else. No
// timers, no background syncs, no mutations, no writes.
//
// Two mechanisms, deliberately, because there are two kinds of caller:
//
//   * The module flag, for plain hooks and helpers that have no React context
//     to read. It is global, so a batch also stands the live page's background
//     upkeep down for the duration, which is what we want anyway.
//   * The context, for components that want to know whether THEIR tree is the
//     offscreen one rather than whether a capture is happening somewhere.
//
// These were previously two separate files, one .js and one .jsx, with the same
// import specifier. Vite resolved the .js and the .jsx exports vanished, which
// broke the production build. One file now.

let capturing = false;

export function setCaptureMode(on) {
  capturing = Boolean(on);
}

export function isCaptureMode() {
  return capturing;
}

const CaptureModeContext = createContext(false);

export function CaptureModeProvider({ children }) {
  return (
    <CaptureModeContext.Provider value>
      {children}
    </CaptureModeContext.Provider>
  );
}

// Falls back to the module flag so a component still stands down during a batch
// even if it happens to sit outside the provider.
export function useCaptureMode() {
  const inTree = useContext(CaptureModeContext);
  return inTree || capturing;
}
