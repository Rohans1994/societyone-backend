// Helper functions for time slot overlap calculation (used by bookings & facility blocks)
export function parseTimeStringToMinutes(tStr: string): number {
  if (!tStr) return 0;
  tStr = tStr.trim();
  const match = tStr.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function parseSlotRange(slot: string): { start: number; end: number } {
  if (!slot) return { start: 0, end: 60 };
  const parts = slot.split(/[-–—to]+/i);
  if (parts.length >= 2) {
    const s = parseTimeStringToMinutes(parts[0]);
    const e = parseTimeStringToMinutes(parts[1]);
    return {
      start: s,
      end: e > s ? e : s + 60
    };
  }
  const s = parseTimeStringToMinutes(slot);
  return { start: s, end: s + 60 };
}

export function doTimeRangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return Math.max(start1, start2) < Math.min(end1, end2);
}
