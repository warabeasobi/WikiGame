import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { enhanceDom } from '../lib/kit';

const NAV = [
  { to: '/', label: 'Mulai', end: true },
  { to: '/mode', label: 'Mode' },
  { to: '/balapan', label: 'Balapan' },
  { to: '/hasil', label: 'Hasil' },
  { to: '/profil', label: 'Profil' }
];

const THEME_KEY = 'wr-theme';

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  );

  /* The kit binds to the DOM once; every screen change re-runs it for the new markup. */
  useEffect(() => {
    void enhanceDom(document);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#efefef' : '#0a0a0a');
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* the choice just will not outlive the tab */
    }
  }, [theme]);

  return (
    <>
      <header className="nav">
        <div className="wrap nav__bar">
          <Link className="nav__logo" to="/">
            <span className="mark" data-mark="dots" aria-hidden="true" />
            WikiRace
          </Link>
          <nav className="nav__links" aria-label="Utama">
            {NAV.map(item => (
              <div className="nav__item" key={item.to}>
                <NavLink className="nav__link" to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              </div>
            ))}
          </nav>
          <div className="nav__actions">
            <button className="btn btn--secondary btn--sm wr-theme" type="button" aria-pressed={theme === 'light'} onClick={toggleTheme}>
              {theme === 'light' ? 'Mode gelap' : 'Mode terang'}
            </button>
            <Link className="btn btn--primary btn--sm" to="/mode">
              Main sekarang
            </Link>
          </div>
        </div>
      </header>
      <main id="top">{children}</main>
    </>
  );
}
