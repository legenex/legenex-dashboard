import React from 'react';
import { MoreVertical, Pencil, Files, Trash2 } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

// Shared 3-dot row actions menu for Campaigns tables (Buyers, Suppliers).
// Pass any of onEdit / onClone / onDelete to show that action.
export default function RowActionsMenu({ onEdit, onClone, onDelete }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Actions"
            aria-label="Row actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {onEdit && (
            <DropdownMenuItem onClick={(e) => onEdit(e)} className="text-[12px] cursor-pointer gap-2">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </DropdownMenuItem>
          )}
          {onClone && (
            <DropdownMenuItem onClick={(e) => onClone(e)} className="text-[12px] cursor-pointer gap-2">
              <Files className="w-3.5 h-3.5" /> Clone
            </DropdownMenuItem>
          )}
          {onDelete && (onEdit || onClone) && <DropdownMenuSeparator />}
          {onDelete && (
            <DropdownMenuItem onClick={(e) => onDelete(e)} className="text-[12px] cursor-pointer gap-2 text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}