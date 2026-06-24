import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import ErrorStatusPill from '@/components/leads/ErrorStatusPill';
import LeadDetailModal from '@/components/leads/LeadDetailModal';
import LeadsFilterBar from '@/components/leads/LeadsFilterBar';
import { Button } from '@/components/ui/button';
import RefreshButton from '@/components/shared/RefreshButton';
import { Download } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth, subDays, subMonths, isAfter } from 'date-fns';

function getFromMapped(lead, keys) {
  let mf = {};
  try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch {}
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(mf)) {
      if (k.toLowerCase() === lowerKey && v != null && v !== '') return v;
    }
  }
  return null;
}

function matchesView(lead, view) {
  switch (view) {
    case 'all': return true;
    case 'sold': return lead.final_status === 'Sold';
    case 'unsold': return lead.final_status === 'Unsold';
    case 'disqualified':
      return lead.final_status === 'Error' || /disqual|dq/i.test(lead.leadbyte_record_status || '');
    case 'rejected':
      return lead.final_status === 'Duplicate' || /reject/i.test(lead.leadbyte_record_status || '');
    case 'queued': return lead.final_status === 'Queued';
    default: return true;
  }
}

function getDateBounds(range, customDate) {
  const now = new Date();
  switch (range) {
    case 'today': return { start: startOfDay(now) };
    case 'yesterday': { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
    case 'this_week': return { start: startOfWeek(now, { weekStartsOn: 1 }) };
    case 'this_month': return { start: startOfMonth(now) };
    case 'last_month': { const lm = subMonths(now, 1); return { start: startOfMonth(lm), end: endOfMonth(lm) }; }
    case 'this_year': return { start: new Date(now.getFullYear(), 0, 1) };
    case 'custom': return {
      start: customDate.start ? startOfDay(new Date(customDate.start)) : null,
      end: customDate.end ? endOfDay(new Date(customDate.end)) : null,
    };
    default: return {};
  }
}

function getFieldValue(lead, field) {
  if (lead[field] != null && lead[field] !== '') return String(lead[field]);
  let mf = {};
  try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch {}
  if (mf[field] != null && mf[field] !== '') return String(mf[field]);
  return '';
}

function matchesFilter(lead, filter) {
  if (!filter.field) return true;
  const value = getFieldValue(lead, filter.field);
  const target = (filter.value || '').toLowerCase();
  switch (filter.operator) {
    case 'equals': return value.toLowerCase() === target;
    case 'not_equals': return value.toLowerCase() !== target;
    case 'contains': return value.toLowerCase().includes(target);
    case 'not_contains': return !value.toLowerCase().includes(target);
    case 'starts_with': return value.toLowerCase().startsWith(target);
    case 'ends_with': return value.toLowerCase().endsWith(target);
    case 'is_empty': return !value;
    case 'is_not_empty': return !!value;
    case 'gt': return parseFloat(value) > parseFloat(target);
    case 'lt': return parseFloat(value) < parseFloat(target);
    default: return true;
  }
}

function matchesSearch(lead, q) {
  const query = q.toLowerCase();
  return (lead.first_name || '').toLowerCase().includes(query)
    || (lead.last_name || '').toLowerCase().includes(query)
    || (lead.mobile || '').includes(query)
    || (lead.email || '').toLowerCase().includes(query)
    || (lead.supplier_name || '').toLowerCase().includes(query);
}

const COLUMN_DEFS = {
  created: { header: 'Created', accessor: (l) => l.created_date ? format(new Date(l.created_date), 'MMM dd HH:mm') : '—', className: 'font-mono text-[11px] text-muted-foreground whitespace-nowrap' },
  supplier: { header: 'Supplier', accessor: (l) => l.supplier_name || '—' },
  source: { header: 'Source', accessor: (l) => getFromMapped(l, ['source', 'lead_source', 'source_id', 'src']) || '—' },
  fullName: { header: 'Full Name', accessor: (l) => `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—' },
  email: { header: 'Email', accessor: (l) => l.email || '—' },
  mobile: { header: 'Mobile', accessor: (l) => l.mobile || '—', className: 'font-mono text-[12px]' },
  state: { header: 'State', accessor: (l) => getFromMapped(l, ['state', 'st', 'region', 'state_code']) || '—' },
  revenue: { header: 'Revenue', accessor: (l) => l.revenue ? `$${l.revenue}` : '—', className: 'font-mono text-[12px] status-sold' },
  buyer: { header: 'Buyer', accessor: (l) => getFromMapped(l, ['buyer', 'buyer_id', 'buyer_name']) || '—' },
  finalStatus: { header: 'Final Status', accessor: (l) => l.final_status || '—' },
  processTime: { header: 'Time', accessor: (l) => l.process_time_ms ? `${l.process_time_ms}ms` : '—', className: 'font-mono text-[11px] text-muted-foreground' },
};

const VIEW_CONFIGS = {
  all: { title: 'All Leads', subtitle: 'All processed leads with full trace data', columns: ['created', 'supplier', 'source', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
  sold: { title: 'Sold Leads', subtitle: 'Sold leads with revenue and buyer data', columns: ['created', 'revenue', 'supplier', 'source', 'buyer', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
  unsold: { title: 'Unsold Leads', subtitle: 'Leads that were not sold', columns: ['created', 'supplier', 'source', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
  disqualified: { title: 'Disqualified Leads', subtitle: 'Leads that were disqualified', columns: ['created', 'supplier', 'source', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
  rejected: { title: 'Rejected Leads', subtitle: 'Leads that were rejected', columns: ['created', 'supplier', 'source', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
  queued: { title: 'Queued Leads', subtitle: 'Leads queued for manual handling', columns: ['created', 'supplier', 'source', 'fullName', 'email', 'mobile', 'state', 'finalStatus', 'processTime'] },
};

const SYSTEM_FILTER_FIELDS = [
  { value: 'supplier_name', label: 'Supplier' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'final_status', label: 'Final Status' },
  { value: 'hlr_status', label: 'HLR Status' },
  { value: 'leadbyte_record_status', label: 'LB Record Status' },
  { value: 'lead_id', label: 'Lead ID' },
  { value: 'revenue', label: 'Revenue' },
];

const STORAGE_KEY = 'legenex_saved_filters';

function loadSavedSets(view) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[view] || [];
  } catch { return []; }
}

function persistSavedSets(view, sets) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    all[view] = sets;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
}

export default function LeadsTable({ view }) {
  const qc = useQueryClient();
  const config = VIEW_CONFIGS[view] || VIEW_CONFIGS.all;

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [customDate, setCustomDate] = useState({ start: '', end: '' });
  const [customFilters, setCustomFilters] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [initialTab, setInitialTab] = useState('summary');
  const [savedSets, setSavedSets] = useState(() => loadSavedSets(view));

  useEffect(() => {
    setSearch('');
    setDateRange('all');
    setCustomDate({ start: '', end: '' });
    setCustomFilters([]);
    setSavedSets(loadSavedSets(view));
  }, [view]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads-all-non-archived'],
    queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 500),
  });

  const { data: errorLogs = [] } = useQuery({
    queryKey: ['error-logs-recent'],
    queryFn: () => base44.entities.ErrorLog.list('-created_date', 200),
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  const errorLogByLeadId = useMemo(() => {
    const map = {};
    for (const e of errorLogs) {
      if (e.lead_id && !map[e.lead_id]) map[e.lead_id] = e;
    }
    return map;
  }, [errorLogs]);

  const filterFields = useMemo(() => {
    const customOpts = customFields.map(f => ({ value: f.field_name, label: f.label || f.field_name }));
    return [...SYSTEM_FILTER_FIELDS, ...customOpts];
  }, [customFields]);

  const filtered = useMemo(() => {
    const bounds = getDateBounds(dateRange, customDate);
    return leads.filter(lead => {
      if (!matchesView(lead, view)) return false;
      if (bounds.start && !isAfter(new Date(lead.created_date), bounds.start)) return false;
      if (bounds.end && isAfter(new Date(lead.created_date), bounds.end)) return false;
      if (!customFilters.every(f => matchesFilter(lead, f))) return false;
      if (search && !matchesSearch(lead, search)) return false;
      return true;
    });
  }, [leads, view, dateRange, customDate, customFilters, search]);

  const exportCSV = () => {
    const cols = config.columns;
    const headers = cols.map(c => COLUMN_DEFS[c]?.header || c);
    const rows = filtered.map(l => cols.map(c => COLUMN_DEFS[c]?.accessor(l) || ''));
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${view}-leads.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const openLeadDetail = (lead, stage) => {
    setInitialTab(stage === 'hlr' ? 'hlr' : stage === 'leadbyte' ? 'leadbyte' : 'summary');
    setSelectedLead(lead);
  };

  const applySavedSet = (set) => {
    setDateRange(set.dateRange || 'all');
    setCustomDate(set.customDate || { start: '', end: '' });
    setCustomFilters(set.customFilters || []);
    setSearch(set.search || '');
  };

  const saveCurrentAsSet = (name) => {
    const newSet = { id: Date.now().toString(), name, dateRange, customDate, customFilters, search };
    const updated = [...savedSets, newSet];
    setSavedSets(updated);
    persistSavedSets(view, updated);
  };

  const deleteSavedSet = (id) => {
    const updated = savedSets.filter(s => s.id !== id);
    setSavedSets(updated);
    persistSavedSets(view, updated);
  };

  return (
    <div>
      <PageHeader title={config.title} subtitle={config.subtitle}>
        <RefreshButton onClick={() => qc.invalidateQueries()} />
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </PageHeader>

      <LeadsFilterBar
        search={search}
        setSearch={setSearch}
        dateRange={dateRange}
        setDateRange={setDateRange}
        customDate={customDate}
        setCustomDate={setCustomDate}
        customFilters={customFilters}
        setCustomFilters={setCustomFilters}
        savedSets={savedSets}
        onSaveSet={saveCurrentAsSet}
        onDeleteSet={deleteSavedSet}
        onApplySet={applySavedSet}
        filterFields={filterFields}
        resultCount={filtered.length}
      />

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/50 sticky top-0">
                {config.columns.map(colKey => (
                  <th key={colKey} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {COLUMN_DEFS[colKey]?.header || colKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={config.columns.length} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={config.columns.length} className="px-4 py-8 text-center text-muted-foreground">No leads found</td></tr>
              )}
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  className="hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => openLeadDetail(lead)}
                >
                  {config.columns.map(colKey => {
                    const col = COLUMN_DEFS[colKey];
                    if (!col) return <td key={colKey} className="px-4 py-3">—</td>;
                    if (colKey === 'finalStatus') {
                      return (
                        <td key={colKey} className="px-4 py-3">
                          <ErrorStatusPill
                            lead={lead}
                            errorLogEntry={errorLogByLeadId[lead.id]}
                            onOpenDetail={openLeadDetail}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={colKey} className={`px-4 py-3 ${col.className || ''}`}>
                        {col.accessor(lead)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        initialTab={initialTab}
      />
    </div>
  );
}