import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { integrationStatus } from '@/functions/integrationStatus';
import { distributionInsights } from '@/functions/distributionInsights';
import SectionHeader from '@/components/shared/SectionHeader';
import RefreshButton from '@/components/shared/RefreshButton';
import PeriodTabs from '@/components/shared/PeriodTabs';
import { resolvePeriod, priorWindow, PERIOD_LABELS } from '@/lib/periodRange';
import { operationalMetrics, leadsOverTime, supplierBreakdown } from '@/lib/distributionMetrics';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Copy, Link2, Workflow, Users, CheckCircle2, Ban, Clock, RotateCcw, XCircle, AlertTriangle,
  Target, Phone, Mail, MessageSquare, Brain, Sparkles, ArrowUpRight, RefreshCw,
} from 'lucide-react';

/* Design tokens (Legenex Performance framework) */
const C = {
  bg: '#0A0E15', panel: '#131924', panel2: '#182030', border: '#243044', borderSoft: '#1C2536',
  red: '#E5484D', redSoft: 'rgba(229,72,77,0.12)', green: '#3DD68C', greenSoft: 'rgba(61,214,140,0.12)',
  amber: '#E8A33D', amberSoft: 'rgba(232,163,61,0.12)', blue: '#5B8DEF', blueSoft: 'rgba(91,141,239,0.12)',
  text: '#EEF2F8', mut: '#8B95A8', dim: '#5A6478',
};

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: 0.05 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

const toneColor = (t) =>
  t === 'green' ? C.green : t === 'red' ? C.red : t === 'amber' ? C.amber : t === 'blue' ? C.blue : C.mut;

const Panel = ({ children, className = '', glow, style = {} }) => (
  <div
    className={`relative rounded-xl border ${className}`}
    style={{
      background: `linear-gradient(180deg, ${C.panel2} 0%, ${C.panel} 100%)`,
      borderColor: C.border,
      boxShadow: glow
        ? `0 0 0 1px ${glow}22, 0 8px 40px -12px ${glow}33, 0 12px 32px -16px rgba(0,0,0,0.6)`
        : '0 12px 32px -16px rgba(0,0,0,0.6)',
      ...style,
    }}
  >
    {children}
  </div>
);

const PulseDot = ({ color = C.green, size = 7 }) => (
  <span className="relative inline-flex" style={{ width: size, height: size }}>
    <motion.span
      className="absolute inset-0 rounded-full"
      style={{ background: color }}
      animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
    />
    <span className="relative rounded-full w-full h-full" style={{ background: color }} />
  </span>
);

const Tag = ({ children, tone = 'slate', mono }) => {
  const map = {
    slate: { bg: 'rgba(139,149,168,0.10)', fg: C.mut, bd: C.border },
    red: { bg: C.redSoft, fg: '#F2777B', bd: 'rgba(229,72,77,0.35)' },
    green: { bg: C.greenSoft, fg: C.green, bd: 'rgba(61,214,140,0.35)' },
    amber: { bg: C.amberSoft, fg: C.amber, bd: 'rgba(232,163,61,0.35)' },
    blue: { bg: C.blueSoft, fg: C.blue, bd: 'rgba(91,141,239,0.35)' },
  }[tone];
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium tracking-wide border ${mono ? 'font-mono' : ''}`}
      style={{ background: map.bg, color: map.fg, borderColor: map.bd }}
    >
      {children}
    </span>
  );
};

const Btn = ({ icon: Icon, children, primary, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11.5px] font-medium border shrink-0"
    style={
      primary
        ? { background: C.red, color: '#fff', borderColor: C.red, boxShadow: `0 0 16px ${C.red}44` }
        : { borderColor: C.border, background: 'rgba(10,14,21,0.5)', color: C.mut }
    }
  >
    {Icon && <Icon size={12} />} {children}
  </button>
);

export default function DistributionDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const win = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const prior = useMemo(() => priorWindow(win), [win]);

  const { data: leads = [] } = useQuery({ queryKey: ['dist-leads'], queryFn: () => base44.entities.Lead.filter({ archived: false }, '-created_date', 2000) });
  const { data: errors = [] } = useQuery({ queryKey: ['dist-errors'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 1000) });
  const { data: hlrArr = [] } = useQuery({ queryKey: ['hlr-settings'], queryFn: () => base44.entities.HlrSettings.list() });
  const { data: emailArr = [] } = useQuery({ queryKey: ['email-val-settings'], queryFn: () => base44.entities.EmailValidationSettings.list() });
  const { data: appSettingsArr = [] } = useQuery({ queryKey: ['app-settings'], queryFn: () => base44.entities.AppSettings.list() });
  const { data: metaCfg } = useQuery({ queryKey: ['meta-config'], queryFn: async () => (await base44.entities.IntegrationConfig.filter({ name: 'meta' }))[0] || null });
  const { data: intStatus } = useQuery({ queryKey: ['integration-status'], queryFn: async () => (await integrationStatus({}))?.data?.status || {} });

  const publicBaseUrl = appSettingsArr[0]?.public_base_url || 'https://api.legenex.com';
  const endpointUrl = `${publicBaseUrl}/functions/leads`;

  const m = useMemo(() => operationalMetrics(leads, errors, win), [leads, errors, win]);
  const priorM = useMemo(() => operationalMetrics(leads, errors, prior), [leads, errors, prior]);
  const series = useMemo(() => leadsOverTime(m.leads, win), [m.leads, win]);
  const chartData = useMemo(() => series.map(d => ({ day: d.date, volume: d.Total, sold: d.Sold })), [series]);

  const hlrProvider = hlrArr[0]?.provider_name;
  const emailActive = emailArr.length > 0 ? (emailArr[0]?.enabled !== false) : true;

  const verifications = [
    { name: 'Phone HLR', icon: Phone, ok: !!hlrProvider, status: hlrProvider ? 'Active' : 'Not configured' },
    { name: 'Email Validation', icon: Mail, ok: emailActive, status: emailActive ? 'Active' : 'Not configured' },
    { name: 'Meta CAPI', icon: Target, ok: !!metaCfg, status: metaCfg ? 'Connected' : 'Not connected' },
    { name: 'Slack Alerts', icon: MessageSquare, ok: !!intStatus?.slack, status: intStatus?.slack ? 'Connected' : 'Not connected' },
  ];

  const stages = [
    { label: 'Total Leads', value: m.total, icon: Users, tone: 'slate' },
    { label: 'Sold', value: m.sold, icon: CheckCircle2, tone: 'green' },
    { label: 'Disqualified', value: m.disqualified, icon: Ban, tone: 'red' },
    { label: 'Unsold', value: m.unsold, icon: Clock, tone: 'amber' },
    { label: 'Returns', value: m.returns, icon: RotateCcw, tone: 'slate' },
    { label: 'Rejections', value: m.rejections, icon: XCircle, tone: 'red' },
    { label: 'Errors', value: m.errors, icon: AlertTriangle, tone: 'red' },
    { label: 'Conversions', value: m.conversions, icon: Target, tone: 'green' },
  ];

  const insightSummary = useMemo(() => ({
    period: PERIOD_LABELS[period],
    current: {
      total: m.total, sold: m.sold, disqualified: m.disqualified, unsold: m.unsold,
      returns: m.returns, rejections: m.rejections, errors: m.errors, conversions: m.conversions,
      pctDq: m.pctDq, pctError: m.pctError, pctRejection: m.pctRejection, convRate: m.convRate,
    },
    prior: {
      total: priorM.total, disqualified: priorM.disqualified, errors: priorM.errors,
      pctDq: priorM.pctDq, pctError: priorM.pctError,
    },
    suppliers: supplierBreakdown(m.leads).slice(0, 15),
  }), [m, priorM, period]);

  const copyEndpoint = () => {
    try { navigator.clipboard.writeText(endpointUrl); toast.success('Endpoint copied'); } catch { /* noop */ }
  };

  const runAi = async () => {
    setAiLoading(true);
    try {
      const res = await distributionInsights({ summary: insightSummary, periodLabel: PERIOD_LABELS[period] });
      const text = res?.data?.insights || '';
      if (text) setAiText(text);
      else toast.error(res?.data?.error || 'Could not generate insights');
    } catch {
      toast.error('Could not generate insights');
    }
    setAiLoading(false);
  };

  const aiBullets = aiText.split('\n').map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, ''));
  const defaultNarrative = `${m.total} lead${m.total === 1 ? '' : 's'} processed this period. ${m.sold} sold, ${m.unsold} unsold, ${m.disqualified} disqualified, ${m.errors} error${m.errors === 1 ? '' : 's'}.`;

  return (
    <div>
      <SectionHeader title="Distribution Dashboard" subtitle="Operational pipeline health, volume, status mix, verification and source performance">
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodTabs value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
          <RefreshButton onClick={() => qc.invalidateQueries()} />
        </div>
      </SectionHeader>

      <div className="space-y-5 mt-4">
        {/* Endpoint + verification stack */}
        <Panel className="overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 w-[120px] pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${C.green}0A 50%, transparent)` }}
            animate={{ left: ['-12%', '112%'] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative flex flex-col xl:flex-row xl:items-center gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: C.greenSoft, border: '1px solid rgba(61,214,140,0.3)' }}>
                <Link2 size={15} style={{ color: C.green }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.14em]" style={{ color: C.dim }}>SUPPLIER ENDPOINT</span>
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: C.green }}>
                    <PulseDot size={4} /> accepting POSTs
                  </span>
                </div>
                <code className="block text-[13px] font-mono truncate mt-0.5" style={{ color: '#F2777B' }}>{endpointUrl}</code>
              </div>
              <Btn icon={Copy} onClick={copyEndpoint}>Copy</Btn>
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-2">
              {verifications.map((v) => (
                <div
                  key={v.name}
                  className="flex items-center gap-2 px-3 h-9 rounded-lg border"
                  style={{ borderColor: v.ok ? 'rgba(61,214,140,0.3)' : 'rgba(229,72,77,0.3)', background: v.ok ? C.greenSoft : C.redSoft }}
                >
                  <v.icon size={13} style={{ color: v.ok ? C.green : '#F2777B' }} />
                  <span className="text-[11.5px] font-medium" style={{ color: C.text }}>{v.name}</span>
                  <span className="text-[10.5px]" style={{ color: v.ok ? C.green : '#F2777B' }}>{v.status}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Pipeline stages */}
        <Panel>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Workflow size={15} style={{ color: C.mut }} />
              <h3 className="text-[13px] font-semibold" style={{ color: C.text }}>Pipeline · {PERIOD_LABELS[period]}</h3>
            </div>
            {m.unsold > 0 && <Tag tone="amber">{m.unsold} unsold in flight</Tag>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 px-5 pb-5">
            {stages.map((s, i) => {
              const col = toneColor(s.tone);
              const barW = m.total > 0 && s.value > 0 ? `${Math.max(6, Math.round((s.value / m.total) * 100))}%` : '3%';
              return (
                <motion.div
                  key={s.label}
                  variants={rise}
                  initial="hidden"
                  animate="show"
                  custom={i}
                  whileHover={{ y: -3 }}
                  className="p-3.5 rounded-lg border"
                  style={{ borderColor: s.value > 0 && s.tone === 'amber' ? 'rgba(232,163,61,0.4)' : C.borderSoft, background: 'rgba(10,14,21,0.45)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-semibold tracking-[0.1em] uppercase" style={{ color: C.mut }}>{s.label}</span>
                    <s.icon size={13} style={{ color: col, opacity: 0.85 }} />
                  </div>
                  <div className="text-[26px] font-bold tabular-nums mt-1.5" style={{ color: s.tone === 'slate' ? C.text : col }}>{s.value}</div>
                  <div className="h-0.5 rounded-full mt-2" style={{ background: C.borderSoft }}>
                    <div className="h-full rounded-full" style={{ background: col, width: barW, opacity: 0.7 }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Panel>

        {/* Chart + AI */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
          <Panel className="flex flex-col">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-[13px] font-semibold" style={{ color: C.text }}>Leads Over Time</h3>
              <Tag>{PERIOD_LABELS[period]}</Tag>
            </div>
            <div className="relative flex-1 min-h-[240px] px-2 pb-3">
              <div
                className="absolute inset-x-5 inset-y-0 pointer-events-none opacity-40"
                style={{
                  backgroundImage: `linear-gradient(${C.border}2E 1px, transparent 1px), linear-gradient(90deg, ${C.border}2E 1px, transparent 1px)`,
                  backgroundSize: '48px 44px',
                }}
              />
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="volFill2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.amber} stopOpacity="0.25" />
                      <stop offset="100%" stopColor={C.amber} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={`${C.border}40`} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: C.dim, fontSize: 10.5 }} axisLine={{ stroke: C.borderSoft }} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 10.5 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, color: C.text }} />
                  <ReferenceLine y={0} stroke={`${C.mut}55`} strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="volume" stroke={C.amber} strokeWidth={1.5} fill="url(#volFill2)" name="Volume" />
                  <Line type="monotone" dataKey="sold" stroke={C.green} strokeWidth={1.5} dot={false} name="Sold" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel glow={C.red} className="flex flex-col overflow-hidden">
            <motion.div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, transparent, ${C.red}, transparent)` }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex items-center gap-2">
                <Brain size={15} style={{ color: '#F2777B' }} />
                <h3 className="text-[13px] font-semibold" style={{ color: C.text }}>AI Insights</h3>
              </div>
              <button onClick={runAi} disabled={aiLoading} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: C.mut }}>
                <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} /> {aiText ? 'Refresh' : 'Generate'}
              </button>
            </div>
            <div className="px-5 py-3 space-y-3 flex-1">
              {aiBullets.length > 0 ? (
                <ul className="space-y-2">
                  {aiBullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px]" style={{ color: C.text }}>
                      <span style={{ color: '#F2777B' }}>•</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] leading-relaxed" style={{ color: C.text }}>{defaultNarrative}</p>
              )}
              <div className="flex items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: C.borderSoft, background: 'rgba(10,14,21,0.5)' }}>
                <Sparkles size={13} style={{ color: '#F2777B' }} className="shrink-0" />
                <p className="text-[11.5px]" style={{ color: C.mut }}>
                  <span className="font-semibold" style={{ color: C.text }}>Top recommendation:</span>{' '}
                  {m.unsold > 0 ? 'route unsold leads by configuring a buyer for this campaign.' : 'keep supplier feeds fresh so status counts stay reliable.'}
                </p>
              </div>
              <button onClick={() => navigate('/campaigns?tab=buyers')} className="text-[12px] font-medium inline-flex items-center gap-1" style={{ color: '#F2777B' }}>
                Open Buyers <ArrowUpRight size={12} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
