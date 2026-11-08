import { useEffect, useRef, useState } from 'react';
import { resolveTitle, searchTitles, type WikiSuggestion } from '../lib/wiki';
import { LANG } from '../state/race';
import type { Mode } from '../lib/modes';

interface ComboProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function Combo({ id, label, placeholder, value, onChange }: ComboProps) {
  const [items, setItems] = useState<WikiSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [picked, setPicked] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const listId = `${id}-list`;

  const choose = (item: WikiSuggestion) => {
    onChange(item.title);
    setPicked(true);
    setOpen(false);
  };

  const handleInput = (next: string) => {
    onChange(next);
    setPicked(false);
    const query = next.trim();
    window.clearTimeout(timer.current);
    if (query.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const mine = ++seq.current;
    timer.current = window.setTimeout(async () => {
      try {
        const found = await searchTitles(query, LANG, 6);
        if (mine !== seq.current) return;
        setItems(found);
        setSelected(found.length ? 0 : -1);
        setNote(null);
        setOpen(true);
      } catch {
        if (mine !== seq.current) return;
        setItems([]);
        setNote('Wikipedia tidak bisa dihubungi. Coba lagi sebentar.');
        setOpen(true);
      }
    }, 220);
  };

  return (
    <div className="wr-combo" data-field={id}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={picked ? 'is-ok' : undefined}
        type="text"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        autoComplete="off"
        onChange={event => handleInput(event.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={event => {
          if (!open || !items.length) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected(current => (current + 1) % items.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected(current => (current - 1 + items.length) % items.length);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (selected >= 0) choose(items[selected]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <ul className="wr-sugg" id={listId} role="listbox" hidden={!open}>
        {items.length ? (
          items.map((item, index) => (
            <li
              key={item.title}
              id={`${id}-o${index}`}
              role="option"
              aria-selected={index === selected}
              onMouseDown={event => {
                event.preventDefault();
                choose(item);
              }}
            >
              {item.img ? <img src={item.img} alt="" /> : <i aria-hidden="true" />}
              <span>
                <b>{item.title}</b>
                {item.desc ? <small>{item.desc}</small> : null}
              </span>
            </li>
          ))
        ) : (
          <li className="wr-sugg__none">{note ?? 'Tidak ada artikel dengan judul itu.'}</li>
        )}
      </ul>
    </div>
  );
}

interface RoutePickerProps {
  mode: Mode;
  initialFrom?: string;
  initialTo?: string;
  busy: boolean;
  onLaunch: (from: string, to: string) => Promise<void> | void;
  onRandom: () => Promise<void> | void;
}

export function RoutePicker({ mode, initialFrom = '', initialTo = '', busy, onLaunch, onRandom }: RoutePickerProps) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setFrom(initialFrom);
    setTo(initialTo);
    setError(null);
  }, [initialFrom, initialTo, mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setWorking(true);
    try {
      const wanted = async (raw: string, field: 'from' | 'to') => {
        const query = raw.trim();
        if (!query) throw new Error(field === 'from' ? 'Isi artikel awal.' : 'Isi artikel tujuan.');
        const resolved = await resolveTitle(query, LANG);
        if (!resolved) throw new Error(`Tidak ada artikel “${query}” di Wikipedia bahasa Indonesia.`);
        if (resolved.disambig) {
          throw new Error(`“${resolved.title}” adalah halaman disambiguasi. Pilih artikel yang lebih spesifik dari saran.`);
        }
        return resolved.title;
      };
      const [start, goal] = await Promise.all([wanted(from, 'from'), wanted(to, 'to')]);
      if (start === goal) throw new Error('Awal dan tujuan tidak boleh sama.');
      await onLaunch(start, goal);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Gagal memulai balapan.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <form className="wr-pick" id="wr-pick" autoComplete="off" aria-label="Pilih rute" onSubmit={submit}>
      <h3 id="wr-pick-h">{mode === 'trial' ? 'Time trial: dari mana ke mana?' : 'Free run: dari mana ke mana?'}</h3>
      <p className="wr-pick__sub">Ketik judul artikel Wikipedia bahasa Indonesia, lalu pilih dari saran.</p>
      <div className="wr-pick__row">
        <Combo id="wr-from" label="Dari" placeholder="mis. Kucing" value={from} onChange={setFrom} />
        <span className="wr-pick__arrow" aria-hidden="true">
          →
        </span>
        <Combo id="wr-to" label="Ke" placeholder="mis. Gunung Fuji" value={to} onChange={setTo} />
      </div>
      <div className="wr-pick__acts">
        <button className="btn btn--primary" type="submit" id="wr-pick-go" disabled={busy || working}>
          {working ? 'Menyiapkan…' : 'Berangkat'}
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          id="wr-pick-swap"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          Tukar
        </button>
        <button className="btn btn--secondary" type="button" id="wr-pick-rand" onClick={() => void onRandom()}>
          Acak keduanya
        </button>
      </div>
      <p className="wr-pick__err" id="wr-pick-err" role="alert" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
