import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Diagram } from '../components/Diagram';
import { RoutePicker } from '../components/RoutePicker';
import { MODE_DIAGRAMS } from '../lib/diagrams';
import { MODE_LIST, type Mode } from '../lib/modes';
import { randomTitles } from '../lib/wiki';
import { LANG, useRace } from '../state/race';

export function ModePage() {
  const { begin } = useRace();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async (from: string, to: string) => {
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      await begin(mode, from, to);
      navigate('/balapan');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Wikipedia tidak bisa dihubungi. Coba lagi sebentar.');
    } finally {
      setBusy(false);
    }
  };

  const playRandom = async () => {
    setBusy(true);
    setError(null);
    try {
      const [from, to] = await randomTitles(2, LANG);
      await begin('random', from, to);
      navigate('/balapan');
    } catch {
      setError('Wikipedia tidak bisa dihubungi. Coba lagi sebentar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section" id="mode" style={{ '--h': 1 } as CSSProperties} aria-labelledby="mode-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="mode-h">
            Pilih cara balapan. <span className="muted">Tiga mode, satu grafik tautan.</span>
          </h2>
        </div>
        <div className="grid wr-modes">
          {MODE_LIST.map(def => (
            <article className={`card span-4${mode === def.id ? ' is-picked' : ''}`} data-mode={def.id} key={def.id}>
              <h3>{def.label}</h3>
              <p>{def.blurb}</p>
              <div className="panel panel--inset">
                <Diagram spec={MODE_DIAGRAMS[def.id]} still />
              </div>
              <dl className="stats">
                {def.stats.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd className="t-stat">{value}</dd>
                  </div>
                ))}
              </dl>
              <button
                className="card__link"
                type="button"
                aria-pressed={def.id === 'random' ? undefined : mode === def.id}
                disabled={busy}
                onClick={() => (def.id === 'random' ? void playRandom() : setMode(def.id))}
              >
                {def.cta}
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </article>
          ))}
        </div>
        {mode && mode !== 'random' ? (
          <RoutePicker
            key={mode}
            mode={mode}
            initialFrom={mode === 'trial' ? 'Kucing' : ''}
            initialTo={mode === 'trial' ? 'Gunung Fuji' : ''}
            busy={busy}
            onLaunch={launch}
            onRandom={playRandom}
          />
        ) : null}
        <p className="wr-err" role="alert" hidden={!error}>
          {error}
        </p>
      </div>
    </section>
  );
}
