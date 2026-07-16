// Shared lead timestamp formatting. Every lead timestamp in the app renders in
// APP_TZ (America/Regina, Saskatchewan, fixed) so a lead stored at Jul 16 23:59
// UTC shows as Jul 16 17:59, matching how reportMetrics buckets by day.
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TZ } from '@/lib/periodRange';

// Format an ISO / date value in APP_TZ. Returns '-' for empty or invalid input.
export function formatLeadTime(value, pattern = 'MMM d, yyyy HH:mm') {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return formatInTimeZone(d, APP_TZ, pattern);
}