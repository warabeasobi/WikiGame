import { RARITY_ORDER, type Rarity } from './buffs';
import type { Mode } from './modes';
import type { Profile, RaceRecord } from './profile';
import type { Rank } from './scoring';

export const XP_PER_LEVEL = 300;

/** Ascending quality: a later entry beats an earlier one. */
export const RANK_LADDER: Rank[] = ['D', 'C', 'B', 'A', 'S'];

export interface Level {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP one level is worth. */
  span: number;
  /** 0 to 1, for the meter. */
  progress: number;
  toNext: number;
}

export function levelFor(xp: number): Level {
  const safe = Math.max(0, Math.floor(xp));
  const level = Math.floor(safe / XP_PER_LEVEL) + 1;
  const into = safe % XP_PER_LEVEL;
  return { level, into, span: XP_PER_LEVEL, progress: into / XP_PER_LEVEL, toNext: XP_PER_LEVEL - into };
}

export const rankScore = (rank: Rank): number => RANK_LADDER.indexOf(rank);

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export interface Dashboard {
  races: number;
  xp: number;
  level: Level;
  /** Share of races that were not a loss, 0 to 1. */
  winRate: number | null;
  bestRank: Rank | null;
  best: RaceRecord | null;
  fastest: RaceRecord | null;
  totalClicks: number;
  avgClicks: number | null;
  avgMs: number | null;
  topMode: Mode | null;
  buffs: number;
  rarest: Rarity | null;
  /** Newest first. */
  recent: RaceRecord[];
  /** Oldest to newest, capped, for the chart. */
  series: RaceRecord[];
}

export function summarize(profile: Profile, seriesLength = 12, recentLength = 10): Dashboard {
  const races = profile.races;
  const wins = races.filter(r => r.rank !== 'D');
  const counts = new Map<Mode, number>();
  for (const race of races) counts.set(race.mode, (counts.get(race.mode) ?? 0) + 1);
  const topMode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const rarest = profile.inventory.reduce<Rarity | null>(
    (best, item) => (best === null || RARITY_ORDER.indexOf(item.rarity) > RARITY_ORDER.indexOf(best) ? item.rarity : best),
    null
  );
  const ranked = [...races].sort((a, b) => rankScore(b.rank) - rankScore(a.rank) || a.clicks - b.clicks);

  return {
    races: races.length,
    xp: profile.xp,
    level: levelFor(profile.xp),
    winRate: races.length ? wins.length / races.length : null,
    bestRank: races.length ? RANK_LADDER[Math.max(...races.map(r => rankScore(r.rank)))] : null,
    best: ranked[0] ?? null,
    fastest: races.length ? races.reduce((a, b) => (b.ms < a.ms ? b : a)) : null,
    totalClicks: races.reduce((sum, race) => sum + race.clicks, 0),
    avgClicks: mean(races.map(r => r.clicks)),
    avgMs: mean(races.map(r => r.ms)),
    topMode,
    buffs: profile.inventory.length,
    rarest,
    recent: [...races].reverse().slice(0, recentLength),
    series: races.slice(-seriesLength)
  };
}
