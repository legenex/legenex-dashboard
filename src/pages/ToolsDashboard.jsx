import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SectionHeader from '@/components/shared/SectionHeader';
import StatCard from '@/components/overview/StatCard';
import ToolTile from '@/components/tools/ToolTile';
import {
  Bell, Calculator, ShieldCheck, FlaskConical,
  Search, PhoneCall, Sigma, AlertTriangle,
} from 'lucide-react';

export default function ToolsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['tools-dashboard'],
    queryFn: async () => {
      const [
        leads, calcs, rules, events, errors, hlr, emailVal,
      ] = await Promise.all([
        base44.entities.Lead.list('-created_date', 500),
        base44.entities.CustomCalculation.list('-created_date', 500),
        base44.entities.NotificationRule.list('-created_date', 200),
        base44.entities.NotificationEvent.list('-created_date', 200),
        base44.entities.ErrorLog.list('-created_date', 200),
        base44.entities.HlrSettings.list('-created_date', 1),
        base44.entities.EmailValidationSettings.list('-created_date', 1),
      ]);

      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const lookups = leads.filter(l => l.hlr_status || l.hlr_response).length;
      const verified = leads.filter(l => (l.hlr_summary_score || 0) > 0 || /match/i.test(l.hlr_status || '')).length;
      const emailChecks = leads.filter(l => l.email_valid).length;
      const recentErrors = errors.filter(e => new Date(e.created_date).getTime() > dayAgo).length;
      const recentEvents = events.filter(e => new Date(e.created_date).getTime() > dayAgo).length;

      return {
        lookups,
        verified,
        emailChecks,
        calcTotal: calcs.length,
        calcEnabled: calcs.filter(c => c.enabled).length,
        rulesTotal: rules.length,
        rulesEnabled: rules.filter(r => r.enabled).length,
        recentEvents,
        errorsTotal: errors.length,
        recentErrors,
        hlrEnabled: hlr[0]?.enabled ?? false,
        emailEnabled: emailVal[0]?.enabled ?? false,
      };
    },
  });

  const d = data || {};
  const n = (v) => (isLoading ? '—' : (v ?? 0).toLocaleString());

  return (
    <div>
      <SectionHeader
        title="Tools"
        subtitle="Operational utilities — verification, calculated fields, notifications and testing at a glance."
      />

      {/* Top-line stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="HLR Lookups" value={n(d.lookups)} subtitle="phone lookups run" icon={Search} />
        <StatCard label="Phone Verified" value={n(d.verified)} subtitle="matched numbers" icon={PhoneCall} />
        <StatCard label="Calculated Fields" value={n(d.calcTotal)} subtitle={`${n(d.calcEnabled)} active`} icon={Sigma} />
        <StatCard label="Errors (24h)" value={n(d.recentErrors)} subtitle={`${n(d.errorsTotal)} total logged`} icon={AlertTriangle} />
      </div>

      {/* Tool tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ToolTile
          to="/verification"
          icon={ShieldCheck}
          title="Verification"
          description="Phone (HLR) and email validation providers, routing filters and live testing."
          status={isLoading ? 'ok' : (d.hlrEnabled || d.emailEnabled ? 'ok' : 'warn')}
          stats={[
            { label: 'Lookups', value: n(d.lookups) },
            { label: 'Email checks', value: n(d.emailChecks) },
          ]}
        />
        <ToolTile
          to="/calculated-fields"
          icon={Calculator}
          title="Calculated Fields"
          description="Derived fields — age buckets, value maps and scripts computed on every lead."
          status="ok"
          stats={[
            { label: 'Total', value: n(d.calcTotal) },
            { label: 'Active', value: n(d.calcEnabled) },
          ]}
        />
        <ToolTile
          to="/notifications"
          icon={Bell}
          title="Notifications"
          description="Alert rules for errors, HLR failures, low sold-rate and queued leads."
          status={isLoading ? 'ok' : (d.recentErrors > 0 ? 'warn' : 'ok')}
          stats={[
            { label: 'Rules', value: n(d.rulesTotal) },
            { label: 'Events (24h)', value: n(d.recentEvents) },
          ]}
        />
        <ToolTile
          to="/payload-tester"
          icon={FlaskConical}
          title="Payload Tester"
          description="Send test payloads through the pipeline and inspect the full response envelope."
          status="ok"
          stats={[]}
        />
      </div>
    </div>
  );
}