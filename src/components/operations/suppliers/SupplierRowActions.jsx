import React from 'react';
import { Play, Pause, Ban, Trash2 } from 'lucide-react';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';

// Per status row actions, presented as a shared 3-dot overflow menu. Instant
// transitions (Activate) call onTransition directly. Pause, Terminate and
// Delete are routed through their confirm dialogs by the parent via
// onPause / onTerminate / onDelete. Status logic is unchanged; only the
// presentation moved from inline buttons to the dropdown.
export default function SupplierRowActions({ supplier, onTransition, onPause, onTerminate, onDelete }) {
  const status = String(supplier.status || 'new').toLowerCase();
  const actions = [];

  if (status === 'new') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(supplier, 'active') });
  } else if (status === 'active') {
    actions.push({ label: 'Pause', icon: Pause, onClick: () => onPause(supplier) });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(supplier), danger: true, separatorBefore: true });
  } else if (status === 'paused') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(supplier, 'active') });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(supplier), danger: true, separatorBefore: true });
  } else if (status === 'terminated') {
    actions.push({ label: 'Delete', icon: Trash2, onClick: () => onDelete(supplier), danger: true });
  }

  return <RowActionsMenu actions={actions} />;
}
