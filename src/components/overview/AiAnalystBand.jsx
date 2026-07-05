import React from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

// AI Analyst briefing band. Parent owns the data + refresh; this is presentational.
export default function AiAnalystBand({ text, loading, error, onRefresh }) {
  return (
    <div className="relative bg-card border border-border rounded-[12px] p-5 overflow-hidden">
      {/* subtle animated accent glow */}
      <motion.div
        aria-hidden
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity }}
      />
      <div className="relative flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-[18px] h-[18px] text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold text-foreground uppercase tracking-wider">AI Analyst</div>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="mt-2 space-y-2">
              {[92, 100, 74].map((w, i) => (
                <div key={i} className="h-3 rounded bg-muted overflow-hidden relative" style={{ width: `${w}%` }}>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="mt-1.5 text-[13px] status-error">{error}</div>
          ) : (
            <motion.p
              key={text}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="mt-1.5 text-[13px] leading-relaxed text-foreground/90"
            >
              {text}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}