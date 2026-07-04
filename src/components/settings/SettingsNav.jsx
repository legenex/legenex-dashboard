import React from 'react';

export default function SettingsNav({ groups, active, onSelect }) {
  return (
    <nav className="w-[210px] shrink-0">
      <div className="space-y-5 sticky top-0">
        {groups.map(g => (
          <div key={g.group}>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1.5">{g.group}</div>
            <div className="space-y-0.5">
              {g.items.map(item => (
                <button
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${active === item.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}