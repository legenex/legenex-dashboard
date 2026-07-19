import React from 'react';
import { Rocket, Play, Undo2, Pause, Ban, Trash2 } from 'lucide-react';
import RowActionsMenu from '@/components/campaigns/RowActionsMenu';

// Per status row actions, presented as a shared 3-dot overflow menu. Instant
// transitions (Launch, Activate, Cancel) call onTransition directly. Pause,
// Terminate and Delete are routed through their confirm dialogs by the parent
// via onPause / onTerminate / onDelete. Status logic is unchanged; only the
// presentation moved from inline buttons to the dropdown.
export default function BuyerRowActions({ buyer, onTransition, onPause, onTerminate, onDelete }) {
  const status = String(buyer.status || 'draft').toLowerCase();
  const actions = [];

  if (status === 'draft') {
    actions.push({ label: 'Launch', icon: Rocket, onClick: () => onTransition(buyer, 'launching') });
  } else if (status === 'launching') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(buyer, 'active') });
    actions.push({ label: 'Cancel', icon: Undo2, onClick: () => onTransition(buyer, 'draft') });
  } else if (status === 'active') {
    actions.push({ label: 'Pause', icon: Pause, onClick: () => onPause(buyer) });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(buyer), danger: true, separatorBefore: true });
  } else if (status === 'paused') {
    actions.push({ label: 'Activate', icon: Play, onClick: () => onTransition(buyer, 'active') });
    actions.push({ label: 'Terminate', icon: Ban, onClick: () => onTerminate(buyer), danger: true, separatorBefore: true });
  } else if (status === 'terminated') {
    actions.push({ label: 'Delete', icon: Trash2, onClick: () => onDelete(buyer), danger: true });
  }

  return <RowActionsMenu actions={actions} />;
}
