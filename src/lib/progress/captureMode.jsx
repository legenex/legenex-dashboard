import React, { createContext, useContext } from 'react';

// Capture mode.
//
// The Progress Control Center mounts real application shells offscreen to take
// screenshots. That means AppLayout, its hooks and its timers all run, once per
// page per viewport. With 77 pages and three sizes that is over 200 mounts in a
// few minutes.
//
// Left alone, useMetaAutoSync would fire syncMetaSpend on every one of those
// mounts. Taking a screenshot must never write to the ad spend table, so any
// component with a side effect checks this flag and stands down.
//
// The rule: in capture mode, render exactly as normal and DO NOTHING ELSE. No
// timers, no background syncs, no mutations, no touching the parent document.

const CaptureModeContext = createContext(false);

export function CaptureModeProvider({ children }) {
  return (
    <CaptureModeContext.Provider value>
      {children}
    </CaptureModeContext.Provider>
  );
}

export function useCaptureMode() {
  return useContext(CaptureModeContext);
}
