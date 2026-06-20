import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import StatusPill from '@/components/shared/StatusPill';
import LeadDetailModal from '@/components/leads/LeadDetailModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function Leads() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 500),
  });

  const filtered = leads.filter(l => {
    if (statusFilter !== 'all' && l.final_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (l.first_name || '').toLowerCase().includes(q)
        || (l.last_name || '').toLowerCase().includes(q)
        || (l.mobile || '').includes(q)
        || (l.email || '').toLowerCase().includes(q)
        || (l.supplier_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const exportCSV = () => {
    const headers = ['ID', 'Created', 'Supplier', 'Name', 'Mobile', 'Email', 'HLR Status', 'LB Status', 'Final Status', 'Process Time'];
    const rows = filtered.map(l => [
      l.id, l.created_date, l.supplier_name, `${l.first_name || ''} ${l.last_name || ''}`,
      l.mobile, l.email, l.hlr_status, l.leadbyte_record_status, l.final_status, l.process_time_ms
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Leads" subtitle="All processed leads with full trace data">
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, mobile, email, supplier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Sold">Sold</SelectItem>
            <SelectItem value="Unsold">Unsold</SelectItem>
            <SelectItem value="Error">Error</SelectItem>
            <SelectItem value="Processing">Processing</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-[12px] text-muted-foreground">{filtered.length} leads</div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0">
                {['Created', 'Supplier', 'Name', 'Mobile', 'HLR Status', 'LB Status', 'Final Status', 'Time'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
              )}
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  className="hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedLead(lead)}
                >
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                    {lead.created_date ? format(new Date(lead.created_date), 'MMM dd HH:mm') : ''}
                  </td>
                  <td className="px-4 py-3 text-secondary-foreground">{lead.supplier_name}</td>
                  <td className="px-4 py-3 text-foreground">{lead.first_name} {lead.last_name}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{lead.mobile}</td>
                  <td className="px-4 py-3">{lead.hlr_status || '—'}</td>
                  <td className="px-4 py-3">{lead.leadbyte_record_status || '—'}</td>
                  <td className="px-4 py-3"><StatusPill status={lead.final_status} /></td>
                  <td className="px-4 py-3 font-mono text-[11px]">{lead.process_time_ms ? `${lead.process_time_ms}ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LeadDetailModal lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}