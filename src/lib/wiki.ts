export type WikiLang = string; // default 'id'

export interface WikiSuggestion { title: string; desc: string; img: string }
export interface WikiResolved { title: string; desc: string; disambig?: boolean }
export interface WikiPage {
  title: string;
  html: string;
  links: string[];
  img: string;
  alt: string;
  info: Array<[string, string]>;
  cached?: boolean;
}

const BASE = (lang: WikiLang) => `https://${lang}.wikipedia.org`;

const NS_RE =
  /^(Berkas|File|Kategori|Category|Templat|Template|Bantuan|Help|Wikipedia|Istimewa|Special|Portal|Pembicaraan|Talk|Pengguna|User|Modul|Module|MediaWiki|Lampiran|Draft|Rancangan)(_| )?[^:]*:/i;

const STOP_H =
  /^(Lihat pula|Referensi|Catatan kaki|Pranala luar|Daftar pustaka|Bacaan lanjutan|Catatan|Rujukan|Bibliografi)/i;

export function normalizeTitle(raw: string): string {
  let t = raw;
  try {
    t = decodeURIComponent(t);
  } catch {
    // keep the raw string when percent-decoding fails
  }
  return t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isNamespaceTitle(title: string): boolean {
  return NS_RE.test(title);
}

type Parsed = { html: string; links: string[]; title: string };

const DROP_SEL =
  'sup, .mw-ref, .reference, .mw-editsection, style, script, .noprint, .IPA-label, .mw-empty-elt, [typeof~="mw:Extension/ref"], .hatnote, math, .mwe-math-element';
const KEEP = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE']);
const KNOWN = /^(A|SPAN|B|I|EM|STRONG|SUP|SUB|LI|UL|OL|P|BLOCKQUOTE|H4|BR)$/;

export function parseArticleHtml(html: string, _lang: WikiLang = 'id'): Parsed {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.querySelector('title')?.textContent?.trim() || '';
  const out = doc.createElement('div');
  const links = new Set<string>();
  let stop = false;

  const clean = (node: Element) => {
    for (const el of [...node.querySelectorAll(DROP_SEL)]) el.remove();
    for (const a of [...node.querySelectorAll('a')]) {
      const href = a.getAttribute('href') || '';
      const rel = a.getAttribute('rel') || '';
      let kept = false;
      if (
        rel.includes('mw:WikiLink') &&
        !rel.includes('Interwiki') &&
        href.startsWith('./') &&
        !a.classList.contains('new')
      ) {
        const t = normalizeTitle(href.slice(2).split('#')[0]);
        if (t && !NS_RE.test(t)) {
          links.add(t);
          const l = doc.createElement('a');
          l.className = 'wr-link';
          l.setAttribute('href', '#');
          l.setAttribute('data-to', t);
          l.textContent = a.textContent;
          a.replaceWith(l);
          kept = true;
        }
      }
      if (!kept) {
        const span = doc.createElement('span');
        span.className = 'wr-dead';
        span.textContent = a.textContent;
        a.replaceWith(span);
      }
    }
    for (const el of [...node.querySelectorAll('*')]) {
      for (const at of [...el.attributes]) {
        if (at.name !== 'class' && at.name !== 'href' && at.name !== 'data-to') el.removeAttribute(at.name);
      }
    }
    for (const el of [...node.querySelectorAll('*')]) {
      if (!KNOWN.test(el.tagName)) {
        if ((el.textContent || '').trim()) el.replaceWith(...el.childNodes);
        else el.remove();
      }
    }
  };

  for (const sec of [...doc.querySelectorAll('body > section')]) {
    for (const ch of [...sec.children]) {
      if (/^H[2-4]$/.test(ch.tagName) && STOP_H.test((ch.textContent || '').trim())) {
        stop = true;
        break;
      }
      if (!KEEP.has(ch.tagName) || ch.closest('table, figure')) continue;
      const c = ch.cloneNode(true) as Element;
      clean(c);
      if (/^H[2-4]$/.test(c.tagName)) {
        const h = doc.createElement('h4');
        h.textContent = c.textContent;
        out.append(h);
        continue;
      }
      if ((c.textContent || '').trim()) out.append(c);
    }
    if (stop) break;
  }

  return { html: out.innerHTML, links: [...links], title };
}

async function wikiApi(lang: WikiLang, params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  const r = await fetch(`${BASE(lang)}/w/api.php?${qs}`);
  if (!r.ok) throw new Error(`Wikipedia API error ${r.status}`);
  return r.json() as Promise<Record<string, unknown>>;
}

type ApiPage = {
  title?: string;
  missing?: boolean;
  index?: number;
  description?: string;
  thumbnail?: { source?: string };
  pageprops?: Record<string, string>;
  links?: Array<{ title?: string }>;
};

function queryPages(d: Record<string, unknown>): ApiPage[] {
  const q = d.query as { pages?: ApiPage[] } | undefined;
  return q?.pages ?? [];
}

export async function searchTitles(q: string, lang: WikiLang = 'id', limit = 6): Promise<WikiSuggestion[]> {
  const d = await wikiApi(lang, {
    action: 'query',
    generator: 'prefixsearch',
    gpssearch: q,
    gpslimit: String(limit),
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '80',
    redirects: '1',
  });
  return queryPages(d)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({ title: p.title ?? '', desc: p.description ?? '', img: p.thumbnail?.source ?? '' }));
}

export async function resolveTitle(q: string, lang: WikiLang = 'id'): Promise<WikiResolved | null> {
  const d = await wikiApi(lang, {
    action: 'query',
    titles: q,
    redirects: '1',
    prop: 'pageprops|description',
    ppprop: 'disambiguation',
  });
  const p = queryPages(d)[0];
  if (!p || p.missing) return null;
  if (p.pageprops && 'disambiguation' in p.pageprops) {
    return { title: p.title ?? '', desc: '', disambig: true };
  }
  return { title: p.title ?? '', desc: p.description ?? '' };
}

export async function randomTitles(n: number, lang: WikiLang = 'id'): Promise<string[]> {
  const d = await wikiApi(lang, {
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: String(n),
    rnminsize: '12000',
    rnfilterredir: 'nonredirects',
  });
  const q = d.query as { random?: Array<{ title?: string }> } | undefined;
  return (q?.random ?? []).map((r) => r.title ?? '').filter(Boolean);
}

const pageCache = new Map<string, WikiPage>();

export function clearPageCache(): void {
  pageCache.clear();
}

export async function fetchPage(title: string, lang: WikiLang = 'id'): Promise<WikiPage> {
  const key = `${lang}:${normalizeTitle(title)}`;
  const hit = pageCache.get(key);
  if (hit) return { ...hit, cached: true };
  const [res, meta] = await Promise.all([
    fetch(`${BASE(lang)}/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`),
    wikiApi(lang, {
      action: 'query',
      titles: title,
      redirects: '1',
      prop: 'pageimages|description',
      piprop: 'thumbnail',
      pithumbsize: '330',
    }).catch(() => null),
  ]);
  if (!res.ok) throw new Error('Artikel tidak ditemukan');
  const body = await res.text();
  const { html, links, title: real } = parseArticleHtml(body, lang);
  const page = queryPages((meta ?? {}) as Record<string, unknown>)[0];
  const out: WikiPage = {
    title: real || title,
    html: html || '<p>Artikel ini tidak punya teks yang bisa dibaca.</p>',
    links,
    img: page?.thumbnail?.source ?? '',
    alt: real || title,
    info: page?.description ? [['Deskripsi', page.description]] : [],
  };
  pageCache.set(key, out);
  return out;
}

export function getCachedPage(title: string, lang: WikiLang = 'id'): WikiPage | undefined {
  return pageCache.get(`${lang}:${normalizeTitle(title)}`);
}

export async function targetNeighbors(title: string, lang: WikiLang = 'id'): Promise<Set<string>> {
  try {
    const d = await wikiApi(lang, {
      action: 'query',
      titles: title,
      redirects: '1',
      prop: 'links',
      plnamespace: '0',
      pllimit: 'max',
    });
    return new Set(queryPages(d)[0]?.links?.map((l) => l.title ?? '') ?? []);
  } catch {
    return new Set();
  }
}
