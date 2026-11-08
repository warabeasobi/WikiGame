import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArticleView } from '../components/ArticleView';
import { BuffBar } from '../components/BuffBar';
import { EmptyState } from '../components/EmptyState';
import { Hud } from '../components/Hud';
import { RouteGraph } from '../components/RouteGraph';
import { plainText } from '../lib/html';
import { fetchPage } from '../lib/wiki';
import { LANG, useClock, useRace } from '../state/race';

export function RacePage() {
  const { meta, page, hints, go, useBuff } = useRace();
  const clock = useClock();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (meta?.done) navigate('/hasil');
  }, [meta?.done, navigate]);

  useEffect(() => {
    const host = scrollRef.current;
    if (host) host.scrollTop = host.scrollHeight;
  }, [meta?.route.length]);

  useEffect(() => {
    if (!meta?.ramal || summary) return;
    let alive = true;
    fetchPage(meta.target, LANG)
      .then(target => {
        if (alive) setSummary(plainText(target.html));
      })
      .catch(() => {
        if (alive) setSummary('Ringkasan target tidak bisa dimuat sekarang.');
      });
    return () => {
      alive = false;
    };
  }, [meta?.ramal, meta?.target, summary]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/input|textarea/i.test((event.target as HTMLElement).tagName)) return;
      if (event.key === '1' || event.key === '2' || event.key === '3') {
        event.preventDefault();
        useBuff(Number(event.key) - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [useBuff]);

  if (!meta) {
    return (
      <EmptyState
        heading="Belum ada balapan."
        body="Pilih mode dan tentukan artikel awal serta tujuan dulu, lalu balapan dimulai di sini."
        to="/mode"
        cta="Pilih mode"
      />
    );
  }

  return (
    <section className="section wr-race-sec" id="balapan" style={{ '--h': 1 } as CSSProperties} aria-labelledby="race-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="race-h">
            Balapan. <span className="muted">Klik tautan biru sampai artikel target.</span>
          </h2>
        </div>
        <div className={`panel panel--device wr-win${clock.freeze > 0 ? ' is-frozen' : ''}`} id="wr-win">
          <Hud />
          <div className="wr-body">
            <ArticleView page={page} hints={hints} route={meta.route} loading={meta.loading} onGo={title => void go(title)} />
            <aside className="wr-route" aria-label="Grafik rute">
              <div className="wr-route__head">
                <span className="wr-hud__k">Rutemu</span>
                <span id="wr-route-n">{meta.route.length} simpul</span>
              </div>
              <div className="wr-route__scroll" id="wr-route-scroll" ref={scrollRef}>
                <RouteGraph route={meta.route} target={meta.target} />
              </div>
            </aside>
          </div>
          <div className="wr-bar">
            <BuffBar />
            <p className="wr-live" id="wr-live" role="status">
              {meta.message || 'Pilih tautan berikutnya.'}
            </p>
          </div>
        </div>
        {meta.error ? (
          <p className="wr-err" role="alert">
            {meta.error}
          </p>
        ) : null}
        {meta.ramal && summary ? (
          <div className="wr-ramal">
            <h3>
              Ramalan: {meta.target} <span className="muted">par {meta.par}</span>
            </h3>
            <p>{summary}</p>
          </div>
        ) : null}
        <p className="muted">
          Salah rute? <Link className="nav__link" to="/mode">Mulai balapan baru</Link>
        </p>
      </div>
    </section>
  );
}
