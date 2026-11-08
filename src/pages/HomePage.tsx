import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Diagram } from '../components/Diagram';
import { HERO_DIAGRAM } from '../lib/diagrams';
import { NAME_MAX } from '../lib/profile';
import { useProfile } from '../state/profile';

export function HomePage() {
  const { profile, setProfile } = useProfile();
  const navigate = useNavigate();
  const [name, setName] = useState(profile.name === 'Tamu' ? '' : profile.name);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="hero hero--photo" id="nama" data-enter="" data-calm="left" data-box="none" data-tone="dark" aria-labelledby="hero-h">
      <div className="hero__bg" data-fx="grid-pulse" data-fx-seed="7" data-fx-params='{"calmX":0.28,"calmY":0.5}' aria-hidden="true" />
      <div className="wr-hero-graph">
        <div className="panel">
          <Diagram spec={HERO_DIAGRAM} opts='{"size":"band"}' />
        </div>
      </div>
      <div className="wrap">
        <div className="hero-text">
          <div className="hero__text">
            <h1 id="hero-h">WikiRace, balapan lewat tautan Wikipedia</h1>
            <p className="hero__lead">
              Mulai dari satu artikel, klik hanya tautan biru, dan sampai ke artikel target dengan klik paling sedikit. Setiap klik
              menambah satu simpul di grafik.
            </p>
            <form
              className="wr-name"
              noValidate
              onSubmit={event => {
                event.preventDefault();
                const value = name.trim();
                if (!value) {
                  setError('Isi nama dulu, supaya hasilmu punya pemilik.');
                  return;
                }
                setError(null);
                setProfile({ ...profile, name: value.slice(0, NAME_MAX) });
                navigate('/mode');
              }}
            >
              <label className="wr-name__label" htmlFor="wr-name">
                Nama pemain
              </label>
              <div className="wr-name__row">
                <input
                  className="wr-input"
                  id="wr-name"
                  name="name"
                  type="text"
                  maxLength={NAME_MAX}
                  autoComplete="nickname"
                  placeholder="Misalnya Sari"
                  aria-describedby="wr-name-err"
                  aria-invalid={error ? true : undefined}
                  value={name}
                  onChange={event => setName(event.target.value)}
                />
                <button className="btn btn--primary" type="submit">
                  Lanjut pilih mode
                </button>
              </div>
              <p className="wr-err" id="wr-name-err" role="alert" hidden={!error}>
                {error}
              </p>
            </form>
          </div>
          <dl className="hero__facts">
            <div>
              <dt>Artikel</dt>
              <dd>Seluruh Wikipedia Indonesia</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Free run, Time trial, Random</dd>
            </div>
            <div>
              <dt>Buff</dt>
              <dd>3 sekali pakai per balapan</dd>
            </div>
            <div>
              <dt>Profil</dt>
              <dd>Tersimpan di perangkatmu</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
