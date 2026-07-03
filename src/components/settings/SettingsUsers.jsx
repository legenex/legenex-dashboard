import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function SettingsUsers() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const handleInvite = async () => {
    setInviting(true);
    await base44.users.inviteUser(email, role);
    toast.success(`Invitation sent to ${email}`);
    setInviteOpen(false);
    setEmail('');
    setInviting(false);
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
          <UserPlus className="w-4 h-4" /> Invite User
        </Button>
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Name', 'Email', 'Role', 'Joined'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>
            )}
            {users.map(u => (
              <tr key={u.id} className="hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{u.full_name || '-'}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] ${u.role === 'admin' ? 'text-primary border-primary/30' : ''}`}>{u.role || 'user'}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{u.created_date ? format(new Date(u.created_date), 'MMM dd, yyyy') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-popover border-border max-w-[380px]">
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="mt-1 bg-background" /></div>
            <div>
              <Label className="text-[12px]">Role</Label>
              <SearchableSelect
                value={role}
                onValueChange={setRole}
                className="mt-1 bg-background"
                options={[
                  { value: 'user', label: 'User' },
                  { value: 'admin', label: 'Admin' },
                ]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!email || inviting}>{inviting ? 'Sending...' : 'Send Invite'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}