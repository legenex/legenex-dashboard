import React from 'react';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import { ROLE_PRESETS } from '@/lib/permissions';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Eye, Check, X } from 'lucide-react';

const ROLE_ORDER = ['owner', 'admin', 'manager', 'supplier', 'buyer'];

// Floating role-preview control. Only Owner/Admin see it.
// Selecting a role re-evaluates every permission check as that role.
export default function ViewAsSwitcher() {
  const { previewRole, setPreviewRole } = useAuth();
  const { realRole, canPreview, previewing } = usePermissions();

  if (!canPreview) return null;

  const activeRole = previewing ? previewRole : realRole;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-full text-[12px] font-medium shadow-lg border transition-colors
              ${previewing
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border hover:bg-accent'}`}
          >
            <Eye className="w-3.5 h-3.5" />
            {previewing ? 'Viewing as' : 'View as'}
            <span className={`font-semibold ${previewing ? '' : 'text-primary'}`}>
              {ROLE_PRESETS[activeRole]?.label || activeRole}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-56 mb-1">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">Preview the app as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ROLE_ORDER.map(role => {
            const isActive = activeRole === role;
            const isReal = realRole === role;
            return (
              <DropdownMenuItem
                key={role}
                onClick={() => setPreviewRole(isReal ? null : role)}
                className="flex items-center gap-2 text-[13px] cursor-pointer"
              >
                <span className="w-4">{isActive && <Check className="w-3.5 h-3.5 text-primary" />}</span>
                <span className="flex-1">{ROLE_PRESETS[role]?.label || role}</span>
                {isReal && <span className="text-[10px] text-muted-foreground">You</span>}
              </DropdownMenuItem>
            );
          })}
          {previewing && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setPreviewRole(null)}
                className="flex items-center gap-2 text-[13px] cursor-pointer text-primary"
              >
                <X className="w-3.5 h-3.5" /> Exit preview
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}