import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ProfilePanel } from '../components/ProfilePanel';
import { BUFFS, RARITY_LABEL } from '../lib/buffs';
import { MODES, isMode } from '../lib/modes';
import { formatDate, formatMs } from '../lib/scoring';
import { NAME_MAX } from '../lib/profile';
import { useProfile } from '../state/profile';

export function ProfilePage() {
  const { profile, setProfile } = useProfile();
  const [name, setName] = useState(profile.name);
  const races = [...profile.races].reverse().slice(0, 10);

  return (
    <section className="section" id="profil" aria-labelledby="profil-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="profil-h">
            Profil pemain. <span className="muted">Tersimpan di perangkat ini, tanpa akun.</span>
          </h2>
        </div>
        <div className="group">
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
        </div>
        <div className="group">
          <div className="wr-chest-head">
            <h3>Balapan terakhir</h3>
            <span>{profile.races.length} balapan tercatat</span>
          </div>
          {races.length ? (
            <ol className="wr-steps wr-history" aria-label="Riwayat balapan">
              {races.map((race, index) => (
                <li key={`${race.at}-${index}`}>
                  <span className="wr-history__rank">{race.rank}</span>
                  <span>
                    {race.from} → {race.to}
                  </span>
                  <span className="muted">
                    {isMode(race.mode) ? MODES[race.mode].label : race.mode} · {race.clicks} klik · par {race.par} ·{' '}
                    {formatMs(race.ms)} · {formatDate(race.at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Belum ada balapan. <Link className="nav__link" to="/mode">Mulai satu dulu</Link>.
            </p>
          )}
        </div>
        <div className="group">
          <div className="wr-chest-head">
            <h3>Tas buff</h3>
            <span>{profile.inventory.length} buff tersimpan</span>
          </div>
          {profile.inventory.length ? (
            <ul className="wr-steps wr-bag" aria-label="Buff di tas">
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
          ) : (
            <p className="muted">Tasmu masih kosong. Buka peti hadiah setelah balapan untuk mengisinya.</p>
          )}
        </div>
      </div>
    </section>
  );
}
