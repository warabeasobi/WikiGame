export type BuffId = 'mata' | 'waktu' | 'balik' | 'ramal' | 'kilat';
export type Rarity = 'biasa' | 'langka' | 'epik' | 'legendaris';

export interface BuffDef {
  ico: string;
  name: string;
  desc: string;
}

export const BUFFS: Record<BuffId, BuffDef> = {
  mata: { ico: '👁', name: 'Mata Elang', desc: 'Menandai 2 tautan terbaik di artikel ini.' },
  waktu: { ico: '⏸️', name: 'Waktu Berhenti', desc: 'Timer berhenti 15 detik.' },
  balik: { ico: '⏪', name: 'Putar Balik', desc: 'Urungkan klik terakhir.' },
  ramal: { ico: '🔮', name: 'Ramalan', desc: 'Menampilkan ringkasan artikel target.' },
  kilat: { ico: '⚡', name: 'Langkah Kilat', desc: 'Klik berikutnya dihitung 0.' }
};

export const BUFF_IDS = Object.keys(BUFFS) as BuffId[];
export const isBuffId = (v: unknown): v is BuffId => typeof v === 'string' && v in BUFFS;

export const RARITY_LABEL: Record<Rarity, string> = {
  biasa: 'Biasa',
  langka: 'Langka',
  epik: 'Epik',
  legendaris: 'Legendaris'
};

export const RARITY_ORDER: Rarity[] = ['biasa', 'langka', 'epik', 'legendaris'];
export const isRarity = (v: unknown): v is Rarity => typeof v === 'string' && RARITY_ORDER.includes(v as Rarity);

/** The three buffs on the race bar, in slot order (keys 1, 2, 3). */
export const RACE_BUFFS: Array<{ id: BuffId; rarity: Rarity }> = [
  { id: 'mata', rarity: 'langka' },
  { id: 'waktu', rarity: 'epik' },
  { id: 'balik', rarity: 'biasa' }
];

export function rollChest(size = 3, rand: () => number = Math.random): Array<{ id: BuffId; rarity: Rarity }> {
  const ids = [...BUFF_IDS].sort(() => rand() - 0.5).slice(0, size);
  return ids.map(id => {
    const r = rand();
    return { id, rarity: r < 0.08 ? 'legendaris' : r < 0.3 ? 'epik' : r < 0.62 ? 'langka' : 'biasa' };
  });
}
