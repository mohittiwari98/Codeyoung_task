// All time zone logic lives here. Luxon + IANA zones handle DST; never add hours by hand.
import { DateTime } from 'luxon';

export const isValidZone = (z) => typeof z === 'string' && DateTime.local().setZone(z).isValid;

export function abbr(dt) {
  // Browsers may report India as the older IANA name 'Asia/Calcutta'; same zone, so same label.
  if (dt.zoneName === 'Asia/Kolkata' || dt.zoneName === 'Asia/Calcutta') return 'IST';
  if (dt.zoneName === 'Europe/London') return dt.offset === 0 ? 'GMT' : 'BST';
  return dt.offsetNameShort; // EDT, EST, PST...
}

export const at = (ms, zone) => DateTime.fromMillis(ms, { zone });

export function fmt(ms, zone) {
  const dt = at(ms, zone);
  return `${dt.toFormat('ccc, d LLL yyyy, h:mm a')} ${abbr(dt)}`;
}

export const timeLabel = (ms, zone) => at(ms, zone).toFormat('h:mm a');

// [start, end) of a calendar day in `zone`, in UTC ms. Day length is 23/24/25h around DST changes.
export function dayRangeMs(date, zone) {
  const s = DateTime.fromISO(date, { zone }).startOf('day');
  return [s.toMillis(), s.plus({ days: 1 }).toMillis()];
    }
