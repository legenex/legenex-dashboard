import React from 'react';
import { motion } from 'framer-motion';
import { fmtMoney } from '@/lib/overviewFinance';
import useCountUp from '@/hooks/useCountUp';

// Build an SVG polyline path from a numeric series, normalized into the box.
function sparkPath(series, w, h) {
  if (!series || series.length < 2) return { d: '', last: null };
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * h;
    return [x, y];
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return { d, last: pts[pts.length - 1] };
}

// Grouped KPI: headline (animated count-up), delta %, sparkline, sub value, gap chip, note.
export default function GroupedKpiCard({
  label, headline, subLabel, sub, gapLabel = 'gap', gap, icon: Icon,
  delta = 0, spark = [], note, format = 'money',
}) {
  const animated = useCountUp(headline);
  const f = (v) => format === 'money' ? fmtMoney(v) : v;
  const gapTone = Math.abs(gap) < 0.01 ? 'bg-muted text-muted-foreground' : gap > 0 ? 'status-error-bg status-error' : 'status-sold-bg status-sold';
  const deltaTone = delta > 0 ? 'status-sold' : delta < 0 ? 'status-error' : 'text-muted-foreground';

  const W = 120, H = 28;
  const { d, last } = sparkPath(spark.length >= 2 ? spark : [0, 0], W, H);

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="group relative bg-card border border-border rounded-[12px] p-5 overflow-hidden hover:border-primary/30 transition-colors duration-200"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary/40" />

      {/* top row: label + icon */}
      <div className="flex items-start justify-between">
        <div className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
            <Icon className="w-[18px] h-[18px] text-primary" />
          </div>
        )}
      </div>

      {/* value + delta */}
      <div className="flex items-baseline gap-2 mt-2">
        <div className="text-[28px] font-bold text-foreground leading-tight font-display tabular-nums">{f(animated)}</div>
        <div className={`text-[12px] font-medium ${deltaTone}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</div>
      </div>

      {/* sparkline */}
      <div className="mt-1.5">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
          <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          {last && <circle cx={last[0]} cy={last[1]} r="2.5" fill="hsl(var(--primary))" />}
        </svg>
      </div>

      {/* bottom row: sub value + gap chip */}
      <div className="flex items-center justify-between mt-2">
        <div className="text-[12px] text-muted-foreground">{subLabel}: <span className="text-foreground font-medium tabular-nums">{f(sub)}</span></div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md tabular-nums ${gapTone}`}>{gapLabel} {f(Math.abs(gap))}</span>
      </div>

      {/* note */}
      {note && <div className="text-[11px] text-muted-foreground/80 mt-2">{note}</div>}
    </motion.div>
  );
}