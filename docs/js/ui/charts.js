/* ui/charts.js — dependency-free SVG charts (line, bar, donut, sparkline). */

import { el, formatTime, formatNumber } from '../core/util.js';
import { t } from '../core/i18n.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Line chart with hover tooltips.
 * @param {Array<{value:number,label:string,ts:number}>} data
 */
export function lineChart(data, { width = 640, height = 200, format = (v) => String(v), color = 'var(--accent)', lowerIsBetter = true, ariaLabel = '' } = {}) {
  const wrap = el('div', { class: 'chart chart--line' });
  if (!data || data.length < 2) {
    wrap.appendChild(emptyChart(t('stats.noData')));
    return wrap;
  }
  const pad = { top: 16, right: 12, bottom: 26, left: 44 };
  const w = width;
  const h = height;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => pad.left + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v) => pad.top + innerH - ((v - min) / span) * innerH;

  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'chart__svg', role: 'img', 'aria-label': ariaLabel || t('stats.timeChart'), preserveAspectRatio: 'none' });

  // grid + y labels
  for (let g = 0; g <= 4; g++) {
    const gy = pad.top + (innerH / 4) * g;
    svg.appendChild(svgEl('line', { x1: pad.left, y1: gy, x2: w - pad.right, y2: gy, class: 'chart__grid' }));
    const val = max - (span / 4) * g;
    const label = svgEl('text', { x: pad.left - 8, y: gy + 4, class: 'chart__axis', 'text-anchor': 'end' });
    label.textContent = format(val);
    svg.appendChild(label);
  }

  const points = data.map((d, i) => [x(i), y(d.value)]);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${path} L${points[points.length - 1][0].toFixed(1)},${pad.top + innerH} L${points[0][0].toFixed(1)},${pad.top + innerH} Z`;

  const gradientId = `grad-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.35' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('path', { d: areaPath, fill: `url(#${gradientId})`, stroke: 'none' }));
  svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'chart__line' }));

  const bestIdx = lowerIsBetter ? values.indexOf(min) : values.indexOf(max);
  points.forEach((p, i) => {
    svg.appendChild(svgEl('circle', {
      cx: p[0], cy: p[1], r: i === bestIdx ? 5 : 3.5,
      class: i === bestIdx ? 'chart__dot chart__dot--best' : 'chart__dot',
      fill: color,
    }));
    const hit = svgEl('circle', { cx: p[0], cy: p[1], r: 12, fill: 'transparent', class: 'chart__hit', tabindex: '0' });
    hit.setAttribute('aria-label', `${data[i].label}: ${format(data[i].value)}`);
    const showTip = () => {
      tooltip.textContent = `${data[i].label} · ${format(data[i].value)}`;
      tooltip.style.opacity = '1';
      tooltip.style.left = `${(p[0] / w) * 100}%`;
      tooltip.style.top = `${(p[1] / h) * 100}%`;
    };
    const hideTip = () => { tooltip.style.opacity = '0'; };
    hit.addEventListener('mouseenter', showTip);
    hit.addEventListener('focus', showTip);
    hit.addEventListener('mouseleave', hideTip);
    hit.addEventListener('blur', hideTip);
    svg.appendChild(hit);
  });

  // x labels (first/last)
  const first = svgEl('text', { x: pad.left, y: h - 6, class: 'chart__axis', 'text-anchor': 'start' });
  first.textContent = data[0].label || '';
  const last = svgEl('text', { x: w - pad.right, y: h - 6, class: 'chart__axis', 'text-anchor': 'end' });
  last.textContent = data[data.length - 1].label || '';
  svg.append(first, last);

  const tooltip = el('span', { class: 'chart__tooltip' });
  wrap.append(svg, tooltip);
  return wrap;
}

export function barChart(data, { format = (v) => String(v), color = 'var(--accent)', ariaLabel = '' } = {}) {
  const wrap = el('div', { class: 'chart chart--bar' });
  if (!data || !data.length) { wrap.appendChild(emptyChart(t('stats.noData'))); return wrap; }
  const max = Math.max(...data.map((d) => d.value), 1);
  for (const d of data) {
    const row = el('div', { class: 'bar-row' });
    const label = el('span', { class: 'bar-row__label', text: d.label });
    const track = el('span', { class: 'bar-row__track' });
    const fill = el('span', { class: 'bar-row__fill', style: { width: `${Math.max(2, (d.value / max) * 100)}%`, background: d.color || color } });
    const value = el('span', { class: 'bar-row__value', text: format(d.value) });
    track.appendChild(fill);
    row.append(label, track, value);
    row.setAttribute('aria-label', `${d.label}: ${format(d.value)}`);
    wrap.appendChild(row);
  }
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', ariaLabel || t('stats.difficultyMix'));
  return wrap;
}

export function donutChart(segments, { size = 160, thickness = 22, centerLabel = '', centerSub = '' } = {}) {
  const wrap = el('div', { class: 'chart chart--donut' });
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) { wrap.appendChild(emptyChart(t('stats.noData'))); return wrap; }
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'chart__svg chart__svg--donut', role: 'img' });
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  for (const seg of segments) {
    const frac = seg.value / total;
    const circle = svgEl('circle', {
      cx: c, cy: c, r,
      fill: 'none',
      stroke: seg.color || 'var(--accent)',
      'stroke-width': thickness,
      'stroke-dasharray': `${(frac * circumference).toFixed(2)} ${circumference.toFixed(2)}`,
      'stroke-dashoffset': `${(-offset * circumference).toFixed(2)}`,
      transform: `rotate(-90 ${c} ${c})`,
      'stroke-linecap': 'butt',
    });
    circle.appendChild(document.createElementNS(NS, 'title')).textContent = `${seg.label}: ${seg.value}`;
    svg.appendChild(circle);
    offset += frac;
  }
  const label = svgEl('text', { x: c, y: c + 2, class: 'chart__donut-value', 'text-anchor': 'middle' });
  label.textContent = centerLabel || formatNumber(total);
  const sub = svgEl('text', { x: c, y: c + 20, class: 'chart__donut-sub', 'text-anchor': 'middle' });
  sub.textContent = centerSub;
  svg.append(label, sub);
  wrap.appendChild(svg);
  const legend = el('ul', { class: 'chart__legend' }, segments.map((s) => el('li', {}, [
    el('span', { class: 'chart__swatch', style: { background: s.color || 'var(--accent)' } }),
    el('span', { class: 'chart__legend-label', text: s.label }),
    el('strong', { text: String(s.value) }),
  ])));
  wrap.appendChild(legend);
  return wrap;
}

export function sparkline(values, { width = 120, height = 32, color = 'var(--accent)' } = {}) {
  const wrap = el('span', { class: 'sparkline' });
  if (!values || values.length < 2) return wrap;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'sparkline__svg', 'aria-hidden': 'true' });
  const pts = values.map((v, i) => [ (i / (values.length - 1)) * width, height - ((v - min) / span) * (height - 6) - 3 ]);
  svg.appendChild(svgEl('path', {
    d: pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round',
  }));
  wrap.appendChild(svg);
  return wrap;
}

/** Simple calendar heatmap (used by the daily challenge screen). */
export function calendarHeatmap(days, { weeks = 2 } = {}) {
  const wrap = el('div', { class: 'heatmap', role: 'img', 'aria-label': t('daily.calendar') });
  for (const d of days) {
    const cell = el('span', {
      class: `heatmap__cell ${d.completed ? 'is-done' : d.attempts ? 'is-tried' : ''}`,
      title: `${d.label}${d.completed ? ' ✓' : d.attempts ? ' · tried' : ''}`,
    });
    cell.textContent = d.day ? String(new Date(d.ts).getDate()) : '';
    wrap.appendChild(cell);
  }
  return wrap;
}

function emptyChart(message) {
  return el('div', { class: 'chart__empty', text: message });
}

export function starRating(stars, { max = 5, size = 'md', animate = false } = {}) {
  const wrap = el('span', { class: `stars stars--${size}`, role: 'img', 'aria-label': `${stars} / ${max}` });
  for (let i = 1; i <= max; i++) {
    const star = el('span', {
      class: `star ${i <= stars ? 'is-on' : 'is-off'}${animate ? ' star--animate' : ''}`,
      'aria-hidden': 'true',
      text: i <= stars ? '★' : '☆',
    });
    if (animate) star.style.animationDelay = `${i * 90}ms`;
    wrap.appendChild(star);
  }
  return wrap;
}

export function progressBar(ratio, { label = '', value = '', tone = 'accent' } = {}) {
  const wrap = el('div', { class: 'progress' });
  const bar = el('div', { class: `progress__fill progress__fill--${tone}`, style: { width: `${Math.max(0, Math.min(1, ratio)) * 100}%` } });
  const track = el('div', { class: 'progress__track', role: 'progressbar', 'aria-valuenow': String(Math.round(Math.min(1, Math.max(0, ratio)) * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label }, [bar]);
  wrap.appendChild(track);
  if (label || value) wrap.appendChild(el('div', { class: 'progress__meta' }, [el('span', { text: label }), el('strong', { text: value })]));
  return wrap;
}

export { formatTime };
