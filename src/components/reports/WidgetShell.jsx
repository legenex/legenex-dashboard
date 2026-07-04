import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Filter, Columns3, Download, Copy, Trash2, ArrowLeft, ArrowRight, Maximize2 } from 'lucide-react';

// Reusable widget frame: title + Filter/Columns/Export + per-widget settings menu.
// onExport receives nothing; parent builds CSV. columnsSlot renders the column toggler.
export default function WidgetShell({
  title, children, wide, onToggleWide, onExport, onDuplicate, onRemove, onMoveLeft, onMoveRight,
  filterSlot, columnsSlot,
}) {
  return (
    <div className={`bg-card border border-border rounded-[10px] p-4 ${wide ? 'xl:col-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        <div className="flex items-center gap-1">
          {filterSlot}
          {columnsSlot}
          {onExport && (
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px] text-muted-foreground" onClick={onExport}>
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              {onToggleWide && <DropdownMenuItem onClick={onToggleWide}><Maximize2 className="w-3.5 h-3.5 mr-2" /> {wide ? 'Shrink' : 'Widen'}</DropdownMenuItem>}
              {onMoveLeft && <DropdownMenuItem onClick={onMoveLeft}><ArrowLeft className="w-3.5 h-3.5 mr-2" /> Move left</DropdownMenuItem>}
              {onMoveRight && <DropdownMenuItem onClick={onMoveRight}><ArrowRight className="w-3.5 h-3.5 mr-2" /> Move right</DropdownMenuItem>}
              {onDuplicate && <DropdownMenuItem onClick={onDuplicate}><Copy className="w-3.5 h-3.5 mr-2" /> Duplicate</DropdownMenuItem>}
              <DropdownMenuSeparator />
              {onRemove && <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Remove</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {children}
    </div>
  );
}

export { Filter, Columns3 };