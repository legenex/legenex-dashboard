import React from 'react';
import { useResizableWidth } from '@/hooks/useResizableWidth';
import ResizeHandle from './ResizeHandle';

// Wraps a section sub-navigation column and makes it horizontally resizable.
// Each section passes a unique storageKey so widths persist independently.
export default function SubNavShell({ storageKey, children }) {
  const { width, startResize } = useResizableWidth({
    storageKey,
    defaultWidth: 224, // matches the previous w-56
    min: 176,
    max: 340,
  });

  return (
    <nav
      data-resize-origin
      className="relative shrink-0 border-r border-border pr-3 h-full"
      style={{ width: `${width}px` }}
    >
      {children}
      <ResizeHandle onMouseDown={startResize} title="Drag to resize menu" />
    </nav>
  );
}