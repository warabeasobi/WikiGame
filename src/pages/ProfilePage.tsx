import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, type Bar } from '../components/BarChart';
import { ProfilePanel } from '../components/ProfilePanel';
import { BUFFS, RARITY_LABEL } from '../lib/buffs';
import { MODES, isMode } from '../lib/modes';
import { NAME_MAX } from '../lib/profile';
import { formatDate, formatMs } from '../lib/scoring';
import { summarize, XP_PER_LEVEL } from '../lib/stats';
import { useProfile } from '../state/profile';

const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v * 100)}%`);

export function ProfilePage() {
  const { profile, setProfile } = useProfile();
  const [name, setName] = useState(profile.name);
  const dash = summarize(profile);

  const bars: Bar[] = dash.series.map(race => ({
    value: race.xp,
    label: formatDate(race.at).split(',')[0],
    title: `${race.from} → ${race.to}: ${race.xp} XP, rank ${race.rank}`
  }));

  const tiles = [
    { label: 'Total XP', value: dash.xp.toLocaleString('id-ID'), note: `Level ${dash.level.level} · ${dash.level.toNext} XP lagi` },
    { label: 'Balapan', value: String(dash.races), note: dash.topMode ? `Paling sering: ${MODES[dash.topMode].label}` : 'Belum ada balapan' },
    { label: 'Rata-rata klik', value: dash.avgClicks === null ? '—' : dash.avgClicks.toFixed(1), note: `${dash.totalClicks} klik seluruhnya` },
    { label: 'Sampai target', value: pct(dash.winRate), note: `Rank terbaik: ${dash.bestRank ?? '—'}` }
  ];

  return (
    <section className="section" id="profil" aria-labelledby="profil-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="profil-h">
            Dasbor pemain. <span className="muted">Tersimpan di perangkat ini, tanpa akun.</span>
          </h2>
        </div>

        <div className="grid wr-dash">
          {tiles.map(tile => (
            <article className="card span-3" key={tile.label}>
              <p className="t-label">{tile.label}</p>
              <p className="wr-tile__v">{tile.value}</p>
              <p className="wr-tile__note">{tile.note}</p>
            </article>
          ))}

          <article className="card span-8">
            <div className="wr-card-head">
              <h3>XP per balapan</h3>
              <span className="muted">{dash.series.length ? `${dash.series.length} balapan terakhir` : 'Belum ada data'}</span>
            </div>
            {bars.length ? (
              <BarChart
                bars={bars}
                caption="XP per balapan"
                describe={list => `Grafik batang XP dari ${list.length} balapan, ${list[0].value} sampai ${Math.max(...list.map(b => b.value))} XP.`}
              />
            ) : (
              <p className="muted">
                Selesaikan satu balapan dulu, lalu grafiknya muncul di sini. <Link className="nav__link" to="/mode">Mulai sekarang</Link>.
              </p>
            )}
          </article>

          <article className="card span-4">
            <div className="wr-card-head">
              <h3>Progres level</h3>
              <span className="muted">{XP_PER_LEVEL} XP per level</span>
            </div>
            <p className="wr-level">
              <span className="wr-level__n">{dash.level.level}</span>
              <span className="wr-tile__note">
                {dash.level.into} / {dash.level.span} XP
              </span>
            </p>
            <div className="wr-meter" role="img" aria-label={`Progres level ${dash.level.level}, ${Math.round(dash.level.progress * 100)} persen`}>
              <span style={{ width: `${Math.max(2, dash.level.progress * 100)}%` }} />
            </div>
            <dl className="stats wr-dash__facts">
              <div>
                <dt>Waktu tercepat</dt>
                <dd className="t-stat">{dash.fastest ? formatMs(dash.fastest.ms) : '—'}</dd>
              </div>
              <div>
                <dt>Rata-rata waktu</dt>
                <dd className="t-stat">{dash.avgMs === null ? '—' : formatMs(dash.avgMs)}</dd>
              </div>
            </dl>
          </article>

          <article className="card span-8">
            <div className="wr-card-head">
              <h3>Balapan terakhir</h3>
              <span className="muted">{dash.races} balapan tercatat</span>
            </div>
            {dash.recent.length ? (
              <ol className="wr-history" aria-label="Riwayat balapan">
                {dash.recent.map((race, index) => (
                  <li key={`${race.at}-${index}`}>
                    <span className="wr-history__rank">{race.rank}</span>
                    <span>
                      {race.from} → {race.to}
                    </span>
                    <span className="muted">
                      {isMode(race.mode) ? MODES[race.mode].label : race.mode} · {race.clicks} klik · par {race.par} ·{' '}
                      {formatMs(race.ms)} · {race.xp} XP · {formatDate(race.at)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Belum ada balapan. <Link className="nav__link" to="/mode">Mulai satu dulu</Link>.
              </p>
            )}
          </article>

          <article className="card span-4">
            <div className="wr-card-head">
              <h3>Tas buff</h3>
              <span className="muted">{dash.buffs} tersimpan</span>
            </div>
            {profile.inventory.length ? (
              <>
                <p className="wr-tile__note">Paling langka: {dash.rarest ? RARITY_LABEL[dash.rarest] : '—'}</p>
                <ul className="wr-bag" aria-label="Buff di tas">
                  {profile.inventory.map((item, index) => (
                    <li key={`${item.at}-${index}`}>
                      <span aria-hidden="true">{BUFFS[item.id].ico}</span>
                      <span>{BUFFS[item.id].name}</span>
                      <span className="muted">
                        {RARITY_LABEL[item.rarity]} · {formatDate(item.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Tasmu masih kosong. Buka peti hadiah setelah balapan untuk mengisinya.</p>
            )}
          </article>

          <article className="card span-12">
            <div className="wr-card-head">
              <h3>Identitas &amp; berkas</h3>
              <span className="muted">Profil lokal, bisa dipindah sebagai .json</span>
            </div>
            <form
              className="wr-name"
              noValidate
              onSubmit={event => {
                event.preventDefault();
                const value = name.trim();
                if (!value) return;
                setProfile({ ...profile, name: value.slice(0, NAME_MAX) });
              }}
            >
              <label className="wr-name__label" htmlFor="wr-profile-name">
                Nama pemain
              </label>
              <div className="wr-name__row">
                <input
                  className="wr-input"
                  id="wr-profile-name"
                  type="text"
                  maxLength={NAME_MAX}
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
                <button className="btn btn--primary" type="submit">
                  Simpan nama
                </button>
              </div>
            </form>
            <ProfilePanel />
          </article>
        </div>

        <div className="btn-row">
          <Link className="btn btn--primary" to="/mode">
            Balapan lagi
          </Link>
          <Link className="btn btn--secondary" to="/hasil">
            Lihat hasil terakhir
          </Link>
        </div>
      </div>
    </section>
  );
}
