import { MODES } from '../lib/modes';
import { formatMs } from '../lib/scoring';
import { useProfile } from '../state/profile';
import { useClock, useRace } from '../state/race';

export function Hud() {
  const { meta } = useRace();
  const clock = useClock();
  const { profile } = useProfile();
  if (!meta) return null;

  const limit = MODES[meta.mode].limit;
  const shown = limit ? Math.max(0, limit - clock.elapsed) : clock.elapsed;

  return (
    <div className="wr-hud" role="group" aria-label="Status balapan">
      <span className="wr-hud__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="wr-hud__cell">
        <span className="wr-hud__k">Pemain</span>
        <b id="wr-who">{profile.name}</b>
      </span>
      <span className="wr-hud__cell">
        <span className="wr-hud__k" id="wr-timer-k">
          {limit ? 'Sisa' : 'Waktu'}
        </span>
        <b className="wr-num" id="wr-timer" aria-live="off">
          {formatMs(shown)}
        </b>
        {clock.freeze > 0 ? (
          <em className="wr-freeze" id="wr-freeze">
            ⏸ {Math.ceil(clock.freeze / 1000)}
          </em>
        ) : null}
      </span>
      <span className="wr-hud__cell">
        <span className="wr-hud__k">Klik</span>
        <b className="wr-num" id="wr-clicks">
          {meta.clicks}
        </b>
      </span>
      <span className="wr-hud__sp" />
      <span className="wr-target">
        <span className="wr-hud__k">Target</span>
        <b id="wr-target">{meta.target}</b>
        <em id="wr-par">par {meta.par}</em>
      </span>
    </div>
  );
}
