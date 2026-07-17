import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';

// Live system clock rendered in the app's operating timezone (America/Regina).
// Shows the current time plus the zone abbreviation and offset, e.g. "CST -06:00".
export default function SystemClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = formatInTimeZone(now, APP_TZ, 'HH:mm:ss');
  // e.g. "CST" and "-06:00"
  const abbr = formatInTimeZone(now, APP_TZ, 'zzz');
  const offset = formatInTimeZone(now, APP_TZ, 'xxx');

  return (
    <div className="flex items-center gap-2 px-1 text-muted-foreground">
      <Clock className="w-3 h-3 shrink-0" />
      <span className="font-mono text-[11px] font-medium text-foreground tabular-nums">{time}</span>
      <span className="font-mono text-[11px]">{abbr} {offset}</span>
    </div>
  );
}