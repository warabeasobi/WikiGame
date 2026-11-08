import { isBuffId, isRarity, type BuffId, type Rarity } from './buffs';
import { isMode, type Mode } from './modes';
import type { Rank } from './scoring';

export interface RaceRecord {
  mode: Mode;
  from: string;
  to: string;
  clicks: number;
  par: number;
  ms: number;
  rank: Rank;
  xp: number;
  route: string[];
  at: string;
}

export interface InventoryItem {
  id: BuffId;
  rarity: Rarity;
  at: string;
}

export interface Profile {
  name: string;
  xp: number;
  races: RaceRecord[];
  inventory: InventoryItem[];
}

export const PROFILE_KEY = 'wr-profile';
export const NAME_MAX = 24;

export function blankProfile(): Profile {
  return { name: 'Tamu', xp: 0, races: [], inventory: [] };
}

/** Unknown fields are dropped, so an edited file cannot smuggle junk into state. */
export function normalizeProfile(raw: unknown): Profile {
  const base = blankProfile();
  if (!raw || typeof raw !== 'object') throw new Error('bentuk');
  const p = raw as Record<string, unknown>;
  if (typeof p.name !== 'string' || !Array.isArray(p.races) || !Array.isArray(p.inventory) || typeof p.xp !== 'number') {
    throw new Error('bentuk');
  }
  const races = p.races.filter((r): r is RaceRecord => {
    const x = r as Partial<RaceRecord>;
    return !!x && isMode(x.mode) && typeof x.from === 'string' && typeof x.to === 'string' && typeof x.clicks === 'number'
      && typeof x.par === 'number' && typeof x.ms === 'number' && typeof x.at === 'string' && Array.isArray(x.route);
  });
  const inventory = p.inventory.filter((i): i is InventoryItem => {
    const x = i as Partial<InventoryItem>;
    return !!x && isBuffId(x.id) && isRarity(x.rarity) && typeof x.at === 'string';
  });
  return { ...base, name: p.name.slice(0, NAME_MAX), xp: p.xp, races, inventory };
}

export function parseProfileFile(text: string): Profile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File itu bukan JSON yang valid.');
  }
  try {
    return normalizeProfile(parsed);
  } catch {
    throw new Error('File itu bukan profil WikiRace yang valid. Pilih file .json hasil ekspor.');
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return blankProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return blankProfile();
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* storage full or blocked: the session still works, it just will not persist */
  }
}

export function profileSummary(profile: Profile): string {
  const buffs = profile.inventory.length;
  const races = profile.races.length;
  return `${profile.xp} XP · ${races} balapan · tas ${buffs} buff`;
}

export function downloadProfile(profile: Profile): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'wikirace-profil.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
