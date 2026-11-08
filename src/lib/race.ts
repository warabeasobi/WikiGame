import { getCachedPage, type WikiPage } from './wiki';

export const PAR_UNKNOWN = 4;

/** Best-effort par for a live route: 1 when the goal is one hop away, 2 when the goal's own
 *  neighbours are linked from here, otherwise the "±4" guess the mockup used. */
export function estimatePar(start: WikiPage | undefined, target: string, neighbours: Iterable<string>): number {
  const near = new Set(neighbours);
  if (!start) return PAR_UNKNOWN;
  if (start.title === target) return 1;
  if (start.links.includes(target)) return 1;
  if (start.links.some(l => near.has(l))) return 2;
  return PAR_UNKNOWN;
}

/** Ranks the links on the current page toward the target; the first two are marked by Mata Elang. */
export function bestLinks(page: WikiPage, target: string, neighbours: Iterable<string>, route: string[]): string[] {
  const near = new Set(neighbours);
  const seen = new Set(route);
  const words = target.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const score = (l: string): number => {
    let s = 0;
    if (l === target) s += 100;
    if (near.has(l)) s += 10;
    s += words.filter(w => l.toLowerCase().includes(w)).length * 2;
    if (seen.has(l)) s -= 4;
    return s;
  };
  return [...new Set(page.links)]
    .map(l => [l, score(l)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([l]) => l);
}

/** A cached page is good for immediate paint; an uncached one needs a fetch. */
export function cachedOrUndefined(title: string, lang: string): WikiPage | undefined {
  return getCachedPage(title, lang);
}
