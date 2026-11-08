// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isNamespaceTitle, normalizeTitle, parseArticleHtml } from './wiki';

const FIXTURE = `<!DOCTYPE html>
<html><head><title>Jakarta</title></head><body>
<section data-mw-section-id="0">
<h2>Jakarta</h2>
<p>Kota <a rel="mw:WikiLink" href="./Indonesia">Indonesia</a> dan
<a rel="mw:WikiLink" href="./Berkas:Peta.png">peta</a> serta
<a rel="mw:WikiLink" href="./Gunung_Fuji#Sejarah">Gunung Fuji</a> dan
<a href="https://en.wikipedia.org/wiki/Tokyo">Tokyo</a> dan
<a rel="mw:WikiLink" class="new" href="./Halaman_Baru">halaman baru</a>
<sup class="mw-ref">[1]</sup></p>
<ul><li>Butir daftar</li></ul>
</section>
<section data-mw-section-id="1">
<h2>Sejarah</h2>
<p>Teks sejarah.</p>
</section>
<section data-mw-section-id="2">
<h2>Referensi</h2>
<p>Teks referensi.</p>
</section>
<section data-mw-section-id="3">
<h2>Lihat pula</h2>
<p>Teks lihat pula.</p>
</section>
</body></html>`;

describe('normalizeTitle', () => {
  it('converts underscores to spaces', () => {
    expect(normalizeTitle('Gunung_Fuji')).toBe('Gunung Fuji');
  });
  it('decodes percent-encoding', () => {
    expect(normalizeTitle('Jakarta%20Selatan')).toBe('Jakarta Selatan');
  });
  it('collapses whitespace and trims', () => {
    expect(normalizeTitle('  Kota   Tua  ')).toBe('Kota Tua');
  });
});

describe('isNamespaceTitle', () => {
  it('accepts namespace titles', () => {
    expect(isNamespaceTitle('Berkas:Kucing.jpg')).toBe(true);
    expect(isNamespaceTitle('Wikipedia:About')).toBe(true);
    expect(isNamespaceTitle('Pembicaraan Pengguna:X')).toBe(true);
    expect(isNamespaceTitle('Kategori:Alamat')).toBe(true);
    expect(isNamespaceTitle('Special:RecentChanges')).toBe(true);
  });
  it('rejects article titles', () => {
    expect(isNamespaceTitle('Kucing')).toBe(false);
    expect(isNamespaceTitle('Gunung Fuji')).toBe(false);
  });
});

describe('parseArticleHtml', () => {
  const { html, links, title } = parseArticleHtml(FIXTURE);

  it('extracts the page title', () => {
    expect(title).toBe('Jakarta');
  });

  it('keeps a paragraph with a valid internal link', () => {
    expect(html).toContain('wr-link');
    expect(html).toContain('data-to="Indonesia"');
    expect(links).toContain('Indonesia');
  });

  it('deads a namespaced link and excludes it from links', () => {
    expect(html).toContain('wr-dead');
    expect(html).not.toContain('data-to="Berkas: Peta.png"');
    expect(links).not.toContain('Berkas: Peta.png');
    expect(links).not.toContain('Berkas:Peta.png');
  });

  it('deads an interwiki link', () => {
    expect(html).toContain('<span class="wr-dead">Tokyo</span>');
    expect(links).not.toContain('Tokyo');
  });

  it('deads a red link', () => {
    expect(html).toContain('<span class="wr-dead">halaman baru</span>');
    expect(links).not.toContain('Halaman Baru');
  });

  it('removes references', () => {
    expect(html).not.toContain('mw-ref');
    expect(html).not.toContain('[1]');
  });

  it('drops the Referensi section entirely', () => {
    expect(html).not.toContain('Teks referensi');
  });

  it('keeps the Sejarah section as h4', () => {
    expect(html).toContain('<h4>Sejarah</h4>');
    expect(html).toContain('Teks sejarah.');
  });

  it('cuts everything after a stop heading in the same section walk', () => {
    expect(html).not.toContain('Teks lihat pula');
  });

  it('keeps lists', () => {
    expect(html).toContain('<ul>');
    expect(html).toContain('Butir daftar');
  });

  it('strips the fragment from link targets', () => {
    expect(links).toContain('Gunung Fuji');
    expect(html).toContain('data-to="Gunung Fuji"');
    expect(html).not.toContain('Gunung_Fuji');
  });
});
