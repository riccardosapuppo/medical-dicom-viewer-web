import React, { useEffect, useRef, useState } from 'react';

export interface Segment {
  label: string;
  value: number;
  color: string;
  extra?: string;
}

/** Donut chart in SVG puro (nessuna dipendenza esterna). */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  size = 220,
  thickness = 34,
}: {
  segments: Segment[];
  centerValue?: string;
  centerLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const frac = total > 0 ? Math.max(0, seg.value) / total : 0;
    const dash = frac * circumference;
    const el = (
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={thickness}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#232327"
        strokeWidth={thickness}
      />
      {total > 0 && arcs}
      {centerValue !== undefined && (
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="pa-donut-center-value"
          fill="#f4f4f6"
          style={{ fontSize: 26, fontWeight: 800 }}
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x={cx}
          y={cy + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#9a9aa3"
          style={{ fontSize: 12 }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

export interface LinePoint {
  label: string;
  value: number;
}

/** Line chart in SVG con assi minimi e area sfumata. */
export function LineChart({
  points,
  color = '#e11f2e',
  height = 240,
  yUnit = '',
  formatY,
}: {
  points: LinePoint[];
  color?: string;
  height?: number;
  yUnit?: string;
  formatY?: (v: number) => string;
}) {
  const width = 640;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  if (!points.length) {
    return <div className="pa-empty">Nessun dato</div>;
  }
  const maxV = Math.max(...points.map(p => p.value), 1);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - (p.value / maxV) * innerH;
    return { x, y, p };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1].x} ${padT + innerH} L ${coords[0].x} ${padT + innerH} Z`;

  const fmt = formatY || ((v: number) => `${Math.round(v)}${yUnit ? ' ' + yUnit : ''}`);
  const gridVals = [0, 0.5, 1];
  // Etichette X a indici equidistanti (estremi inclusi), max ~9.
  const nLabels = Math.min(points.length, 9);
  const labelIdx = new Set<number>();
  for (let k = 0; k < nLabels; k++) {
    labelIdx.add(Math.round((k * (points.length - 1)) / Math.max(1, nLabels - 1)));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient
          id="pa-line-grad"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stopColor={color}
            stopOpacity="0.28"
          />
          <stop
            offset="100%"
            stopColor={color}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      {gridVals.map((g, i) => {
        const y = padT + innerH - g * innerH;
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="#232327"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#6a6a73"
              style={{ fontSize: 11 }}
            >
              {fmt(g * maxV)}
            </text>
          </g>
        );
      })}
      <path
        d={area}
        fill="url(#pa-line-grad)"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
      />
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={4}
          fill={color}
        />
      ))}
      {coords.map((c, i) => {
        // Dirada le etichette X (max ~9) e àncora quelle ai bordi per non tagliarle.
        if (!labelIdx.has(i)) {
          return null;
        }
        const anchor = c.x <= padL + 16 ? 'start' : c.x >= width - padR - 16 ? 'end' : 'middle';
        const lx = anchor === 'start' ? padL : anchor === 'end' ? width - padR : c.x;
        return (
          <text
            key={`l${i}`}
            x={lx}
            y={height - 10}
            textAnchor={anchor}
            fill="#9a9aa3"
            style={{ fontSize: 10 }}
          >
            {c.p.label}
          </text>
        );
      })}
    </svg>
  );
}

export interface Bar {
  label: string;
  value: number;
  color?: string;
  valueLabel?: string;
}

/** Bar chart verticale (colonne) in SVG.
 *  Renderizzato 1:1 sulla larghezza REALE del contenitore (ResizeObserver): niente
 *  scaling del viewBox → font a dimensione corretta ed etichette X allineate alle barre. */
export function ColumnChart({
  bars,
  color = '#e11f2e',
  height = 240,
  showValues = false,
  yAxis = false,
  formatValue,
}: {
  bars: Bar[];
  color?: string;
  height?: number;
  /** Mostra l'etichetta del valore sopra ogni colonna (usare con POCHE barre: es. previsione). */
  showValues?: boolean;
  /** Disegna asse Y con griglia e valori a sinistra (utile con molte barre, es. trend mensile). */
  yAxis?: boolean;
  /** Formattatore usato per i valori dell'asse Y e per il tooltip (se il bar non ha valueLabel). */
  formatValue?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth));
    ro.observe(el);
    setMeasured(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Larghezza reale in px (fallback 720 prima della misura). 1 unità viewBox = 1 px.
  const width = Math.max(320, measured || 720);
  const padL = yAxis ? 70 : 40;
  const padR = 14;
  const padT = showValues ? 26 : 14;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxV = Math.max(...bars.map(b => b.value), 1);
  const slot = bars.length ? innerW / bars.length : innerW;
  const barW = Math.min(slot * 0.62, 46);
  // Etichette X a STRIDE regolare: se non entrano tutte (≈50px l'una) si diradano in modo
  // UNIFORME (una ogni N), senza mai saltarne una singola in modo irregolare. Su pannello
  // largo lo stride è 1 → un'etichetta per OGNI barra (mese). L'ultimo mese è sempre mostrato.
  const maxLabels = Math.max(2, Math.floor(innerW / 46));
  const stride = Math.max(1, Math.ceil(bars.length / maxLabels));
  const labelIdx = new Set<number>();
  for (let i = 0; i < bars.length; i += stride) {
    labelIdx.add(i);
  }
  if (bars.length > 1) {
    const last = bars.length - 1;
    if (!labelIdx.has(last)) {
      // aggiunge l'ultimo mese; se il precedente etichettato è adiacente lo rimuove (no overlap)
      const prevLabeled = Math.floor(last / stride) * stride;
      if (prevLabeled === last - 1) {
        labelIdx.delete(last - 1);
      }
      labelIdx.add(last);
    }
  }
  const fmt = formatValue || ((v: number) => String(v));
  // Asse Y con "nice numbers": passo arrotondato (1/2/2.5/5 ×10ⁿ) e massimo scala
  // multiplo del passo → tacche tonde sia per valori interi (studi) che frazionari (TB).
  const niceStep = (range: number) => {
    const raw = range / 4;
    if (!(raw > 0) || !isFinite(raw)) {
      return 1;
    }
    const exp = Math.floor(Math.log10(raw));
    const base = Math.pow(10, exp);
    const f = raw / base;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * base;
  };
  const step = yAxis ? niceStep(maxV) : 0;
  const scaleMax = yAxis ? Math.max(step, Math.ceil(maxV / step) * step) : maxV;
  const yOf = (v: number) => padT + innerH - (v / scaleMax) * innerH;
  const ticks: number[] = [];
  if (yAxis) {
    const n = Math.round(scaleMax / step);
    for (let k = 0; k <= n; k++) {
      ticks.push(k * step);
    }
  }

  return (
    <div
      ref={ref}
      style={{ width: '100%' }}
    >
      {bars.length === 0 ? (
        <div className="pa-empty">Nessun dato</div>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          style={{ display: 'block', overflow: 'visible', maxWidth: '100%' }}
        >
          {/* Griglia orizzontale + valori asse Y (dietro le barre). */}
          {yAxis &&
            ticks.map((tv, k) => {
              const gy = yOf(tv);
              return (
                <g key={`tick-${k}`}>
                  <line
                    x1={padL}
                    y1={gy}
                    x2={width - padR}
                    y2={gy}
                    stroke="#26262b"
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 10}
                    y={gy + 4}
                    textAnchor="end"
                    fill="#8a8a93"
                    style={{ fontSize: 11 }}
                  >
                    {fmt(tv)}
                  </text>
                </g>
              );
            })}
          {bars.map((b, i) => {
            const rawH = (b.value / scaleMax) * innerH;
            // I mesi non-zero restano visibili con almeno 2px (altrimenti spariscono
            // quando pochi mesi recenti schiacciano la scala).
            const h = b.value > 0 ? Math.max(rawH, 2) : 0;
            const x = padL + i * slot + (slot - barW) / 2;
            const y = padT + innerH - h;
            const showLabel = labelIdx.has(i);
            const cx = x + barW / 2;
            const tip = `${b.label}: ${b.valueLabel ?? fmt(b.value)}`;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(0, h)}
                  rx={4}
                  fill={b.color || color}
                />
                {showValues && (b.valueLabel != null || b.value != null) && (
                  <text
                    x={cx}
                    y={Math.max(y - 6, 12)}
                    textAnchor="middle"
                    fill="#d7d7de"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {b.valueLabel ?? b.value}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={cx}
                    y={height - 9}
                    textAnchor="middle"
                    fill="#9a9aa3"
                    style={{ fontSize: 12 }}
                  >
                    {b.label}
                  </text>
                )}
                {/* Area di hover a piena altezza colonna: mostra il tooltip anche sulle barre minuscole. */}
                <rect
                  x={padL + i * slot}
                  y={padT}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  data-tip={tip}
                  style={{ pointerEvents: 'all' }}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Heatmap giorno-settimana (7 righe, Lun→Dom) × ora (0-23), intensità verso il rosso. */
export function Heatmap({
  cells,
}: {
  cells: { weekday: number; hour: number; studyCount: number }[];
}) {
  const days = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  (cells || []).forEach(c => {
    if (c.weekday >= 0 && c.weekday < 7 && c.hour >= 0 && c.hour < 24) {
      grid[c.weekday][c.hour] = c.studyCount;
      if (c.studyCount > max) {
        max = c.studyCount;
      }
    }
  });
  if (!cells || !cells.length) {
    return <div className="pa-empty">Nessun dato</div>;
  }
  const color = (v: number) => {
    if (v <= 0) {
      return '#1b1b1e';
    }
    const t = Math.min(1, v / (max || 1));
    const r = Math.round(40 + t * (225 - 40));
    const g = Math.round(20 + t * (31 - 20));
    const b = Math.round(24 + t * (46 - 24));
    return `rgb(${r},${g},${b})`;
  };
  const cell = 20;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            <th style={{ width: 34 }} />
            {Array.from({ length: 24 }, (_, h) => (
              <th
                key={h}
                style={{ fontSize: 9, color: '#6a6a73', fontWeight: 400, textAlign: 'center' }}
              >
                {h % 2 === 0 ? h : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, wd) => (
            <tr key={wd}>
              <td style={{ fontSize: 11, color: '#9a9aa3', paddingRight: 6, textAlign: 'right' }}>{d}</td>
              {grid[wd].map((v, h) => (
                <td
                  key={h}
                  data-tip={`${d} ${String(h).padStart(2, '0')}:00 — ${v} studi`}
                  style={{
                    width: cell,
                    height: cell,
                    minWidth: cell,
                    background: color(v),
                    borderRadius: 4,
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bar chart orizzontale (barre), utile per apparecchiature. */
export function HBarChart({
  bars,
  color = '#e11f2e',
}: {
  bars: Bar[];
  color?: string;
}) {
  if (!bars.length) {
    return <div className="pa-empty">Nessun dato</div>;
  }
  const maxV = Math.max(...bars.map(b => b.value), 1);
  return (
    // paddingRight: le etichette valore rientrano dal bordo destro così la scrollbar (overlay
    // su Windows) non le taglia quando la lista è scrollabile.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 14 }}>
      {bars.map((b, i) => (
        <div
          key={i}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div
            style={{
              flex: '0 0 150px',
              fontSize: 13,
              color: '#c8c8cf',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            data-tip={b.label}
          >
            {b.label}
          </div>
          <div style={{ flex: 1, background: '#1b1b1e', borderRadius: 6, height: 30 }}>
            <div
              style={{
                width: `${(b.value / maxV) * 100}%`,
                background: b.color || color,
                height: '100%',
                borderRadius: 6,
                minWidth: 2,
              }}
            />
          </div>
          <div
            style={{
              flex: '0 0 84px',
              fontSize: 13,
              color: '#c8c8cf',
              textAlign: 'right',
              whiteSpace: 'nowrap',
            }}
          >
            {b.valueLabel ?? b.value}
          </div>
        </div>
      ))}
    </div>
  );
}
