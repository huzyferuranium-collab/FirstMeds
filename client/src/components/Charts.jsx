import { useState } from 'react';
import { compact, shortDay } from '../format.js';

const W = 720;

/** Daily bars with an optional stacked second series (e.g. revenue + subsidy). */
export function DailyBars({ data, keys = ['revenue'], colors = ['var(--brand)', 'var(--accent)'], labels = [], height = 220, format = compact }) {
  const [hover, setHover] = useState(null);
  if (!data?.length) return null;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const H = height;
  const max = Math.max(1, ...data.map((d) => keys.reduce((a, k) => a + (d[k] || 0), 0)));
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(2, step * 0.7);
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const labelEvery = Math.ceil(data.length / 8);
  const h = hover != null ? data[hover] : null;
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHover(null)} role="img" aria-label="Daily chart">
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0;
          const x = pad.l + i * step + (step - bw) / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" />
              {keys.map((k, ki) => {
                const v = d[k] || 0;
                const top = y(acc + v);
                const r = <rect key={k} x={x} y={top} width={bw} height={Math.max(0, y(acc) - top)} rx={Math.min(3, bw / 3)} fill={colors[ki]} opacity={hover == null || hover === i ? 1 : 0.55} />;
                acc += v;
                return r;
              })}
              {i % labelEvery === 0 && <text className="axis" x={x + bw / 2} y={H - 8} textAnchor="middle">{shortDay(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="row between small muted" style={{ minHeight: 22 }}>
        <div className="legend">
          {keys.map((k, i) => <span key={k}><i style={{ background: colors[i] }} />{labels[i] || k}</span>)}
        </div>
        {h && <span><strong>{shortDay(h.day)}</strong> · {keys.map((k, i) => `${labels[i] || k}: ${format(h[k] || 0)}`).join(' · ')}</span>}
      </div>
    </div>
  );
}

/** Horizontal bar list. items: [{ label, value, sub }] */
export function BarList({ items, format = compact, color = 'var(--brand)' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar-row" key={it.label}>
          <span title={it.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <div className="track"><div className="fill" style={{ width: `${(it.value / max) * 100}%`, background: color }} /></div>
          <span className="right mono">{format(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut chart. items: [{ label, value, color }] */
export function Donut({ items, size = 160, format = compact }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 20, alignItems: 'center' }}>
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Breakdown">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg)" strokeWidth="22" />
        {items.map((it) => {
          const len = (it.value / total) * c;
          const el = <circle key={it.label} cx="80" cy="80" r={r} fill="none" stroke={it.color} strokeWidth="22" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((it) => (
          <div key={it.label} className="small"><span className="legend"><span><i style={{ background: it.color }} />{it.label}</span></span>
            <strong className="mono"> {format(it.value)}</strong> <span className="muted">({Math.round((it.value / total) * 100)}%)</span></div>
        ))}
      </div>
    </div>
  );
}

export const PALETTE = ['#0e7c4a', '#f5b400', '#2563a8', '#c63d3d', '#7c4ab8', '#14a3a3', '#5b6b62'];
