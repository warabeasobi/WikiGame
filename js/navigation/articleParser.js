/* navigation/articleParser.js — turns Wikipedia's parse HTML into safe,
 * game-ready DOM.
 *
 * Security: retrieved article HTML is external content. We strip scripts,
 * event handlers, frames, forms and other active content, drop dangerous URLs
 * and never use innerHTML with unsanitised data.
 */

import { normalizeTitle, titleSlug } from '../core/util.js';

export const BLOCKED_NAMESPACES = [
  'special', 'file', 'image', 'category', 'template', 'help', 'talk', 'user',
  'wikipedia', 'portal', 'mediawiki', 'module', 'draft', 'book', 'timedtext',
  'wikipedia talk', 'template talk', 'category talk', 'file talk', 'help talk',
  'user talk', 'portal talk', 'mediawiki talk', 'module talk',
  // Indonesian
  'istimewa', 'berkas', 'kategori', 'templat', 'bantuan', 'pembicaraan', 'pengguna',
  'pembicaraan pengguna', 'pembicaraan berkas', 'pembicaraan templat', 'pembicaraan bantuan',
  'pembicaraan kategori', 'pembicaraan portal',
  // Japanese
  '特別', 'ファイル', 'カテゴリ', 'テンプレート', 'ヘルプ', 'ノート', '利用者', '利用者‐会話', 'wikipedia',
  // German
  'spezial', 'datei', 'kategorie', 'vorlage', 'hilfe', 'diskussion', 'benutzer', 'wikipedia',
  // French
  'spécial', 'fichier', 'catégorie', 'modèle', 'aide', 'discussion', 'utilisateur', 'portail', 'wikipedia',
  // Spanish
  'especial', 'archivo', 'categoría', 'plantilla', 'ayuda', 'discusión', 'usuario', 'portal', 'wikipedia',
];

const BLOCKED_PREFIX_RE = new RegExp(`^(${BLOCKED_NAMESPACES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'i');

/** Namespaces such as Special:/File: are not articles and never count as moves. */
export function isBlockedNamespace(title) {
  const t = String(title || '').trim();
  if (!t) return true;
  if (t.startsWith('#')) return true;
  return BLOCKED_PREFIX_RE.test(t);
}

export function parseWikiHref(href, lang = 'en') {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return null;

  // Absolute link to the same language wiki, or protocol-relative.
  let path = null;
  let otherLang = null;
  const abs = raw.match(/^(?:https?:)?\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/(.+)$/i);
  if (abs) {
    otherLang = abs[1].toLowerCase();
    path = abs[2];
  } else if (raw.startsWith('/wiki/')) {
    path = raw.slice('/wiki/'.length);
  } else if (raw.startsWith('./') || /^[^:/?#]+$/.test(raw)) {
    return null; // relative non-wiki link
  } else {
    return null;
  }
  if (!path) return null;
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep raw */ }
  const hashIdx = decoded.indexOf('#');
  const fragment = hashIdx >= 0 ? decoded.slice(hashIdx + 1) : null;
  if (hashIdx >= 0) decoded = decoded.slice(0, hashIdx);
  if (!decoded) return null;
  const title = normalizeTitle(decoded);
  if (!title) return null;
  return {
    title,
    fragment,
    lang: otherLang && otherLang !== lang ? otherLang : null,
    sameLang: !otherLang || otherLang === lang,
    blocked: isBlockedNamespace(title),
    url: `https://${otherLang || lang}.wikipedia.org/wiki/${titleSlug(title)}`,
  };
}

const DANGEROUS_TAGS = ['script', 'style', 'link', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'form', 'input', 'button', 'select', 'textarea', 'base', 'meta', 'noscript', 'template', 'audio',
  'video', 'source', 'track', 'svg', 'math', 'canvas', 'dialog', 'slot'];

const DROP_SELECTORS = [
  '.mw-editsection', '.mw-empty-elt', '#toc', '.toc', '.mw-jump-link', '.mw-indicators',
  '.mw-cite-backlink', '.noprint .navbox', '.sistersitebox', '.mw-kartographer-maplink',
  '.mw-parser-output > .mw-empty-elt', '.reference-accessdate > .nowrap',
  '.hatnote.navigation-not-searchable', '.mw-references-columns > .mw-cite-backlink',
  'style', 'script', 'link', 'meta',
];

const URL_ATTRS = ['href', 'src', 'srcset', 'poster', 'action', 'formaction', 'xlink:href', 'data-src'];

function sanitizeUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^(javascript|vbscript|data:text\/html)/i.test(v)) return '';
  if (/^data:/i.test(v)) return ''; // no inline data payloads from external content
  if (v.startsWith('//')) return `https:${v}`;
  if (/^http:\/\/upload\.wikimedia\.org/i.test(v)) return v.replace(/^http:/i, 'https:');
  return v;
}

/** Removes active content + event handlers from a live DOM subtree. */
export function sanitizeTree(root) {
  for (const tag of DANGEROUS_TAGS) {
    for (const node of Array.from(root.querySelectorAll(tag))) node.remove();
  }
  for (const sel of DROP_SELECTORS) {
    try { for (const node of Array.from(root.querySelectorAll(sel))) node.remove(); } catch { /* invalid selector */ }
  }
  const walker = root.querySelectorAll('*');
  for (const node of walker) {
    for (const attr of Array.from(node.attributes || [])) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { node.removeAttribute(attr.name); continue; }
      if (name === 'srcdoc' || name === 'formaction' || name === 'ping') { node.removeAttribute(attr.name); continue; }
      if (name === 'style') {
        const v = attr.value || '';
        if (/expression\(|javascript:|behavior\s*:|@import|url\(\s*['"]?\s*(?:https?:)?\/\//i.test(v)) node.removeAttribute('style');
        continue;
      }
      if (URL_ATTRS.includes(name)) {
        if (name === 'srcset') {
          const cleaned = String(attr.value || '')
            .split(',')
            .map((part) => {
              const [u, d] = part.trim().split(/\s+/);
              const safe = sanitizeUrl(u);
              return safe ? `${safe}${d ? ` ${d}` : ''}` : null;
            })
            .filter(Boolean)
            .join(', ');
          if (cleaned) node.setAttribute('srcset', cleaned); else node.removeAttribute('srcset');
          continue;
        }
        const safe = sanitizeUrl(attr.value);
        if (safe) node.setAttribute(name, safe); else node.removeAttribute(name);
      }
    }
    // Make media inert & lazy.
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
      node.setAttribute('referrerpolicy', 'no-referrer');
      if (!node.getAttribute('alt')) node.setAttribute('alt', '');
    }
  }
  return root;
}

/**
 * Parses article HTML into a sanitised DocumentFragment plus link metadata.
 * @returns {{fragment: DocumentFragment, links: Array, blockedCount: number, imageCount: number, headings: Array}}
 */
export function parseArticleHtml(html, { lang = 'en', doc = document } = {}) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html || '');
  const root = tpl.content;
  sanitizeTree(root);

  const links = [];
  let blockedCount = 0;

  for (const anchor of Array.from(root.querySelectorAll('a'))) {
    const parsed = parseWikiHref(anchor.getAttribute('href'), lang);
    if (!parsed) {
      const href = anchor.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
        anchor.classList.add('wsr-external');
        anchor.setAttribute('rel', 'noopener noreferrer nofollow');
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('data-wsr-external', '1');
      } else if (href.startsWith('#')) {
        anchor.classList.add('wsr-anchor');
        anchor.setAttribute('data-wsr-anchor', href.slice(1));
      } else {
        anchor.removeAttribute('href');
      }
      continue;
    }
    if (parsed.blocked || !parsed.sameLang) {
      blockedCount += 1;
      anchor.classList.add('wsr-link', 'wsr-link-blocked');
      anchor.setAttribute('data-wsr-blocked', parsed.title);
      anchor.setAttribute('data-wsr-namespace', parsed.title.split(':')[0]);
      // No href at all: keeps the DOM free of javascript: URLs while the
      // element stays focusable and clickable via role/tabindex.
      anchor.removeAttribute('href');
      anchor.setAttribute('role', 'link');
      anchor.setAttribute('tabindex', '0');
      anchor.setAttribute('aria-disabled', 'true');
      continue;
    }
    anchor.classList.add('wsr-link');
    anchor.setAttribute('data-wsr-title', parsed.title);
    anchor.setAttribute('data-wsr-url', parsed.url);
    if (parsed.fragment) anchor.setAttribute('data-wsr-fragment', parsed.fragment);
    anchor.removeAttribute('href');
    anchor.setAttribute('role', 'link');
    anchor.setAttribute('tabindex', '0');
    links.push({ title: parsed.title, fragment: parsed.fragment, element: anchor });
  }

  const headings = Array.from(root.querySelectorAll('h2, h3')).map((h) => ({
    id: h.id,
    text: (h.textContent || '').trim().replace(/\[\s*edit\s*\]/i, ''),
    level: Number(h.tagName.slice(1)),
  })).filter((h) => h.text);

  const imageCount = root.querySelectorAll('img').length;

  return { fragment: root, links, blockedCount, imageCount, headings };
}

/** Plain-text summary used by previews and the link scanner. */
export function extractLead(fragment, maxChars = 300) {
  const container = fragment.querySelector('.mw-parser-output') || fragment;
  const paragraphs = Array.from(container.querySelectorAll('p'));
  for (const p of paragraphs) {
    const text = (p.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 60) return text.slice(0, maxChars);
  }
  const first = paragraphs[0];
  return first ? (first.textContent || '').replace(/\s+/g, ' ').trim().slice(0, maxChars) : '';
}

/** Builds a lightweight text-only version (used by link previews/tooltips). */
export function toPlainText(fragment, maxChars = 1200) {
  const clone = fragment.cloneNode(true);
  for (const node of Array.from(clone.querySelectorAll('table, .infobox, .navbox, .reference, sup'))) node.remove();
  const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, maxChars);
}

/** Rewrites a document's anchors so they highlight already-visited articles. */
export function markVisited(root, visitedKeys) {
  if (!visitedKeys || !visitedKeys.size) return;
  for (const a of Array.from(root.querySelectorAll('a.wsr-link[data-wsr-title]'))) {
    const key = normalizeTitle(a.getAttribute('data-wsr-title')).toLocaleLowerCase();
    if (visitedKeys.has(key)) a.classList.add('wsr-visited');
  }
}
