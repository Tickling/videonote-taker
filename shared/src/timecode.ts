export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Разбирает «12:34», «1:02:03» или «75» в секунды. */
export function parseTimecode(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}
