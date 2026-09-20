#!/usr/bin/env python3
"""Build data/popular-<lang>.json pools from the official Wikimedia Pageviews API.

Only the official Wikimedia REST API is used (no scraping of wikipedia.org HTML).
Run:  python3 tools/build_data.py
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
LANGS = ["en", "id", "ja", "de", "fr", "es"]
DAYS = 6
TOP_N = 2500

# Namespaces / non-article pages we never want as a challenge article.
BAD_PREFIX = re.compile(
    r"^(special|wikipedia|portal|file|category|template|help|talk|user|"
    r"user talk|wikipedia talk|template talk|category talk|file talk|"
    r"portal talk|help talk|mediawiki|module|draft|book|timedtext|"
    r"istimewa|pembicaraan|pengguna|pembicaraan pengguna|berkas|"
    r"pembicaraan berkas|mediawiki|pembicaraan mediawiki|templat|"
    r"pembicaraan templat|bantuan|pembicaraan bantuan|kategori|"
    r"pembicaraan kategori|portal|pembicaraan portal|"
    r"特別|ノート|利用者|利用者‐会話|ファイル|file|"
    r"spezial|benutzer|benutzer diskussion|datei|datei diskussion|"
    r"especial|discusión|usuario|usuario discusión|archivo|archivo discusión|"
    r"spécial|discussion|utilisateur|discussion utilisateur|fichier|"
    r"discussion fichier|catégorie|discussion catégorie|portail|"
    r"discusión archivo|ayuda|plantilla|wikiproyecto|wikipédia)\s*:",
    re.I,
)
BAD_TITLES = {
    "Main_Page", "Halaman_Utama", "Wikipedia", "Wikipédia", "Hauptseite",
    "Portada", "Wikipedia:Portada", "Wikinoticias", "Wikinews",
    "-", "Special:Search", "Special:Random", "Special:Watchlist",
    "Wikipedia:Featured_pictures", "Wikipedia:Featured_articles",
    "Wikipedia:Community_portal", "Wikipedia:Contents",
    "Wikipedia:Top_25_Report", "Wikipedia:About",
}


def fetch(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WikipediaSpeedrun/1.0 (build script; contact: local)"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            if attempt == tries - 1:
                print(f"    !! failed {url}: {exc}", file=sys.stderr)
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def day_strings(n):
    now = datetime.now(timezone.utc)
    # pageviews for "today" are not published yet -> start at yesterday
    return [(now - timedelta(days=d)).strftime("%Y/%m/%d") for d in range(1, n + 1)]


def is_good(title):
    if not title or title in BAD_TITLES:
        return False
    if ":" in title or "：" in title:
        return False
    if len(title) < 2 or len(title) > 90:
        return False
    if BAD_PREFIX.match(title):
        return False
    # Discard obvious utility/list pages that make the game trivial.
    low = title.lower()
    for needle in ("disambiguation", "daftar", "list_of", "index_of", "outline_of",
                   "timeline_of", "glossary_of", "lists_of", "begriffsklärung",
                   "homonymie", "desambiguación", "曖昧さ回避", "daftar_isi"):
        if needle in low:
            return False
    return True


def build_lang(lang):
    counts = {}
    days = day_strings(DAYS)
    for d in days:
        url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{d}"
        payload = fetch(url)
        if not payload or "items" not in payload:
            print(f"  {lang} {d}: no data")
            continue
        arts = payload["items"][0].get("articles", [])
        print(f"  {lang} {d}: {len(arts)} rows")
        for a in arts:
            t = (a.get("article") or "").replace("_", " ")
            if is_good(t):
                counts[t] = counts.get(t, 0) + int(a.get("views") or 0)
        time.sleep(0.4)
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:TOP_N]
    out = [{"t": t, "v": v} for t, v in ranked]
    path = os.path.join(DATA, f"popular-{lang}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"lang": lang, "generated": datetime.now(timezone.utc).isoformat(), "articles": out}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  -> {path} ({len(out)} articles, {os.path.getsize(path)//1024} KB)")
    return out


def main():
    os.makedirs(DATA, exist_ok=True)
    index = {}
    for lang in LANGS:
        print(f"[{lang}]")
        arts = build_lang(lang) or []
        index[lang] = len(arts)
        time.sleep(3)  # ponytail: Wikimedia 429s on back-to-back projects; per-project pause is enough
    with open(os.path.join(DATA, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"languages": index, "generated": datetime.now(timezone.utc).isoformat()}, fh, indent=2)
    print("done:", index)


if __name__ == "__main__":
    main()
