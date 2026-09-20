/* storage/leaderboard.js — local leaderboard plus a clean adapter interface so
 * an online backend can be plugged in later without touching the UI.
 *
 *   const lb = new Leaderboard({ adapter: new LocalLeaderboardAdapter() });
 *   await lb.submit(entry); await lb.top({ mode: 'daily' });
 *
 * A future adapter only has to implement: submit(entry), top(query), and
 * optionally remove(entryId). Nothing else in the game knows where the data
 * comes from.
 */

import { Doc, KEYS } from '../core/store.js';
import { uid, titleKey } from '../core/util.js';

const DEFAULTS = { entries: [] };
let doc = null;

/* ------------------------------------------------------------------ */
/* Adapters                                                           */
/* ------------------------------------------------------------------ */

export class LocalLeaderboardAdapter {
  constructor(store) { this.store = store; this.id = 'local'; }

  async submit(entry) {
    const d = this.store();
    d.entries.unshift(entry);
    d.entries = d.entries.slice(0, 500);
    return entry;
  }

  async top({ mode = null, lang = null, difficulty = null, sort = 'score', limit = 25, challengeKey = null } = {}) {
    const d = this.store();
    let list = d.entries.slice();
    if (mode) list = list.filter((e) => e.mode === mode);
    if (lang) list = list.filter((e) => e.lang === lang);
    if (difficulty) list = list.filter((e) => e.difficulty === difficulty);
    if (challengeKey) list = list.filter((e) => e.challengeKey === challengeKey);
    list.sort((a, b) => {
      if (sort === 'time') return a.elapsedMs - b.elapsedMs;
      if (sort === 'clicks') return a.clicks - b.clicks || a.elapsedMs - b.elapsedMs;
      return b.score - a.score || a.elapsedMs - b.elapsedMs;
    });
    return list.slice(0, limit);
  }

  async remove(entryId) {
    const d = this.store();
    d.entries = d.entries.filter((e) => e.id !== entryId);
  }

  async clear() {
    const d = this.store();
    d.entries = [];
  }
}

/**
 * Skeleton for a future HTTP backend. It documents the contract without
 * shipping any fake data: calling it throws until a real endpoint is set.
 */
export class RemoteLeaderboardAdapter {
  constructor({ baseUrl = '', apiKey = '', fetchImpl = null } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    this.id = 'remote';
  }

  get available() { return Boolean(this.baseUrl && this.fetch); }

  async submit(entry) {
    if (!this.available) throw new Error('Remote leaderboard is not configured');
    const res = await this.fetch(`${this.baseUrl}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`Leaderboard submit failed: ${res.status}`);
    return res.json();
  }

  async top(query = {}) {
    if (!this.available) throw new Error('Remote leaderboard is not configured');
    const qs = new URLSearchParams(query).toString();
    const res = await this.fetch(`${this.baseUrl}/scores?${qs}`);
    if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
    return res.json();
  }
}

/* ------------------------------------------------------------------ */
/* Facade                                                             */
/* ------------------------------------------------------------------ */

export const Leaderboard = {
  init() {
    doc = new Doc(KEYS.leaderboard, DEFAULTS, { version: 1 });
    this.local = new LocalLeaderboardAdapter(() => doc.data);
    this.adapter = this.local;
    this.remote = new RemoteLeaderboardAdapter();
    return doc.data;
  },

  /** Swap in a remote adapter later: `Leaderboard.useAdapter(new Remote...())`. */
  useAdapter(adapter) { this.adapter = adapter; },
  useLocalAdapter() { this.adapter = this.local; },
  get onlineAvailable() { return Boolean(this.remote && this.remote.available); },

  entryFromRun(run, { playerName = 'You', challengeKey = null } = {}) {
    return {
      id: uid('lb'),
      ts: run.ts || Date.now(),
      player: playerName,
      mode: run.mode,
      lang: run.lang,
      difficulty: run.difficulty,
      start: run.start,
      target: run.target,
      clicks: run.clicks,
      elapsedMs: run.elapsedMs,
      score: run.score,
      stars: run.stars,
      hintsUsed: run.hintsUsed,
      powerupsUsed: run.powerupsUsed,
      challengeKey: challengeKey || `${run.lang}:${titleKey(run.start)}->${titleKey(run.target)}`,
      runId: run.id,
    };
  },

  async submit(entry) {
    try {
      return await this.adapter.submit(entry);
    } catch (err) {
      console.warn('[leaderboard] submit failed, keeping it local', err);
      return this.local.submit(entry);
    }
  },

  async top(query) {
    try {
      return await this.adapter.top(query);
    } catch (err) {
      console.warn('[leaderboard] top() failed, falling back to local', err);
      return this.local.top(query);
    }
  },

  async remove(entryId) { return this.adapter.remove(entryId); },
  async clear() {
    await this.local.clear();
    doc.save();
  },

  all() { return doc.data.entries; },
  count() { return doc.data.entries.length; },

  rankOf(entry) {
    const list = doc.data.entries
      .filter((e) => e.mode === entry.mode && e.lang === entry.lang)
      .sort((a, b) => b.score - a.score);
    const idx = list.findIndex((e) => e.id === entry.id);
    return idx === -1 ? null : idx + 1;
  },

  export() { return JSON.parse(JSON.stringify(doc.data)); },
  import(data) {
    doc.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(data || {}) };
    doc.save();
  },
};
