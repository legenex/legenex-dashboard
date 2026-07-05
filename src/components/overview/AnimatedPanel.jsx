import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// Shared animated panel wrapper: gradient surface, glow, grid texture, and a
// horizontal scanning-line sweep. Children render above the texture/sweep.
// Colors: panel2 #182030, panel #131924, border #243044, red #E5484D.
export default function AnimatedPanel({
  children,
  glow = '#E5484D',
  duration = 6,
  className = '',
  style = {},
}) {
  // Small random delay so panels do not all sweep in unison.
  const delay = useMemo(() => -(Math.random() * duration), [duration]);

  const boxShadow = glow
    ? `0 0 0 1px ${glow}22, 0 8px 40px -12px ${glow}33, 0 12px 32px -16px rgba(0,0,0,0.6)`
    : '0 12px 32px -16px rgba(0,0,0,0.6)';

  return (
    <div
      className={`relative rounded-xl border overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(180deg, #182030 0%, #131924 100%)',
        borderColor: '#243044',
        boxShadow,
        ...style,
      }}
    >
      {/* grid texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.35,
          backgroundImage:
            'linear-gradient(#24304433 1px, transparent 1px), linear-gradient(90deg, #24304433 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* scanning line sweep */}
      <motion.div
        aria-hidden
        className="absolute top-0 bottom-0 w-[140px] pointer-events-none z-0"
        style={{
          background:
            'linear-gradient(90deg, transparent, #E5484D0D 40%, #E5484D1A 50%, #E5484D0D 60%, transparent)',
        }}
        animate={{ left: ['-15%', '110%'] }}
        transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
      />

      {/* content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}