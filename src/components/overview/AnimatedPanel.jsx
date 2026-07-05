import React from 'react';

// Simple shared panel: gradient fill, border, glow shadow. No moving light, no grid overlay.
const AnimatedPanel = ({ children, className = '', glow = '#E5484D', style = {} }) => (
  <div className={`relative rounded-xl border ${className}`}
    style={{
      background: 'linear-gradient(180deg, #182030 0%, #131924 100%)',
      borderColor: '#243044',
      boxShadow: glow
        ? `0 0 0 1px ${glow}22, 0 8px 40px -12px ${glow}33, 0 12px 32px -16px rgba(0,0,0,0.6)`
        : '0 12px 32px -16px rgba(0,0,0,0.6)',
      ...style
    }}>
    {children}
  </div>
);

export default AnimatedPanel;