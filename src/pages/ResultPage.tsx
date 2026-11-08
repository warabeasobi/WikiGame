import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ProfilePanel } from '../components/ProfilePanel';
import { BUFFS, RARITY_LABEL } from '../lib/buffs';
import { MODES } from '../lib/modes';
import { formatMs } from '../lib/scoring';
import { useRace } from '../state/race';

export function ResultPage() {
  const { result, takeCard } = useRace();

  if (!result) {
    return (
      <EmptyState
        heading="Belum ada hasil."
        body="Selesaikan satu balapan dulu — rank, XP, dan peti hadiahnya muncul di sini."
        to="/mode"
        cta="Mulai balapan"
      />
    );
  }

  const { rank, xp, clicks, par, ms, route, chest, mode, won } = result;

  return (
    <section className="section g2" id="hasil" aria-labelledby="hasil-h">
      <div className="wrap">
        <div className="group">
          <div className="section-head">
            <h2 id="hasil-h">
              Hasil balapan.{' '}
              <span className="muted" id="wr-result-line">
                {won ? `${MODES[mode].label}: ${clicks} klik untuk par ${par}.` : 'Waktu habis sebelum sampai ke target.'}
              </span>
            </h2>
          </div>
          <div className="wr-result" id="wr-result">
            <div className="wr-rank" aria-label="Rank">
              <span className="wr-rank__k">Rank</span>
              <span className="wr-rank__v" id="wr-rank">
                {rank}
              </span>
            </div>
            <div className="wr-xp">
              <span className="wr-xp__v wr-num" id="wr-xp">
                {xp}
              </span>
              <span className="wr-xp__u">XP</span>
            </div>
            <dl className="stats wr-result__stats">
              <div>
                <dt>Klik</dt>
                <dd className="t-stat" id="wr-r-clicks">
                  {clicks}
                </dd>
              </div>
              <div>
                <dt>Par</dt>
                <dd className="t-stat" id="wr-r-par">
                  {par}
                </dd>
              </div>
              <div>
                <dt>Waktu</dt>
                <dd className="t-stat wr-num" id="wr-r-time">
                  {formatMs(ms)}
                </dd>
              </div>
            </dl>
            <ol className="wr-steps" id="wr-path" aria-label="Rute">
              {route.map((title, index) => (
                <li key={`${title}-${index}`}>{title}</li>
              ))}
            </ol>
          </div>
        </div>
        <div className="wr-second">
          <div className="wr-chest-head">
            <h3>Peti hadiah</h3>
            <span id="wr-chest-note">Ambil buff untuk tasmu. Tiap buff sekali pakai.</span>
          </div>
          <div className="grid wr-chest" id="wr-chest">
            {chest.map((card, index) => (
              <article className={`card span-4${card.taken ? ' is-taken' : ''}`} data-rarity={card.rarity} key={`${card.id}-${index}`}>
                <span className="wr-rar">{RARITY_LABEL[card.rarity]}</span>
                <h4>
                  <span aria-hidden="true">{BUFFS[card.id].ico}</span>
                  {BUFFS[card.id].name}
                </h4>
                <p>{BUFFS[card.id].desc} Sekali pakai.</p>
                <button className="card__link wr-take" type="button" disabled={card.taken} onClick={() => takeCard(index)}>
                  {card.taken ? 'Sudah di tas' : 'Ambil buff'}
                </button>
              </article>
            ))}
          </div>
          <ProfilePanel />
          <div className="wr-marquee">
            <p className="t-label">Artikel di arena ini</p>
            <div data-moment="marquee-row" data-moment-opts='{"speed":36}'>
              <ul className="mo-mq__track">
                {route.map((title, index) => (
                  <li key={`${title}-mq-${index}`}>{title}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="btn-row">
          <Link className="btn btn--primary" to="/mode">
            Balapan lagi
          </Link>
          <Link className="btn btn--secondary" to="/profil">
            Buka profil
          </Link>
        </div>
      </div>
    </section>
  );
}
