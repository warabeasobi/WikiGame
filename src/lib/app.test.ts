import { describe, expect, it } from 'vitest';
import { rollChest, RACE_BUFFS } from './buffs';
import { blankProfile, normalizeProfile, parseProfileFile, profileSummary } from './profile';
import { bestLinks, estimatePar, PAR_UNKNOWN } from './race';
import { formatMs, rankFor, xpFor } from './scoring';
import type { WikiPage } from './wiki';

const page = (title: string, links: string[]): WikiPage => ({ title, html: '', links, img: '', alt: title, info: [] });

describe('scoring', () => {
  it('ranks a win against par', () => {
    expect(rankFor(3, 3, true)).toBe('S');
    expect(rankFor(4, 3, true)).toBe('A');
    expect(rankFor(6, 3, true)).toBe('B');
    expect(rankFor(9, 3, true)).toBe('C');
    expect(rankFor(2, 3, false)).toBe('D');
  });

  it('scales XP by the mode multiplier and floors a loss', () => {
    expect(xpFor(3, 3, true, 1)).toBe(220);
    expect(xpFor(3, 3, true, 1.5)).toBe(330);
    expect(xpFor(1, 4, true, 1)).toBe(340);
    expect(xpFor(1, 4, false, 1.5)).toBe(20);
  });

  it('formats the clock as mm:ss.d', () => {
    expect(formatMs(0)).toBe('00:00.0');
    expect(formatMs(41_200)).toBe('00:41.2');
    expect(formatMs(125_900)).toBe('02:05.9');
    expect(formatMs(-5)).toBe('00:00.0');
  });
});

describe('buff chest', () => {
  it('never repeats a buff and keeps the race bar to three slots', () => {
    const chest = rollChest(3, () => 0.5);
    expect(new Set(chest.map(c => c.id)).size).toBe(3);
    expect(chest.every(c => c.rarity === 'langka')).toBe(true);
    expect(RACE_BUFFS.map(b => b.id)).toEqual(['mata', 'waktu', 'balik']);
  });
});

describe('profile files', () => {
  it('rejects a file that is not a profile', () => {
    expect(() => parseProfileFile('{oops')).toThrow(/JSON/);
    expect(() => parseProfileFile('{"name":1}')).toThrow(/profil WikiRace/);
  });

  it('keeps valid entries and drops junk from an imported profile', () => {
    const imported = normalizeProfile({
      name: 'Sari',
      xp: 120,
      races: [{ mode: 'free', from: 'Kucing', to: 'Gunung Fuji', clicks: 3, par: 3, ms: 41_200, rank: 'S', xp: 340, route: ['Kucing'], at: '2026-11-08T00:00:00.000Z' }, { mode: 'nope' }],
      inventory: [{ id: 'mata', rarity: 'langka', at: '2026-11-08T00:00:00.000Z' }, { id: 'bogus' }]
    });
    expect(imported.name).toBe('Sari');
    expect(imported.races).toHaveLength(1);
    expect(imported.inventory).toHaveLength(1);
    expect(profileSummary(imported)).toBe('120 XP · 1 balapan · tas 1 buff');
  });

  it('starts a fresh profile as a guest', () => {
    expect(blankProfile()).toEqual({ name: 'Tamu', xp: 0, races: [], inventory: [] });
  });
});

describe('route helpers', () => {
  const target = 'Gunung Fuji';
  const neighbours = ['Jepang', 'Honshu'];

  it('calls a one-hop or two-hop par', () => {
    expect(estimatePar(page('Kucing', ['Asia']), 'Asia', [])).toBe(1);
    expect(estimatePar(page('Asia', ['Jepang']), target, neighbours)).toBe(2);
    expect(estimatePar(page('Asia', ['Eropa']), target, neighbours)).toBe(PAR_UNKNOWN);
    expect(estimatePar(undefined, target, neighbours)).toBe(PAR_UNKNOWN);
  });

  it('marks the target, then the target neighbours, and never revisits', () => {
    const current = page('Asia', ['Jepang', target, 'Eropa', 'Kucing']);
    expect(bestLinks(current, target, neighbours, ['Kucing', 'Asia'])).toEqual([target, 'Jepang']);
    expect(bestLinks(page('Asia', ['Eropa', 'Kucing']), target, neighbours, ['Kucing', 'Asia'])).toEqual([]);
  });
});
