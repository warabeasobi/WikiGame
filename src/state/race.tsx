import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MODES, type Mode } from '../lib/modes';
import { RACE_BUFFS, rollChest, type BuffId, type Rarity } from '../lib/buffs';
import { bestLinks, cachedOrUndefined, estimatePar, PAR_UNKNOWN } from '../lib/race';
import { fetchPage, targetNeighbors, type WikiPage } from '../lib/wiki';
import { rankFor, xpFor, type Rank } from '../lib/scoring';
import { useProfile } from './profile';

export const LANG = 'id';
export const FREEZE_MS = 15_000;
const RACE_KEY = 'wr-race';

export interface BuffSlot {
  id: BuffId;
  rarity: Rarity;
  used: boolean;
  on: boolean;
}

export interface RaceMeta {
  mode: Mode;
  target: string;
  par: number;
  route: string[];
  clicks: number;
  neighbours: string[];
  buffs: BuffSlot[];
  hint: boolean;
  kilat: boolean;
  ramal: boolean;
  loading: boolean;
  error: string | null;
  message: string;
  running: boolean;
  done: boolean;
  won: boolean;
}

export interface ChestCard {
  id: BuffId;
  rarity: Rarity;
  taken: boolean;
}

export interface RaceResult {
  mode: Mode;
  from: string;
  to: string;
  clicks: number;
  par: number;
  ms: number;
  rank: Rank;
  xp: number;
  won: boolean;
  route: string[];
  chest: ChestCard[];
}

export interface Clock {
  elapsed: number;
  freeze: number;
  running: boolean;
}

interface RaceApi {
  meta: RaceMeta | null;
  page: WikiPage | undefined;
  result: RaceResult | null;
  clock: Clock;
  hints: string[];
  begin: (mode: Mode, from: string, to: string) => Promise<void>;
  go: (title: string) => Promise<void>;
  useBuff: (index: number) => void;
  takeCard: (index: number) => void;
  reset: () => void;
}

const RaceCtx = createContext<RaceApi | null>(null);

function emptyMeta(mode: Mode, target: string, par: number, route: string[], neighbours: string[]): RaceMeta {
  return {
    mode,
    target,
    par,
    route,
    clicks: 0,
    neighbours,
    buffs: RACE_BUFFS.map(b => ({ ...b, used: false, on: false })),
    hint: false,
    kilat: false,
    ramal: false,
    loading: false,
    error: null,
    message: `${MODES[mode].label}: dari ${route[0]} ke ${target}. Klik tautan biru.`,
    running: true,
    done: false,
    won: false
  };
}

interface Stored {
  meta: RaceMeta | null;
  clock: Clock;
  result: RaceResult | null;
}

function restore(): Stored {
  const empty: Stored = { meta: null, clock: { elapsed: 0, freeze: 0, running: false }, result: null };
  try {
    const raw = localStorage.getItem(RACE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!parsed.meta || !Array.isArray(parsed.meta.route) || typeof parsed.meta.target !== 'string') return empty;
    return {
      meta: { ...parsed.meta, loading: false, error: null },
      clock: { elapsed: parsed.clock?.elapsed ?? 0, freeze: parsed.clock?.freeze ?? 0, running: !!parsed.meta.running },
      result: parsed.result ?? null
    };
  } catch {
    return empty;
  }
}

export function RaceProvider({ children }: { children: ReactNode }) {
  const { profile, setProfile } = useProfile();
  const initial = useRef<Stored>(restore());
  const [meta, setMeta] = useState<RaceMeta | null>(initial.current.meta);
  const [clock, setClock] = useState<Clock>(initial.current.clock);
  const [result, setResult] = useState<RaceResult | null>(initial.current.result);
  const [page, setPage] = useState<WikiPage | undefined>(() => {
    const m = initial.current.meta;
    return m ? cachedOrUndefined(m.route[m.route.length - 1], LANG) : undefined;
  });

  const metaRef = useRef(meta);
  const clockRef = useRef(clock);
  const profileRef = useRef(profile);
  const resultRef = useRef(result);
  metaRef.current = meta;
  clockRef.current = clock;
  profileRef.current = profile;
  resultRef.current = result;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(RACE_KEY, JSON.stringify({ meta: metaRef.current, clock: clockRef.current, result: resultRef.current }));
    } catch {
      /* storage blocked: the race still survives in-memory navigation */
    }
  }, []);

  /* metaRef is read by the clock interval and by finish(), so it has to move with the state
   * instead of waiting for the next render. */
  const applyMeta = useCallback((next: RaceMeta | null) => {
    metaRef.current = next;
    setMeta(next);
  }, []);

  const finish = useCallback(
    (won: boolean) => {
      const m = metaRef.current;
      if (!m || m.done) return;
      const ms = clockRef.current.elapsed;
      const rank = rankFor(m.clicks, m.par, won);
      const xp = xpFor(m.clicks, m.par, won, MODES[m.mode].mult);
      const chest: ChestCard[] = rollChest(won ? 3 : 1).map(c => ({ ...c, taken: false }));
      const next: RaceMeta = {
        ...m,
        running: false,
        done: true,
        won,
        loading: false,
        error: null,
        hint: false,
        message: won ? `Sampai di ${m.target}! Rank ${rank}, +${xp} XP.` : 'Waktu habis sebelum sampai ke target.'
      };
      applyMeta(next);
      setClock(c => ({ ...c, running: false }));
      setResult({ mode: m.mode, from: m.route[0], to: m.target, clicks: m.clicks, par: m.par, ms, rank, xp, won, route: m.route, chest });
      const p = profileRef.current;
      setProfile({
        ...p,
        xp: p.xp + xp,
        races: [...p.races, { mode: m.mode, from: m.route[0], to: m.target, clicks: m.clicks, par: m.par, ms, rank, xp, route: m.route, at: new Date().toISOString() }]
      });
    },
    [applyMeta, setProfile]
  );

  const finishRef = useRef(finish);
  finishRef.current = finish;

  /* One interval for the whole app: the clock keeps running while the player walks between screens. */
  useEffect(() => {
    let last = performance.now();
    let lastPersist = 0;
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const c = clockRef.current;
      if (!c.running) return;
      if (c.freeze > 0) {
        setClock({ ...c, freeze: Math.max(0, c.freeze - dt) });
        return;
      }
      const elapsed = c.elapsed + dt;
      const limit = metaRef.current ? MODES[metaRef.current.mode].limit : undefined;
      setClock({ ...c, elapsed });
      if (limit && elapsed >= limit) {
        finishRef.current(false);
        return;
      }
      if (now - lastPersist > 1000) {
        lastPersist = now;
        persist();
      }
    }, 100);
    return () => clearInterval(id);
  }, [persist]);

  useEffect(() => {
    persist();
  }, [meta, result, persist]);

  const begin = useCallback(
    async (mode: Mode, from: string, to: string) => {
      const neighbours = await targetNeighbors(to, LANG).catch(() => new Set<string>());
      const first = await fetchPage(from, LANG);
      const par = estimatePar(first, to, neighbours);
      setResult(null);
      setPage(first);
      applyMeta(emptyMeta(mode, to, par, [first.title], [...neighbours]));
      setClock({ elapsed: 0, freeze: 0, running: true });
    },
    [applyMeta]
  );

  const go = useCallback(async (title: string) => {
    const current = metaRef.current;
    if (!current || !current.running || current.loading) return;
    const free = current.kilat;
    applyMeta({
      ...current,
      loading: true,
      error: null,
      hint: false,
      buffs: current.buffs.map(b => ({ ...b, on: false }))
    });
    try {
      const next = await fetchPage(title, LANG);
      const cur = metaRef.current;
      if (!cur) return;
      const clicks = cur.clicks + (free ? 0 : 1);
      const route = [...cur.route, next.title];
      setPage(next);
      const arrived = next.title === cur.target;
      applyMeta({
        ...cur,
        route,
        clicks,
        kilat: false,
        loading: false,
        won: arrived,
        message: arrived ? '' : `${next.title}. ${clicks} klik, par ${cur.par}.`
      });
      if (arrived) finishRef.current(true);
    } catch {
      const cur = metaRef.current;
      if (!cur) return;
      applyMeta({ ...cur, loading: false, error: `Gagal memuat “${title}”. Pilih tautan lain.` });
    }
  }, [applyMeta]);

  const useBuff = useCallback((index: number) => {
    const m = metaRef.current;
    if (!m || !m.running) return;
    const slot = m.buffs[index];
    if (!slot || slot.used) return;
    const mark = (patch: Partial<RaceMeta>, message: string) =>
      applyMeta({
        ...m,
        ...patch,
        message,
        buffs: m.buffs.map((b, i) => (i === index ? { ...b, used: true, on: true } : b))
      });
    if (slot.id === 'mata') {
      mark({ hint: true }, 'Mata Elang: tautan yang paling mendekat ke target ditandai.');
    } else if (slot.id === 'waktu') {
      setClock(c => ({ ...c, freeze: FREEZE_MS }));
      mark({}, 'Waktu Berhenti: timer berhenti 15 detik.');
    } else if (slot.id === 'kilat') {
      mark({ kilat: true }, 'Langkah Kilat: klik berikutnya dihitung 0.');
    } else if (slot.id === 'ramal') {
      mark({ ramal: true }, 'Ramalan: ringkasan artikel target dibuka.');
    } else {
      if (m.route.length < 2) {
        applyMeta({ ...m, message: 'Putar Balik: belum ada klik untuk diurungkan.' });
        return;
      }
      const route = m.route.slice(0, -1);
      const previous = cachedOrUndefined(route[route.length - 1], LANG);
      if (previous) setPage(previous);
      mark({ route, clicks: Math.max(0, m.clicks - 1), hint: false }, `Putar Balik: kembali ke ${route[route.length - 1]}.`);
    }
  }, [applyMeta]);

  const takeCard = useCallback(
    (index: number) => {
      const res = resultRef.current;
      if (!res) return;
      const card = res.chest[index];
      if (!card || card.taken) return;
      const chest = res.chest.map((c, i) => (i === index ? { ...c, taken: true } : c));
      setResult({ ...res, chest });
      const p = profileRef.current;
      setProfile({ ...p, inventory: [...p.inventory, { id: card.id, rarity: card.rarity, at: new Date().toISOString() }] });
    },
    [setProfile]
  );

  const reset = useCallback(() => {
    applyMeta(null);
    setResult(null);
    setPage(undefined);
    setClock({ elapsed: 0, freeze: 0, running: false });
  }, [applyMeta]);

  const hints = useMemo(() => {
    if (!meta?.hint || !page) return [];
    return bestLinks(page, meta.target, meta.neighbours, meta.route);
  }, [meta, page]);

  const value = useMemo<RaceApi>(
    () => ({ meta, page, result, clock, hints, begin, go, useBuff, takeCard, reset }),
    [meta, page, result, clock, hints, begin, go, useBuff, takeCard, reset]
  );

  return <RaceCtx.Provider value={value}>{children}</RaceCtx.Provider>;
}

export function useRace(): RaceApi {
  const ctx = useContext(RaceCtx);
  if (!ctx) throw new Error('useRace must be used inside RaceProvider');
  return ctx;
}

/** Kept out of the article so a 100 ms clock tick does not re-render the reading column. */
export function useClock(): Clock {
  return useRace().clock;
}

export { PAR_UNKNOWN };
