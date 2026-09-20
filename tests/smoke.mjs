/* Quick smoke test for the Wikipedia client (run with node). */
import { bootDom } from './env.mjs';

bootDom();
const wiki = await import('../js/api/wikipedia.js');

const t0 = Date.now();
console.log('1. search…');
const s = await wiki.searchArticles('en', 'Albert Ein', { limit: 3 });
console.log('   ->', s.map((r) => r.title).join(', '), `${Date.now() - t0}ms`);

console.log('2. article…');
const a = await wiki.getArticle('en', 'Albert Einstein');
console.log('   ->', a.title, a.html.length, 'chars,', a.categories.length, 'cats', `${Date.now() - t0}ms`);

console.log('3. resolve redirect (USA)…');
console.log('   ->', await wiki.resolveTitle('en', 'USA'), `${Date.now() - t0}ms`);

console.log('4. links…');
const links = await wiki.getOutgoingLinks('en', 'Banana', { limit: 60 });
console.log('   ->', links.length, 'links', `${Date.now() - t0}ms`);

console.log('5. page info…');
const info = await wiki.getPageInfo('en', ['Banana']);
console.log('   ->', Object.values(info)[0].title, '|', Object.values(info)[0].description, `${Date.now() - t0}ms`);

console.log('6. popularity pool…');
const pool = await wiki.getPopularTitles('en');
console.log('   ->', pool.length, 'titles', `${Date.now() - t0}ms`);

console.log('7. random titles (id/ja)…');
console.log('   ->', (await wiki.getRandomTitles('id', 2)).join(', '), '|', (await wiki.getRandomTitles('ja', 2)).join(', '), `${Date.now() - t0}ms`);

console.log('8. bfs distance Banana -> Fruit…');
console.log('   ->', await wiki.bfsDistance('en', 'Banana', 'Fruit', { maxDepth: 2, frontier: 6 }), `${Date.now() - t0}ms`);

console.log('9. 12 parallel requests (semaphore test)…');
const many = await Promise.all(Array.from({ length: 12 }, (_, i) => wiki.searchArticles('en', `test ${i}`, { limit: 1 })));
console.log('   ->', many.length, 'responses', `${Date.now() - t0}ms`);
console.log('TOTAL', Date.now() - t0, 'ms');
