export type Mode = 'free' | 'trial' | 'random';

export interface ModeDef {
  id: Mode;
  label: string;
  blurb: string;
  cta: string;
  /** XP multiplier applied to the race reward. */
  mult: number;
  /** Countdown in ms; absent means no time limit. */
  limit?: number;
  stats: Array<[string, string]>;
}

export const MODES: Record<Mode, ModeDef> = {
  free: {
    id: 'free',
    label: 'Free run',
    blurb: 'Ketik sendiri artikel awal dan tujuan, lalu jelajahi tanpa batas waktu.',
    cta: 'Main Free run',
    mult: 1,
    stats: [['Batas waktu', 'Tanpa'], ['XP', '×1,0']]
  },
  trial: {
    id: 'trial',
    label: 'Time trial',
    blurb: 'Dua menit untuk jalur terpendek. Waktu habis, balapan selesai.',
    cta: 'Main Time trial',
    mult: 1.5,
    limit: 120_000,
    stats: [['Batas waktu', '2 menit'], ['XP', '×1,5']]
  },
  random: {
    id: 'random',
    label: 'Random',
    blurb: 'Awal dan tujuan diambil acak dari seluruh Wikipedia bahasa Indonesia.',
    cta: 'Main Random',
    mult: 1.25,
    stats: [['Titik mulai', 'Acak'], ['XP', '×1,25']]
  }
};

export const MODE_LIST: ModeDef[] = [MODES.free, MODES.trial, MODES.random];

export const isMode = (v: unknown): v is Mode => v === 'free' || v === 'trial' || v === 'random';
