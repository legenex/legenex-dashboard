import React from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useResizableWidth } from '@/hooks/useResizableWidth';
import { useCollapsible } from '@/hooks/useCollapsible';
import ResizeHandle from './ResizeHandle';
import SubNavRail from './SubNavRail';

// A single icon in the desktop collapsed rail. Supports both link items (to)
// and callback items (onClick), with the label shown as a hover flyout.
function CollapsedIcon({ item }) {
  const Icon = item.icon;
  const inner = (
    <>
      {item.active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
      {Icon ? <Icon className="w-[18px] h-[18px]" /> : <span className="text-[11px] font-semibold">{(item.label || '?').slice(0, 2)}</span>}
    </>
  );
  const cls = `relative w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
    item.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  }`;
  return (
    <div className="relative group/subrail w-full flex justify-center">
      {item.to ? (
        <Link to={item.to} aria-label={item.label} className={cls}>{inner}</Link>
      ) : (
        <button type="button" onClick={item.onClick} aria-label={item.label} className={cls}>{inner}</button>
      )}
      {/* Label flyout on hover/focus */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 transition-opacity duration-150 group-hover/subrail:opacity-100 group-focus-within/subrail:opacity-100">
        <div className="whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-[12px] font-medium text-foreground shadow-lg">
          {item.label}
        </div>
      </div>
    </div>
  );
}

// Wraps a section sub-navigation column and makes it horizontally resizable
// and collapsible. The collapsed preference is remembered across pages and
// page refreshes.
//
// At lg and up: renders the resizable vertical column. When collapsed, the
// column shrinks to a thin rail with a single expand button.
// Below lg: renders no column and no ResizeHandle. Instead, when the nav passes
// an `items` array, it renders a horizontal scrolling rail (SubNavRail).
export default function SubNavShell({ children, items }) {
  // One shared width for every section's sub-nav — like the main sidebar,
  // it stays constant across all pages (ignores any per-section key).
  const { width, startResize } = useResizableWidth({
    storageKey: 'legenex_subnav_width',
    defaultWidth: 224, // matches the previous w-56
    min: 176,
    max: 340,
  });

  const { collapsed, toggle } = useCollapsible({ storageKey: 'legenex_subnav_collapsed' });

  return (
    <>
      {/* Mobile rail: below lg only */}
      {items && <SubNavRail items={items} />}

      {/* Desktop collapsed rail: lg and up only. Shows an icon for each item. */}
      {collapsed && (
        <div className="hidden lg:flex flex-col shrink-0 border-r border-border px-1 pt-2 h-full items-center gap-1 w-[56px] overflow-y-auto no-scrollbar">
          <button
            onClick={toggle}
            aria-label="Expand menu"
            title="Expand menu"
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          {items && items.length > 0 && (
            <div className="mt-2 w-full flex flex-col items-center gap-0.5">
              {items.map((item, i) => <CollapsedIcon key={item.to || item.label || i} item={item} />)}
            </div>
          )}
        </div>
      )}

      {/* Desktop vertical column: lg and up only */}
      {!collapsed && (
        <nav
          data-resize-origin
          className="hidden lg:block relative shrink-0 border-r border-border pr-2 h-full"
          style={{ width: `${width}px` }}
        >
          <div className="flex justify-end pr-1 pt-2">
            <button
              onClick={toggle}
              aria-label="Collapse menu"
              title="Collapse menu"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          {children}
          <ResizeHandle onMouseDown={startResize} title="Drag to resize menu" />
        </nav>
      )}
    </>
  );
}