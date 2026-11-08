import { describe, expect, it } from 'vitest';
import { blankProfile, type Profile, type RaceRecord } from './profile';
import { levelFor, rankScore, summarize, XP_PER_LEVEL } from './stats';

const race = (over: Partial<RaceRecord> = {}): RaceRecord => ({
  mode: 'free',
  from: 'Kucing',
  to: 'Gunung Fuji',
  clicks: 3,
  par: 3,
  ms: 41_200,
  rank: 'S',
  xp: 220,
  route: ['Kucing', 'Asia', 'Jepang', 'Gunung Fuji'],
  at: '2026-11-08T10:00:00.000Z',
  ...over
});

describe('levels', () => {
  it('starts at level 1 and fills by XP_PER_LEVEL', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: XP_PER_LEVEL, progress: 0, toNext: XP_PER_LEVEL });
    expect(levelFor(299)).toMatchObject({ level: 1, into: 299, toNext: 1 });
    expect(levelFor(300)).toMatchObject({ level: 2, into: 0, toNext: 300 });
    expect(levelFor(640)).toMatchObject({ level: 3, into: 40 });
  });

  it('never goes below level 1 for junk input', () => {
    expect(levelFor(-50).level).toBe(1);
  });
});

describe('rank ordering', () => {
  it('counts S as the best rank', () => {
    expect(rankScore('S')).toBeGreaterThan(rankScore('A'));
    expect(rankScore('D')).toBe(0);
  });
});

describe('summarize', () => {
  it('reports an empty profile without inventing numbers', () => {
    const dash = summarize(blankProfile());
    expect(dash).toMatchObject({ races: 0, xp: 0, bestRank: null, best: null, fastest: null, avgClicks: null, avgMs: null, topMode: null, winRate: null, totalClicks: 0 });
    expect(dash.series).toEqual([]);
    expect(dash.recent).toEqual([]);
  });

  it('derives totals, bests and the most played mode from the races', () => {
    const profile: Profile = {
      ...blankProfile(),
      xp: 610,
      races: [
        race({ rank: 'C', clicks: 9, ms: 90_000, xp: 120, at: '2026-11-01T10:00:00.000Z' }),
        race({ mode: 'trial', rank: 'S', clicks: 2, ms: 30_000, xp: 330, at: '2026-11-02T10:00:00.000Z' }),
        race({ mode: 'trial', rank: 'D', clicks: 5, ms: 120_000, xp: 20, at: '2026-11-03T10:00:00.000Z' }),
        race({ mode: 'trial', rank: 'A', clicks: 4, ms: 25_000, xp: 260, at: '2026-11-04T10:00:00.000Z' })
      ],
      inventory: [
        { id: 'mata', rarity: 'langka', at: '2026-11-01T10:00:00.000Z' },
        { id: 'waktu', rarity: 'legendaris', at: '2026-11-02T10:00:00.000Z' }
      ]
    };
    const dash = summarize(profile, 2, 2);
    expect(dash).toMatchObject({ races: 4, xp: 610, bestRank: 'S', topMode: 'trial', buffs: 2, rarest: 'legendaris', totalClicks: 20 });
    expect(dash.avgClicks).toBe(5);
    expect(dash.avgMs).toBe((90_000 + 30_000 + 120_000 + 25_000) / 4);
    expect(dash.winRate).toBe(0.75);
    expect(dash.best?.clicks).toBe(2);
    expect(dash.fastest?.ms).toBe(25_000);
    // recent is newest first, series is oldest to newest, both capped
    expect(dash.recent.map(r => r.at)).toEqual(['2026-11-04T10:00:00.000Z', '2026-11-03T10:00:00.000Z']);
    expect(dash.series.map(r => r.at)).toEqual(['2026-11-03T10:00:00.000Z', '2026-11-04T10:00:00.000Z']);
  });
});
