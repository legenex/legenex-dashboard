import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight, Database } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import PanelSectionHeader from '@/components/overview/PanelSectionHeader';
import CountUpText from '@/components/overview/CountUpText';

// Freshness tone + a 0-100 confidence score based on how long ago a source last synced.
function freshness(date) {
  if (!date) return { cls: 'status-error', bar: '#E5484D', label: 'never', dot: 'bg-destructive', score: 0 };
  const ageH = (Date.now() - new Date(date).getTime()) / 3600000;
  const label = formatDistanceToNow(new Date(date), { addSuffix: true });
  if (ageH <= 6) return { cls: 'status-sold', bar: '#3DD68C', label, dot: 'bg-[#3DD68C]', score: 100 };
  if (ageH <= 48) return { cls: 'status-unsold', bar: '#FACC14', label, dot: 'bg-[#FACC14]', score: 60 };
  return { cls: 'status-error', bar: '#E5484D', label, dot: 'bg-destructive', score: 25 };
}

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// Sync-freshness per money source. `sources` = [{ label, at }].
export default function DataConfidenceCard({ sources }) {
  const fresh = sources.filter(s => s.at && (Date.now() - new Date(s.at).getTime()) / 3600000 <= 6).length;
  return (
    <div className="bg-card border border-border rounded-[12px] overflow-hidden">
      <PanelSectionHeader
        icon={ShieldCheck}
        title="Data Confidence — Source Health"
        meta={<CountUpText value={fresh} render={(n) => `${Math.round(n)}/${sources.length} fresh`} />}
      />
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        initial="hidden"
        animate="show"
        className="divide-y divide-border"
      >
        {sources.map(s => {
          const t = freshness(s.at);
          return (
            <motion.div key={s.label} variants={rowVariants} className="px-5 py-2.5 flex items-center gap-3 text-[13px]">
              <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="w-[130px] shrink-0 text-foreground truncate">{s.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: t.bar }}
                  initial={{ width: 0 }}
                  animate={{ width: `${t.score}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className={`text-[11px] font-mono shrink-0 ${t.cls}`}>{t.label}</span>
            </motion.div>
          );
        })}
      </motion.div>
      <div className="px-5 py-3 border-t border-border">
        <Link
          to="/settings?tab=integrations"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Manage sources <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}