import { useEffect, useRef } from 'react';
import { escapeHtml } from '../lib/html';
import type { WikiPage } from '../lib/wiki';

interface ArticleViewProps {
  page: WikiPage | undefined;
  hints: string[];
  route: string[];
  loading: boolean;
  onGo: (title: string) => void;
}

export function ArticleView({ page, hints, route, loading, onGo }: ArticleViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const hintKey = hints.join('|');

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (!page) {
      host.innerHTML = `<p class="wr-loading">${loading ? 'Memuat artikel dari Wikipedia…' : 'Belum ada artikel. Pilih mode lalu tentukan rute dulu.'}</p>`;
      return;
    }
    const info = page.img
      ? `<aside class="wr-info"><img src="${escapeHtml(page.img)}" alt="${escapeHtml(page.alt)}" loading="lazy" width="330" height="248" onerror="this.style.visibility='hidden'"><dl>${page.info
          .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
          .join('')}</dl></aside>`
      : '';
    host.innerHTML = `<h3>${escapeHtml(page.title)}</h3><p class="wr-from">Dari Wikipedia bahasa Indonesia, ensiklopedia bebas</p>${info}${page.html}`;
    const marks = new Set(hintKey ? hintKey.split('|') : []);
    const seen = new Set(route);
    for (const link of host.querySelectorAll<HTMLAnchorElement>('a.wr-link')) {
      const to = link.dataset.to ?? '';
      if (marks.has(to)) link.classList.add('is-hint');
      if (seen.has(to)) link.classList.add('wr-seen');
    }
    host.scrollTop = 0;
  }, [page, hintKey, route, loading]);

  return (
    <article
      className="wr-article"
      id="wr-article"
      ref={ref}
      aria-live="polite"
      aria-label="Artikel Wikipedia"
      onClick={event => {
        const link = (event.target as HTMLElement).closest('a.wr-link') as HTMLAnchorElement | null;
        if (!link) return;
        event.preventDefault();
        if (link.dataset.to) onGo(link.dataset.to);
      }}
    />
  );
}
