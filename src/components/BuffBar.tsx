import { BUFFS, RARITY_LABEL } from '../lib/buffs';
import { useRace } from '../state/race';

export function BuffBar() {
  const { meta, useBuff } = useRace();
  if (!meta) return <div className="wr-buffs" id="wr-buffs" />;

  return (
    <div className="wr-buffs" id="wr-buffs" role="group" aria-label="Buff">
      {meta.buffs.map((slot, index) => {
        const def = BUFFS[slot.id];
        const disabled = slot.used || !meta.running;
        const label = `${def.name}, ${RARITY_LABEL[slot.rarity]}, tombol ${index + 1}${slot.used ? ', sudah dipakai' : ''}`;
        return (
          <button
            key={slot.id}
            className={`wr-buff${slot.on ? ' is-on' : ''}`}
            type="button"
            data-rarity={slot.rarity}
            disabled={disabled}
            aria-keyshortcuts={String(index + 1)}
            aria-label={label}
            title={def.desc}
            onClick={() => useBuff(index)}
          >
            <span className="wr-buff__key" aria-hidden="true">
              {index + 1}
            </span>
            <span className="wr-buff__ico" aria-hidden="true">
              {def.ico}
            </span>
            <span className="wr-buff__t">
              <span className="wr-buff__n">{def.name}</span>
              <span className="wr-buff__r">{RARITY_LABEL[slot.rarity]}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
