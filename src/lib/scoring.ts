export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

export function rankFor(clicks: number, par: number, won: boolean): Rank {
  if (!won) return 'D';
  if (clicks <= par) return 'S';
  if (clicks <= par + 1) return 'A';
  if (clicks <= par + 3) return 'B';
  return 'C';
}

export function xpFor(clicks: number, par: number, won: boolean, mult: number): number {
  if (!won) return 20;
  return Math.round((100 + Math.max(0, par + 3 - clicks) * 40) * mult);
}

/** mm:ss.d — the race clock. */
export function formatMs(ms: number): string {
  const v = Math.max(0, ms);
  const m = Math.floor(v / 60_000);
  const s = Math.floor(v / 1000) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${Math.floor(v / 100) % 10}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
