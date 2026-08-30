import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Panel, Kpi, StateBlock } from './components';
import { DonutChart, LineChart, ColumnChart, HBarChart, Heatmap, Segment } from './charts';
import { useApi } from './useApi';
import {
  exportCsvUrl,
  logExport,
  createPreset,
  deletePreset,
  deleteExportLog,
  changeUserPassword,
  createUser,
  deleteUser,
} from './api';
import {
  formatInt,
  formatKB,
  formatTBAdaptive,
  formatDecimal,
  formatPct,
  formatDicomDate,
  formatDicomTime,
  formatPeriodLabel,
  kbToTB,
  colorForModality,
} from './format';

export interface Period {
  label: string;
  dateFrom?: string;
  dateTo?: string;
  partition?: string; // ServerPartitionGUID selezionato (filtro globale), opzionale
}

interface ViewProps {
  period: Period;
  goTo: (view: string) => void;
  // Imposta la partizione globale (header): usato per sincronizzare i filtri partizione locali
  // con il selettore in alto (unica fonte di verità).
  setPartition?: (guid: string) => void;
}

function periodParams(period: Period): Record<string, any> {
  return { dateFrom: period.dateFrom, dateTo: period.dateTo, partition: period.partition };
}

/**
 * Costruisce l'oggetto Period da una chiave periodo ('all' | 'last12' | 'YYYY') e da una
 * partizione. Condiviso tra l'header globale e il Report builder (che lo usa in modo indipendente).
 */
export function buildPeriod(periodKey: string, partition?: string): Period {
  const part = partition || undefined;
  if (periodKey === 'last12') {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime());
    from.setFullYear(from.getFullYear() - 1);
    return {
      label: 'Ultimi 12 mesi',
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to,
      partition: part,
    };
  }
  if (/^\d{4}$/.test(periodKey)) {
    return { label: periodKey, dateFrom: `${periodKey}-01-01`, dateTo: `${periodKey}-12-31`, partition: part };
  }
  return { label: 'Tutti', partition: part };
}

/** Come buildPeriod ma gestisce anche il "Range personalizzato" (periodKey='custom' + date). */
export function periodFromConfig(cfg: any): Period {
  cfg = cfg || {};
  if (cfg.periodKey === 'custom') {
    return {
      label: cfg.dateFrom && cfg.dateTo ? `${cfg.dateFrom} → ${cfg.dateTo}` : 'Range personalizzato',
      dateFrom: cfg.dateFrom || undefined,
      dateTo: cfg.dateTo || undefined,
      partition: cfg.partition || undefined,
    };
  }
  return buildPeriod(cfg.periodKey || 'all', cfg.partition || '');
}

/**
 * Multi-select a tendina con RICERCA interna e CHECKBOX accanto a ogni voce; i valori scelti
 * sono mostrati chiaramente come chip rimovibili sotto il campo. Utile per liste lunghe (es. i
 * tipi esame) dove serve filtrare e selezionarne più d'uno.
 */
function CheckboxMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Tutti',
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const q = search.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selezionati`;
  return (
    <div
      className="pa-ms"
      ref={ref}
    >
      <button
        type="button"
        className="pa-input pa-ms-toggle"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`pa-ms-summary ${selected.length ? '' : 'pa-ms-ph'}`}>{summary}</span>
        <span className="pa-ms-caret">▾</span>
      </button>
      {selected.length > 0 && (
        <div className="pa-ms-chips">
          {selected.map(s => (
            <span
              key={s}
              className="pa-chip pa-chip-on pa-ms-chip"
              data-tip="Rimuovi"
              onClick={() => toggle(s)}
            >
              {s} <span className="pa-ms-x">✕</span>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="pa-ms-panel">
          <input
            className="pa-input pa-ms-search"
            placeholder="Cerca…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className="pa-ms-list">
            {filtered.length === 0 && <div className="pa-ms-empty">Nessun risultato</div>}
            {filtered.map(o => (
              <label
                key={o}
                className="pa-ms-item"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <div className="pa-ms-foot">
            <span>{selected.length} selezionati</span>
            {selected.length > 0 && (
              <button
                type="button"
                className="pa-ms-clear"
                onClick={() => onChange([])}
              >
                Azzera
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Date picker custom (calendario moderno, tema scuro) ---- */
function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
}
function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function displayYmd(s: string): string {
  const p = parseYmd(s);
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}` : '';
}

/** Campo data con calendario popup stilizzato (sostituisce il datepicker nativo del browser). */
function DateField({
  value,
  min,
  max,
  onChange,
  placeholder = 'gg/mm/aaaa',
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = parseYmd(value);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    if (sel) {
      return { y: sel.y, m: sel.m };
    }
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const openCal = () => {
    const s = parseYmd(value);
    if (s) {
      setView({ y: s.y, m: s.m });
    }
    setMode('days');
    setOpen(true);
  };
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ];
  const monthsShort = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const dows = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const firstDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const minP = min ? parseYmd(min) : null;
  const maxP = max ? parseYmd(max) : null;
  const asNum = (y: number, m: number, d: number) => y * 10000 + (m + 1) * 100 + d;
  const isDisabled = (d: number) => {
    const t = asNum(view.y, view.m, d);
    if (minP && t < asNum(minP.y, minP.m, minP.d)) {
      return true;
    }
    if (maxP && t > asNum(maxP.y, maxP.m, maxP.d)) {
      return true;
    }
    return false;
  };
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  const yearBlockStart = view.y - (view.y % 12);
  const headerPrev = () => {
    if (mode === 'days') {
      setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
    } else if (mode === 'months') {
      setView(v => ({ ...v, y: v.y - 1 }));
    } else {
      setView(v => ({ ...v, y: v.y - 12 }));
    }
  };
  const headerNext = () => {
    if (mode === 'days') {
      setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
    } else if (mode === 'months') {
      setView(v => ({ ...v, y: v.y + 1 }));
    } else {
      setView(v => ({ ...v, y: v.y + 12 }));
    }
  };
  const title =
    mode === 'days'
      ? `${months[view.m]} ${view.y}`
      : mode === 'months'
        ? `${view.y}`
        : `${yearBlockStart} – ${yearBlockStart + 11}`;
  // Il titolo naviga: giorni → mesi → anni (per saltare velocemente a un anno lontano).
  const onTitle = () => setMode(mode === 'days' ? 'months' : 'years');
  return (
    <div
      className="pa-datefield"
      ref={ref}
    >
      <button
        type="button"
        className="pa-input pa-datefield-toggle"
        onClick={openCal}
      >
        <span className={value ? '' : 'pa-ms-ph'}>{value ? displayYmd(value) : placeholder}</span>
        <span className="pa-datefield-icon">▦</span>
      </button>
      {open && (
        <div className="pa-cal">
          <div className="pa-cal-head">
            <button
              type="button"
              className="pa-cal-nav"
              onClick={headerPrev}
            >
              ‹
            </button>
            <button
              type="button"
              className="pa-cal-title-btn"
              data-tip="Cambia mese/anno"
              onClick={onTitle}
            >
              {title}
            </button>
            <button
              type="button"
              className="pa-cal-nav"
              onClick={headerNext}
            >
              ›
            </button>
          </div>
          {mode === 'days' && (
            <>
              <div className="pa-cal-grid pa-cal-dow">
                {dows.map(d => (
                  <span
                    key={d}
                    className="pa-cal-dowcell"
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="pa-cal-grid">
                {cells.map((d, i) =>
                  d === null ? (
                    <span key={i} />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      className={`pa-cal-day ${
                        sel && sel.y === view.y && sel.m === view.m && sel.d === d ? 'pa-cal-sel' : ''
                      }`}
                      disabled={isDisabled(d)}
                      onClick={() => {
                        onChange(toYmd(view.y, view.m, d));
                        setOpen(false);
                      }}
                    >
                      {d}
                    </button>
                  )
                )}
              </div>
            </>
          )}
          {mode === 'months' && (
            <div className="pa-cal-grid pa-cal-mg">
              {monthsShort.map((mn, mi) => (
                <button
                  key={mi}
                  type="button"
                  className={`pa-cal-cell ${
                    sel && sel.y === view.y && sel.m === mi ? 'pa-cal-sel' : ''
                  }`}
                  onClick={() => {
                    setView(v => ({ ...v, m: mi }));
                    setMode('days');
                  }}
                >
                  {mn}
                </button>
              ))}
            </div>
          )}
          {mode === 'years' && (
            <div className="pa-cal-grid pa-cal-mg">
              {Array.from({ length: 12 }, (_, k) => yearBlockStart + k).map(yr => (
                <button
                  key={yr}
                  type="button"
                  className={`pa-cal-cell ${sel && sel.y === yr ? 'pa-cal-sel' : ''}`}
                  onClick={() => {
                    setView(v => ({ ...v, y: yr }));
                    setMode('months');
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================ DASHBOARD ================================== */

export function DashboardView({ period, goTo }: ViewProps) {
  const p = periodParams(period);
  const summary = useApi<any>('/summary', p, [period.label, period.partition]);
  const yearly = useApi<any>('/storage/yearly', undefined, []);
  const modalities = useApi<any>('/modalities', p, [period.label, period.partition]);
  const partitions = useApi<any>('/partitions', p, [period.label, period.partition]);

  const s = summary.data || {};
  const partRows: any[] = (partitions.data && partitions.data.rows) || [];
  // Pannello "per partizione": con "Tutte" le mostra tutte (confronto); con una partizione
  // specifica selezionata resta ma mostra SOLO quella (/partitions restituisce sempre l'elenco
  // completo, quindi filtriamo qui in base alla selezione dell'header).
  const shownPartRows: any[] = period.partition
    ? partRows.filter((r: any) => String(r.partitionGuid) === String(period.partition))
    : partRows;

  // Crescita storage cumulata per anno (line chart).
  const growthPoints = useMemo(() => {
    const rows = (yearly.data && yearly.data.rows) || [];
    const sorted = [...rows].sort((a: any, b: any) => Number(a.anno) - Number(b.anno)).slice(-5);
    let cum = 0;
    return sorted.map((r: any) => {
      cum += r.totaleTB;
      return { label: r.anno, value: Number(cum.toFixed(2)) };
    });
  }, [yearly.data]);

  const modSegments: Segment[] = useMemo(() => {
    const rows = (modalities.data && modalities.data.rows) || [];
    return rows.slice(0, 6).map((r: any, i: number) => ({
      label: r.modality,
      value: r.storageKB,
      color: colorForModality(r.modality, i),
      extra: `${formatPct(r.weightPct)} · ${formatKB(r.storageKB)}`,
    }));
  }, [modalities.data]);

  const totalStorageKB = s.storageKB || 0;
  const growth12KB = s.growthLast12MonthsKB || 0;

  return (
    <div>
      <StateBlock
        loading={summary.loading}
        error={summary.error}
        errorBody={summary.errorBody}
      >
        <div className="pa-grid pa-kpis">
          <Kpi label="Studi" value={formatInt(s.studyCount)} />
          <Kpi label="Pazienti" value={s.patientCount == null ? '—' : formatInt(s.patientCount)} />
          <Kpi label="Serie" value={formatInt(s.seriesCount)} />
          <Kpi label="Immagini" value={formatInt(s.instanceCount)} />
          <Kpi
            label="Dati studi (PACS)"
            value={formatKB(totalStorageKB)}
            sub="somma dimensioni studi"
            accent
          />
        </div>
      </StateBlock>

      <div className="pa-grid pa-cols-3 pa-mt">
        <Panel title="Crescita storage negli ultimi anni">
          <StateBlock
            loading={yearly.loading}
            error={yearly.error}
            errorBody={yearly.errorBody}
            empty={growthPoints.length === 0}
          >
            <LineChart
              points={growthPoints}
              yUnit="TB"
              formatY={v => formatTBAdaptive(v)}
            />
          </StateBlock>
        </Panel>

        <Panel title="Distribuzione per modality">
          <StateBlock
            loading={modalities.loading}
            error={modalities.error}
            errorBody={modalities.errorBody}
            empty={modSegments.length === 0}
          >
            <div className="pa-donut-wrap">
              <DonutChart
                segments={modSegments}
                centerValue={formatKB(totalStorageKB)}
                centerLabel="Totale"
                size={200}
              />
              <div className="pa-legend">
                {modSegments.map((seg, i) => (
                  <div
                    className="pa-legend-row"
                    key={i}
                  >
                    <span
                      className="pa-legend-swatch"
                      style={{ background: seg.color }}
                    />
                    <span className="pa-legend-label">{seg.label}</span>
                    <span className="pa-legend-pct">{seg.extra}</span>
                  </div>
                ))}
              </div>
            </div>
          </StateBlock>
        </Panel>

        <Panel title="Azioni rapide">
          <div className="pa-actions">
            <button
              className="pa-action"
              onClick={() => goTo('studies')}
            >
              <b>Archivio studi</b>
              <span>Ricerca avanzata</span>
            </button>
            <button
              className="pa-action"
              onClick={() => goTo('storage')}
            >
              <b>Storage</b>
              <span>Forecast statistico</span>
            </button>
            <button
              className="pa-action"
              onClick={() => goTo('analisi')}
            >
              <b>Analisi</b>
              <span>Modalità e apparecchiature</span>
            </button>
            <button
              className="pa-action"
              onClick={() => goTo('report')}
            >
              <b>Nuovo report</b>
              <span>Excel / CSV</span>
            </button>
          </div>
        </Panel>
      </div>

      <div className="pa-grid pa-kpis pa-mt">
        <Kpi
          label="Crescita ultimi 12 mesi"
          value={formatKB(growth12KB)}
          accent
        />
        <Kpi
          label="Media giornaliera"
          value={formatKB(s.dailyGrowthKB || growth12KB / 365)}
        />
        <Kpi
          label="Media mensile"
          value={formatKB(s.monthlyGrowthKB || growth12KB / 12)}
        />
        <Kpi
          label="Studi oggi"
          value={formatInt(s.studiesToday)}
        />
        <Kpi
          label="Media per studio"
          value={formatKB(s.avgStudySizeKB)}
        />
      </div>

      {(period.partition ? shownPartRows.length > 0 : partRows.length > 1) && (
        <Panel
          title={
            period.partition ? 'Studi e storage della partizione' : 'Studi e storage per partizione'
          }
          className="pa-mt"
        >
          <StateBlock
            loading={partitions.loading}
            error={partitions.error}
            errorBody={partitions.errorBody}
            empty={shownPartRows.length === 0}
          >
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <HBarChart
                bars={shownPartRows.map((r: any) => ({
                  label: r.aeTitle || r.description || String(r.partitionGuid || '').slice(0, 8),
                  value: r.storageKB,
                  valueLabel: `${formatKB(r.storageKB)} · ${formatInt(r.studyCount)} studi`,
                }))}
              />
            </div>
          </StateBlock>
        </Panel>
      )}
    </div>
  );
}

/* ============================ ANALISI (sub-tab) ========================== */

export function AnalisiView({ period }: ViewProps) {
  const [tab, setTab] = useState<'trend' | 'modalita' | 'tipologie' | 'device' | 'temporale'>('trend');
  return (
    <div>
      <div className="pa-subtabs">
        {[
          ['trend', 'Trend storico'],
          ['modalita', 'Modality'],
          ['tipologie', 'Tipologie esami'],
          ['device', 'Apparecchiature'],
          ['temporale', 'Temporale'],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`pa-subtab ${tab === k ? 'pa-active' : ''}`}
            onClick={() => setTab(k as any)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'trend' && <TrendPanel period={period} />}
      {tab === 'modalita' && <ModalitaPanel period={period} />}
      {tab === 'tipologie' && <TipologieEsamiPanel period={period} />}
      {tab === 'device' && <DevicePanel period={period} />}
      {tab === 'temporale' && <TemporalePanel period={period} />}
    </div>
  );
}

function TipologieEsamiPanel({ period }: { period: Period }) {
  const st = useApi<any>('/study-types', periodParams(period), [period.label, period.partition]);
  const rows = (st.data && st.data.rows) || [];
  const note = st.data && st.data.note;
  // Solo display: il backend usa il sentinel 'N/D' per gli studi senza StudyDescription
  // (mantenuto perché i filtri del Report builder lo escludono). Qui lo mostriamo esteso.
  const typeLabel = (t: string) => (t === 'N/D' ? 'Esame con nessuna descrizione' : t);
  return (
    <div>
      <div className="pa-grid pa-cols-2">
        <Panel title="Top tipologie esami (per numero studi)">
          <StateBlock
            loading={st.loading}
            error={st.error}
            errorBody={st.errorBody}
            empty={rows.length === 0}
            emptyText={note || 'Nessun dato tipologie esami.'}
          >
            <HBarChart
              bars={rows.slice(0, 12).map((r: any) => ({
                label: typeLabel(r.studyType),
                value: r.studyCount,
                valueLabel: formatInt(r.studyCount),
              }))}
            />
          </StateBlock>
        </Panel>
        <Panel title="Dettaglio tipologie esami">
          <StateBlock
            loading={st.loading}
            error={st.error}
            empty={rows.length === 0}
            emptyText={note || 'Nessun dato tipologie esami.'}
          >
            <div
              className="pa-table-wrap"
              style={{ maxHeight: 420, overflowY: 'auto' }}
            >
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Tipo esame</th>
                    <th className="pa-num">Studi</th>
                    <th className="pa-num">Serie</th>
                    <th className="pa-num">Immagini</th>
                    <th className="pa-num">Storage</th>
                    <th className="pa-num">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td data-tip={typeLabel(r.studyType)}>{typeLabel(r.studyType)}</td>
                      <td className="pa-num">{formatInt(r.studyCount)}</td>
                      <td className="pa-num">{formatInt(r.seriesCount)}</td>
                      <td className="pa-num">{formatInt(r.instanceCount)}</td>
                      <td className="pa-num">{formatKB(r.storageKB)}</td>
                      <td className="pa-num">{formatKB(r.avgStudySizeKB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateBlock>
        </Panel>
      </div>
      {note && <div className="pa-note">{note}</div>}
    </div>
  );
}

function TrendPanel({ period }: { period: Period }) {
  // Solo vista mensile (nessuna select giornaliero/mensile/annuale).
  const trend = useApi<any>('/trend', { ...periodParams(period), granularity: 'month' }, [
    period.label,
    period.partition,
  ]);
  const rows = (trend.data && trend.data.rows) || [];
  const bars = rows.map((r: any) => ({
    label: formatPeriodLabel(r.period, 'month'),
    value: kbToTB(r.storageKB),
    valueLabel: formatKB(r.storageKB),
  }));

  return (
    <Panel title="Trend storage">
      <StateBlock
        loading={trend.loading}
        error={trend.error}
        errorBody={trend.errorBody}
        empty={rows.length === 0}
      >
        <ColumnChart
          bars={bars}
          yAxis
          formatValue={formatTBAdaptive}
        />
        <div
          className="pa-table-wrap pa-mt"
          style={{ maxHeight: 320, overflowY: 'auto' }}
        >
          <table className="pa-table">
            <thead>
              <tr>
                <th>Periodo</th>
                <th className="pa-num">Studi</th>
                <th className="pa-num">Pazienti</th>
                <th className="pa-num">Serie</th>
                <th className="pa-num">Immagini</th>
                <th className="pa-num">Storage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{formatPeriodLabel(r.period, 'month')}</td>
                  <td className="pa-num">{formatInt(r.studyCount)}</td>
                  <td className="pa-num">{r.patientCount == null ? '—' : formatInt(r.patientCount)}</td>
                  <td className="pa-num">{formatInt(r.seriesCount)}</td>
                  <td className="pa-num">{formatInt(r.instanceCount)}</td>
                  <td className="pa-num">{formatKB(r.storageKB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StateBlock>
    </Panel>
  );
}

function ModalitaPanel({ period }: { period: Period }) {
  const mod = useApi<any>('/modalities', periodParams(period), [period.label, period.partition]);
  const rows = (mod.data && mod.data.rows) || [];
  const totalKB = rows.reduce((s: number, r: any) => s + r.storageKB, 0);
  const segments: Segment[] = rows.slice(0, 8).map((r: any, i: number) => ({
    label: r.modality,
    value: r.storageKB,
    color: colorForModality(r.modality, i),
    extra: `${formatPct(r.weightPct)} · ${formatKB(r.storageKB)}`,
  }));

  return (
    <div>
      <div className="pa-grid pa-cols-2">
        <Panel title="Distribuzione storage per modality">
          <StateBlock
            loading={mod.loading}
            error={mod.error}
            errorBody={mod.errorBody}
            empty={rows.length === 0}
          >
            <div className="pa-donut-wrap">
              <DonutChart
                segments={segments}
                centerValue={formatKB(totalKB)}
                centerLabel="Totale"
                size={210}
              />
              <div className="pa-legend">
                {segments.map((seg, i) => (
                  <div
                    className="pa-legend-row"
                    key={i}
                  >
                    <span
                      className="pa-legend-swatch"
                      style={{ background: seg.color }}
                    />
                    <span className="pa-legend-label">{seg.label}</span>
                    <span className="pa-legend-pct">{seg.extra}</span>
                  </div>
                ))}
              </div>
            </div>
          </StateBlock>
        </Panel>
        <Panel title="Peso per modality">
          <StateBlock
            loading={mod.loading}
            error={mod.error}
            empty={rows.length === 0}
          >
            <HBarChart
              bars={rows.slice(0, 8).map((r: any, i: number) => ({
                label: r.modality,
                value: r.storageKB,
                color: colorForModality(r.modality, i),
                valueLabel: formatKB(r.storageKB),
              }))}
            />
          </StateBlock>
        </Panel>
      </div>

      <Panel
        title="Dettaglio per modality"
        className="pa-mt"
      >
        <StateBlock
          loading={mod.loading}
          error={mod.error}
          empty={rows.length === 0}
        >
          <div className="pa-table-wrap">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Modality</th>
                  <th className="pa-num">Studi</th>
                  <th className="pa-num">Immagini</th>
                  <th className="pa-num">Storage</th>
                  <th className="pa-num">Media per studio</th>
                  <th className="pa-num">Peso %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.modality}</td>
                    <td className="pa-num">{formatInt(r.studyCount)}</td>
                    <td className="pa-num">{formatInt(r.instanceCount)}</td>
                    <td className="pa-num">{formatKB(r.storageKB)}</td>
                    <td className="pa-num">{formatKB(r.avgStudySizeKB)}</td>
                    <td className="pa-num">{formatPct(r.weightPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateBlock>
      </Panel>
    </div>
  );
}

function DevicePanel({ period }: { period: Period }) {
  const dev = useApi<any>('/devices', periodParams(period), [period.label, period.partition]);
  const rows = (dev.data && dev.data.rows) || [];
  const note = dev.data && dev.data.note;

  return (
    <div>
      <div className="pa-grid pa-cols-2">
        <Panel title="Storage per apparecchiatura">
          <StateBlock
            loading={dev.loading}
            error={dev.error}
            errorBody={dev.errorBody}
            empty={rows.length === 0}
            emptyText={note || 'Nessun dato apparecchiature.'}
          >
            <HBarChart
              bars={rows.slice(0, 10).map((r: any) => ({
                label: r.device,
                value: kbToTB(r.storageKB),
                valueLabel: formatKB(r.storageKB),
              }))}
            />
          </StateBlock>
        </Panel>
        <Panel title="Dettaglio apparecchiature">
          <StateBlock
            loading={dev.loading}
            error={dev.error}
            empty={rows.length === 0}
            emptyText={note || 'Nessun dato apparecchiature.'}
          >
            <div
              className="pa-table-wrap"
              style={{ maxHeight: 420, overflowY: 'auto' }}
            >
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Apparecchiatura</th>
                    <th>Mod.</th>
                    <th className="pa-num">Studi</th>
                    <th className="pa-num">Storage</th>
                    <th className="pa-num">Media</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, i: number) => (
                    <tr key={i}>
                      <td data-tip={r.device}>{r.device}</td>
                      <td>{r.modality}</td>
                      <td className="pa-num">{formatInt(r.studyCount)}</td>
                      <td className="pa-num">{formatKB(r.storageKB)}</td>
                      <td className="pa-num">{formatKB(r.avgStudySizeKB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateBlock>
        </Panel>
      </div>
      {note && <div className="pa-note">{note}</div>}
    </div>
  );
}

function TemporalePanel({ period }: { period: Period }) {
  const trend = useApi<any>('/trend', { ...periodParams(period), granularity: 'month' }, [
    period.label,
    period.partition,
  ]);
  const summary = useApi<any>('/summary', periodParams(period), [period.label, period.partition]);
  const heatmap = useApi<any>('/heatmap', periodParams(period), [period.label, period.partition]);
  const rows = (trend.data && trend.data.rows) || [];
  const s = summary.data || {};
  const cells = (heatmap.data && heatmap.data.cells) || [];
  const heatNote = heatmap.data && heatmap.data.note;
  const bars = rows.map((r: any) => ({
    label: formatPeriodLabel(r.period, 'month'),
    value: r.studyCount,
    valueLabel: `${formatInt(r.studyCount)} studi`,
  }));

  return (
    <div>
      {/* Riga 1: andamento mensile a LARGHEZZA PIENA (etichette/numeri non più compressi). */}
      <Panel title="Andamento mensile (numero studi)">
        <StateBlock
          loading={trend.loading}
          error={trend.error}
          errorBody={trend.errorBody}
          empty={rows.length === 0}
        >
          <ColumnChart
            bars={bars}
            yAxis
            formatValue={formatInt}
          />
        </StateBlock>
      </Panel>
      {/* Riga 2: KPI temporali + Heatmap affiancati (pa-mt per lo stacco dalla riga sopra). */}
      <div className="pa-grid pa-cols-2 pa-mt">
        <Panel title="KPI temporali">
          <StateBlock
            loading={summary.loading}
            error={summary.error}
          >
            <div className="pa-grid pa-kpis">
              <Kpi
                label="Studi totali"
                value={formatInt(s.studyCount)}
                small
              />
              <Kpi
                label="Storage totale"
                value={formatKB(s.storageKB)}
                small
              />
              <Kpi
                label="Pazienti totali"
                value={s.patientCount == null ? '—' : formatInt(s.patientCount)}
                small
              />
              <Kpi
                label="Media per studio"
                value={formatKB(s.avgStudySizeKB)}
                small
              />
            </div>
          </StateBlock>
        </Panel>
        <Panel title="Heatmap attività — giorno della settimana × ora">
          <StateBlock
            loading={heatmap.loading}
            error={heatmap.error}
            empty={cells.length === 0}
            emptyText={heatNote || 'Nessun dato orario (StudyTime non valorizzata).'}
          >
            <Heatmap cells={cells} />
          </StateBlock>
          <div className="pa-note">
            Intensità = numero di studi eseguiti in quella fascia oraria (StudyDate + StudyTime).
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================ ARCHIVIO STUDI ============================= */

export function StudiesView({ period }: ViewProps) {
  // La partizione è gestita SOLO dal selettore globale in alto (period.partition), che filtra
  // studi e opzioni: qui non c'è una select partizione locale.
  const [filters, setFilters] = useState<any>({
    device: '',
    accession: '',
    patient: '',
    studyUid: '',
  });
  // Modality: multiselect a chip; Tipo esame: multiselect a tendina con ricerca (più valori
  // esatti → filtro IN lato server; inviati come JSON perché i nomi possono contenere virgole).
  const [modalitySel, setModalitySel] = useState<string[]>([]);
  const [descSel, setDescSel] = useState<string[]>([]);
  const [applied, setApplied] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const bump = () => {
    setPage(1);
    setApplied(a => a + 1);
  };
  const toggleMod = (m: string) => {
    setModalitySel(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]));
    bump();
  };

  // Opzioni dei filtri (Modality, Tipo esame, Apparecchiatura) prepopolate dai dati e FILTRATE
  // dalla partizione selezionata in alto: i tre endpoint applicano il filtro partizione
  // (buildDateWhere), quindi la lista riflette ciò che è presente nella partizione scelta.
  const optParams = periodParams(period);
  const modalitiesApi = useApi<any>('/modalities', optParams, [period.label, period.partition]);
  const modalityOptions: string[] = ((modalitiesApi.data && modalitiesApi.data.rows) || [])
    .map((r: any) => r.modality)
    .filter((m: string) => m && m !== 'N/D');
  const devicesApi = useApi<any>('/devices', optParams, [period.label, period.partition]);
  const deviceOptions: string[] = ((devicesApi.data && devicesApi.data.rows) || [])
    .map((r: any) => r.device)
    .filter((dv: string) => dv && dv !== 'NON RICONOSCIUTA');
  const typesApi = useApi<any>('/study-types', optParams, [period.label, period.partition]);
  const typeOptions: string[] = ((typesApi.data && typesApi.data.rows) || [])
    .map((r: any) => r.studyType)
    .filter((t: string) => t && t !== 'N/D')
    .slice(0, 400);

  const params = useMemo(
    () => ({
      ...periodParams(period),
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      modality: modalitySel.length ? modalitySel.join(',') : undefined,
      description: descSel.length ? JSON.stringify(descSel) : undefined,
      page,
      pageSize,
    }),
    [period.label, period.partition, applied, page] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const studies = useApi<any>('/studies', params, [period.label, period.partition, applied, page]);
  const rows = (studies.data && studies.data.rows) || [];
  const total = (studies.data && studies.data.totalCount) || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setField = (k: string, v: string) => setFilters((f: any) => ({ ...f, [k]: v }));
  const doSearch = () => {
    setPage(1);
    setApplied(a => a + 1);
  };

  const csvHref = exportCsvUrl({
    ...periodParams(period),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    modality: modalitySel.length ? modalitySel.join(',') : undefined,
    description: descSel.length ? JSON.stringify(descSel) : undefined,
  });

  return (
    <div>
      <Panel>
        <div className="pa-filters">
          <div className="pa-field">
            <label>Accession</label>
            <input
              className="pa-input"
              value={filters.accession}
              onChange={e => setField('accession', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
          </div>
          <div className="pa-field">
            <label>Paziente</label>
            <input
              className="pa-input"
              value={filters.patient}
              onChange={e => setField('patient', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
          </div>
          <div className="pa-field">
            <label>Apparecchiatura</label>
            <select
              className="pa-input"
              value={filters.device}
              onChange={e => {
                setField('device', e.target.value);
                setPage(1);
                setApplied(a => a + 1);
              }}
            >
              <option value="">Tutte</option>
              {deviceOptions.map((dv: string) => (
                <option
                  key={dv}
                  value={dv}
                >
                  {dv}
                </option>
              ))}
            </select>
          </div>
          <div className="pa-field">
            <label>Study UID</label>
            <input
              className="pa-input"
              value={filters.studyUid}
              onChange={e => setField('studyUid', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
          </div>
          <div className="pa-field">
            <label>&nbsp;</label>
            <button
              className="pa-btn pa-btn-red"
              onClick={doSearch}
            >
              Cerca
            </button>
          </div>
          <div
            className="pa-field"
            style={{ gridColumn: '1 / -1' }}
          >
            <label>Tipo esame (uno o più — cerca e spunta)</label>
            <CheckboxMultiSelect
              options={typeOptions}
              selected={descSel}
              placeholder="Tutti"
              onChange={next => {
                setDescSel(next);
                bump();
              }}
            />
          </div>
          <div
            className="pa-field"
            style={{ gridColumn: '1 / -1' }}
          >
            <label>Modality (una o più — vuoto = tutte)</label>
            <div className="pa-chips">
              {modalityOptions.length === 0 && <span className="pa-note">Nessuna modalità</span>}
              {modalityOptions.map((m: string) => (
                <button
                  type="button"
                  key={m}
                  className={`pa-chip ${modalitySel.includes(m) ? 'pa-chip-on' : ''}`}
                  onClick={() => toggleMod(m)}
                >
                  {m}
                </button>
              ))}
              {modalitySel.length > 0 && (
                <button
                  type="button"
                  className="pa-chip"
                  data-tip="Azzera modality"
                  onClick={() => {
                    setModalitySel([]);
                    setPage(1);
                    setApplied(a => a + 1);
                  }}
                >
                  ✕ azzera
                </button>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Risultati"
        className="pa-mt"
        right={
          <a
            className="pa-btn pa-btn-ghost"
            href={csvHref}
            target="_blank"
            rel="noreferrer"
          >
            ⇩ Esporta CSV
          </a>
        }
      >
        <StateBlock
          loading={studies.loading}
          error={studies.error}
          errorBody={studies.errorBody}
          empty={rows.length === 0}
          emptyText="Nessuno studio per i filtri selezionati."
        >
          <div className="pa-table-wrap">
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Accession</th>
                  <th>Data</th>
                  <th>Paziente</th>
                  <th>Tipo esame</th>
                  <th>Mod.</th>
                  <th className="pa-num">Serie</th>
                  <th className="pa-num">Immagini</th>
                  <th className="pa-num">Dimensione</th>
                  <th>Apparecchiatura</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.accessionNumber}</td>
                    <td>
                      {formatDicomDate(r.studyDate)} {formatDicomTime(r.studyTime)}
                    </td>
                    <td>{r.patientName}</td>
                    <td data-tip={r.studyDescription}>{r.studyDescription}</td>
                    <td>{r.modality}</td>
                    <td className="pa-num">{formatInt(r.seriesCount)}</td>
                    <td className="pa-num">{formatInt(r.instanceCount)}</td>
                    <td className="pa-num">{formatKB(r.studySizeKB)}</td>
                    <td data-tip={r.sourceDevice}>{r.sourceDevice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
            }}
          >
            <span style={{ color: 'var(--pa-text-muted)', fontSize: 13 }}>
              {formatInt(total)} studi · pagina {page} di {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="pa-btn pa-btn-ghost"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ← Prec
              </button>
              <button
                className="pa-btn pa-btn-ghost"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Succ →
              </button>
            </div>
          </div>
        </StateBlock>
      </Panel>
    </div>
  );
}

/* ============================ STORAGE =================================== */

export function StorageView(_props: ViewProps) {
  const storage = useApi<any>('/storage', undefined, []);
  const d = storage.data || {};
  const history = d.history || [];
  const forecast = d.forecast || [];

  const usedPct = d.usedPct;
  const donutSegments: Segment[] =
    d.capacityTB != null
      ? [
          { label: 'Occupato', value: d.occupiedTB, color: '#e11f2e' },
          { label: 'Disponibile', value: Math.max(0, d.availableTB), color: '#2f2f34' },
        ]
      : [{ label: 'Occupato', value: d.occupiedTB || 1, color: '#e11f2e' }];

  const cumulativePoints = useMemo(() => {
    return history.map((h: any) => ({ label: h.anno, value: h.finaleTB }));
  }, [history]);

  return (
    <div>
      <div className="pa-grid pa-cols-2">
        <Panel title="Storage totale">
          <StateBlock
            loading={storage.loading}
            error={storage.error}
            errorBody={storage.errorBody}
          >
            <div className="pa-donut-wrap">
              <DonutChart
                segments={donutSegments}
                centerValue={usedPct != null ? `${formatDecimal(usedPct, 0)}%` : formatTBAdaptive(d.occupiedTB)}
                centerLabel={usedPct != null ? 'Utilizzato' : 'Occupato'}
                size={210}
              />
              <div className="pa-legend">
                <div className="pa-legend-row">
                  <span className="pa-legend-label">Totale</span>
                  <span className="pa-legend-pct">
                    {d.capacityTB != null ? formatTBAdaptive(d.capacityTB) : 'n/d'}
                  </span>
                </div>
                <div className="pa-legend-row">
                  <span className="pa-legend-label">Occupato</span>
                  <span className="pa-legend-pct">{formatTBAdaptive(d.occupiedTB)}</span>
                </div>
                <div className="pa-legend-row">
                  <span className="pa-legend-label">Disponibile</span>
                  <span className="pa-legend-pct">
                    {d.availableTB != null ? formatTBAdaptive(d.availableTB) : 'n/d'}
                  </span>
                </div>
                {d.pacsDataTB != null && (
                  <div className="pa-legend-row">
                    <span className="pa-legend-label">di cui dati PACS</span>
                    <span className="pa-legend-pct">{formatTBAdaptive(d.pacsDataTB)}</span>
                  </div>
                )}
              </div>
            </div>
            {d.capacitySource === 'disk' && (
              <div className="pa-note">Capacità rilevata automaticamente dallo spazio del disco.</div>
            )}
            {d.capacityTB == null && (
              <div className="pa-note">
                Spazio del disco non rilevabile in questo momento: viene mostrato solo lo spazio
                occupato dai dati PACS.
              </div>
            )}
          </StateBlock>
        </Panel>

        <Panel title="Andamento storage (cumulato per anno)">
          <StateBlock
            loading={storage.loading}
            error={storage.error}
            empty={cumulativePoints.length === 0}
          >
            <LineChart
              points={cumulativePoints}
              yUnit="TB"
              formatY={v => formatTBAdaptive(v)}
            />
          </StateBlock>
        </Panel>
      </div>

      <div className="pa-grid pa-cols-2 pa-mt">
        <Panel title="Storico storage">
          <StateBlock
            loading={storage.loading}
            error={storage.error}
            empty={history.length === 0}
          >
            <div className="pa-table-wrap">
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Anno</th>
                    <th className="pa-num">Iniziale</th>
                    <th className="pa-num">Finale</th>
                    <th className="pa-num">Incremento</th>
                    <th className="pa-num">Crescita</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any, i: number) => (
                    <tr key={i}>
                      <td>{h.anno}</td>
                      <td className="pa-num">{formatTBAdaptive(h.inizialeTB)}</td>
                      <td className="pa-num">{formatTBAdaptive(h.finaleTB)}</td>
                      <td className="pa-num">{formatTBAdaptive(h.incrementoTB)}</td>
                      <td className="pa-num">{h.crescitaPct == null ? '—' : formatPct(h.crescitaPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateBlock>
        </Panel>

        <Panel title="Previsione storage (statistica, senza AI)">
          <StateBlock
            loading={storage.loading}
            error={storage.error}
            empty={forecast.length === 0}
          >
            <ColumnChart
              bars={forecast.map((f: any) => ({
                label: f.anno,
                value: f.previstoTB,
                valueLabel: formatTBAdaptive(f.previstoTB),
              }))}
              showValues
            />
            <div className="pa-note">
              Proiezione basata sul tasso di crescita medio degli ultimi anni (nessun modello AI).
            </div>
          </StateBlock>
        </Panel>
      </div>
    </div>
  );
}

/* ============================ REPORT BUILDER ============================ */

// Le chiavi corrispondono 1:1 alle colonne del CSV lato server (studiesToCsv).
const REPORT_FIELDS = [
  { key: 'partition', label: 'Partizione', def: true },
  { key: 'accession', label: 'Accession Number', def: true },
  { key: 'studyUid', label: 'Study Instance UID', def: true },
  { key: 'date', label: 'Data / Ora esecuzione', def: true },
  { key: 'patient', label: 'Paziente', def: true },
  { key: 'description', label: 'Tipo esame', def: true },
  { key: 'modality', label: 'Modality', def: true },
  { key: 'series', label: 'Numero serie', def: true },
  { key: 'instances', label: 'Numero immagini', def: true },
  { key: 'size', label: 'Dimensione studio', def: true },
  { key: 'device', label: 'Apparecchiatura / AET', def: true },
];

export function ReportView(_props: ViewProps) {
  // Il Report builder è INDIPENDENTE dai selettori globali dell'header: ha proprie select
  // Periodo e Partizione (locali). Così puoi generare un export con un taglio diverso da quello
  // mostrato nelle altre sezioni, senza modificarne lo stato.
  const [name, setName] = useState('Report PACS');
  const [repPeriodKey, setRepPeriodKey] = useState('all');
  const [repDateFrom, setRepDateFrom] = useState('');
  const [repDateTo, setRepDateTo] = useState('');
  const [repPartition, setRepPartition] = useState('');
  const [modalities, setModalities] = useState<string[]>([]);
  const [descSel, setDescSel] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, boolean>>(
    Object.fromEntries(REPORT_FIELDS.map(f => [f.key, f.def]))
  );
  const repPeriod = useMemo(
    () =>
      periodFromConfig({
        periodKey: repPeriodKey,
        dateFrom: repDateFrom,
        dateTo: repDateTo,
        partition: repPartition,
      }),
    [repPeriodKey, repDateFrom, repDateTo, repPartition]
  );

  // Anni disponibili per il selettore periodo locale.
  const yearlyApi = useApi<any>('/storage/yearly', undefined, []);
  const years: string[] = ((yearlyApi.data && yearlyApi.data.rows) || [])
    .map((r: any) => String(r.anno))
    .filter((y: string) => /^\d{4}$/.test(y))
    .sort((a: string, b: string) => Number(b) - Number(a));

  // Opzioni filtri (Modality/Tipo esame) prepopolate e coerenti col periodo/partizione LOCALI.
  const optParams = periodParams(repPeriod);
  const modApi = useApi<any>('/modalities', optParams, [repPeriod.label, repPeriod.partition]);
  const modalityOptions: string[] = ((modApi.data && modApi.data.rows) || [])
    .map((r: any) => r.modality)
    .filter((m: string) => m && m !== 'N/D');
  const typesApi = useApi<any>('/study-types', optParams, [repPeriod.label, repPeriod.partition]);
  const typeOptions: string[] = ((typesApi.data && typesApi.data.rows) || [])
    .map((r: any) => r.studyType)
    .filter((t: string) => t && t !== 'N/D')
    .slice(0, 300);
  const toggleMod = (m: string) =>
    setModalities(prev => (prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]));

  const partApi = useApi<any>('/partitions', undefined, []);
  const partitionRows: any[] = (partApi.data && partApi.data.rows) || [];

  // Range personalizzato: servono ENTRAMBE le date, altrimenti non si genera/salva.
  const rangeIncomplete = repPeriodKey === 'custom' && (!repDateFrom || !repDateTo);

  const generate = () => {
    if (rangeIncomplete) {
      return;
    }
    const selectedFields = REPORT_FIELDS.filter(f => fields[f.key]).map(f => f.key);
    // Config completa: memorizzata nello storico così l'export è RI-GENERABILE (nessun file
    // salvato sul server) e ne restano tutti i dettagli (colonne, filtri, periodo…).
    const cfg = {
      periodKey: repPeriodKey,
      dateFrom: repDateFrom || '',
      dateTo: repDateTo || '',
      partition: repPartition || '',
      modality: modalities,
      description: descSel,
      fields: selectedFields,
    };
    const params = {
      ...periodParams(repPeriod),
      modality: modalities.length ? modalities.join(',') : undefined,
      description: descSel.length ? JSON.stringify(descSel) : undefined,
      fields: selectedFields.length ? selectedFields.join(',') : undefined,
      name: name || undefined,
    };
    window.open(exportCsvUrl(params), '_blank');
    logExport({
      name,
      format: 'CSV',
      period: repPeriod.label,
      partition: repPartition || undefined,
      config: cfg,
    });
  };

  const [presetMsg, setPresetMsg] = useState<string | null>(null);
  const savePreset = async () => {
    if (rangeIncomplete) {
      setPresetMsg('Per il range personalizzato indica sia la data di inizio sia quella di fine.');
      return;
    }
    const selectedFields = REPORT_FIELDS.filter(f => fields[f.key]).map(f => f.key);
    try {
      await createPreset({
        name: name || 'Preset',
        config: {
          periodKey: repPeriodKey,
          dateFrom: repDateFrom || '',
          dateTo: repDateTo || '',
          partition: repPartition || '',
          modality: modalities,
          description: descSel,
          fields: selectedFields,
        },
      });
      setPresetMsg('Preset salvato: lo trovi nel Centro Download.');
    } catch (e: any) {
      setPresetMsg((e && e.message) || 'Impossibile salvare il preset in questo momento.');
    }
  };

  return (
    <div className="pa-grid pa-cols-2">
      <Panel title="Crea nuovo report">
        <div className="pa-field">
          <label>Nome report</label>
          <input
            className="pa-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div
          className="pa-field"
          style={{ marginTop: 12 }}
        >
          <label>Periodo</label>
          <select
            className="pa-input"
            value={repPeriodKey}
            onChange={e => setRepPeriodKey(e.target.value)}
          >
            <option value="all">Tutti</option>
            <option value="last12">Ultimi 12 mesi</option>
            <option value="custom">Range personalizzato…</option>
            {years.map(y => (
              <option
                key={y}
                value={y}
              >
                {y}
              </option>
            ))}
          </select>
        </div>
        {repPeriodKey === 'custom' && (
          <div
            className="pa-field"
            style={{ marginTop: 12 }}
          >
            <label>Intervallo date (dal / al)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <DateField
                  value={repDateFrom}
                  max={repDateTo || undefined}
                  onChange={setRepDateFrom}
                  placeholder="Data inizio"
                />
              </div>
              <span style={{ color: 'var(--pa-text-muted)' }}>→</span>
              <div style={{ flex: 1 }}>
                <DateField
                  value={repDateTo}
                  min={repDateFrom || undefined}
                  onChange={setRepDateTo}
                  placeholder="Data fine"
                />
              </div>
            </div>
            {rangeIncomplete && (
              <div className="pa-note">Indica sia la data di inizio sia quella di fine.</div>
            )}
          </div>
        )}
        {partitionRows.length > 0 && (
          <div
            className="pa-field"
            style={{ marginTop: 12 }}
          >
            <label>Partizione</label>
            <select
              className="pa-input"
              value={repPartition}
              onChange={e => setRepPartition(e.target.value)}
            >
              <option value="">Tutte</option>
              {partitionRows.map((pr: any) => (
                <option
                  key={pr.partitionGuid}
                  value={pr.partitionGuid}
                >
                  {pr.aeTitle || pr.description || String(pr.partitionGuid || '').slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div
          className="pa-field"
          style={{ marginTop: 12 }}
        >
          <label>Tipo esame (uno o più — cerca e spunta)</label>
          <CheckboxMultiSelect
            options={typeOptions}
            selected={descSel}
            placeholder="Tutti"
            onChange={setDescSel}
          />
        </div>
        <div
          className="pa-field"
          style={{ marginTop: 12 }}
        >
          <label>Modality (una o più — vuoto = tutte)</label>
          <div className="pa-chips">
            {modalityOptions.length === 0 && (
              <span className="pa-note">Nessuna modalità disponibile.</span>
            )}
            {modalityOptions.map(m => (
              <button
                type="button"
                key={m}
                className={`pa-chip ${modalities.includes(m) ? 'pa-chip-on' : ''}`}
                onClick={() => toggleMod(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {modalities.length > 0 && (
            <div className="pa-note">Selezionate: {modalities.join(', ')}</div>
          )}
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="pa-btn pa-btn-red"
            onClick={generate}
            disabled={rangeIncomplete}
          >
            Genera report CSV
          </button>
          <button
            className="pa-btn pa-btn-ghost"
            onClick={savePreset}
            disabled={rangeIncomplete}
            data-tip="Salva questa configurazione come preset riutilizzabile nel Centro Download"
          >
            ★ Salva come preset
          </button>
        </div>
        {presetMsg && <div className="pa-note">{presetMsg}</div>}
        <div className="pa-note">
          Il Report builder <b>compone un export su misura</b> (periodo, partizione, modalità,
          tipo esame, colonne) e lo genera in CSV. Con <b>«Salva come preset»</b> memorizzi la
          configurazione: la ritrovi nel <b>Centro Download</b> per riscaricarla con un clic.
          Ogni generazione viene registrata nello storico (su database).
        </div>
      </Panel>

      <Panel title="Campi disponibili">
        <div className="pa-checkgrid">
          {REPORT_FIELDS.map(f => (
            <label
              className="pa-check"
              key={f.key}
            >
              <input
                type="checkbox"
                checked={!!fields[f.key]}
                onChange={e => setFields(s => ({ ...s, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div
          className="pa-rules pa-mt"
          style={{ marginTop: 18 }}
        >
          <b>Regole export</b>
          <ul>
            <li>Export sincrono fino al tetto configurato (PACS_ANALYTICS_EXPORT_MAX_ROWS).</li>
            <li>CSV con separatore «;» e BOM UTF-8 per compatibilità Excel.</li>
            <li>Le colonne del CSV rispecchiano i campi selezionati qui a fianco (se non ne spunti
              nessuno, vengono incluse tutte).</li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}

/* ============================ CENTRO DOWNLOAD ========================== */

/** Elenco leggibile delle colonne di un preset (etichette dei campi selezionati). */
function presetCols(cfg: any): string {
  const fs = cfg && cfg.fields;
  if (!fs || !fs.length) {
    return 'tutte';
  }
  const byKey: Record<string, string> = Object.fromEntries(REPORT_FIELDS.map(f => [f.key, f.label]));
  return fs.map((k: string) => byKey[k] || k).join(', ');
}

/**
 * Riepilogo a righe (una voce per riga) della configurazione di un preset/export: mostra SEMPRE
 * Periodo, Partizione, Modality, Tipo esame e Colonne, con "Tutte"/"Tutti" quando non è stato
 * selezionato nulla di specifico. Usato sia per i preset sia per lo storico.
 */
function ConfigSummary({ cfg, partName }: { cfg: any; partName: (g?: string) => string }) {
  cfg = cfg || {};
  const periodo =
    cfg.periodKey === 'custom'
      ? cfg.dateFrom && cfg.dateTo
        ? `${cfg.dateFrom} → ${cfg.dateTo}`
        : 'Range personalizzato'
      : cfg.periodKey === 'last12'
        ? 'Ultimi 12 mesi'
        : /^\d{4}$/.test(cfg.periodKey || '')
          ? cfg.periodKey
          : 'Tutti';
  const partizione = cfg.partition ? partName(cfg.partition) : 'Tutte';
  const modalita = cfg.modality && cfg.modality.length ? cfg.modality.join(', ') : 'Tutte';
  const descArr = Array.isArray(cfg.description)
    ? cfg.description
    : cfg.description
      ? [String(cfg.description)]
      : [];
  const tipoEsame = descArr.length ? descArr.join(', ') : 'Tutti';
  const rows: [string, string][] = [
    ['Periodo', periodo],
    ['Partizione', partizione],
    ['Modality', modalita],
    ['Tipo esame', tipoEsame],
    ['Colonne', presetCols(cfg)],
  ];
  return (
    <div className="pa-cfgsum">
      {rows.map(([k, v]) => (
        <div
          className="pa-cfgsum-row"
          key={k}
        >
          <span className="pa-cfgsum-k">{k}</span>
          <span className="pa-cfgsum-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Modale di conferma (usata prima delle eliminazioni). Click sullo sfondo = Annulla. */
function ConfirmDialog({
  text,
  onCancel,
  onConfirm,
  confirmLabel = 'Elimina',
  busyLabel = 'Eliminazione…',
}: {
  text: string;
  onCancel: () => void;
  /** Può essere async: il modale resta aperto con lo spinner finché la Promise non si risolve. */
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const handleConfirm = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="pa-modal-overlay"
      onMouseDown={() => {
        if (!busy) {
          onCancel();
        }
      }}
    >
      <div
        className="pa-modal"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="pa-modal-title">Conferma eliminazione</div>
        <div className="pa-modal-body">{text}</div>
        <div className="pa-modal-actions">
          <button
            className="pa-btn pa-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            className="pa-btn pa-btn-red"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? (
              <span className="pa-btn-busy">
                <span
                  className="pa-spinner-sm"
                  aria-hidden="true"
                />
                {busyLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DownloadView(_props: ViewProps) {
  // Storico e preset sono persistiti sul DATABASE collegato (condivisi tra tutte le postazioni),
  // non più nel browser. Le tabelle vengono create automaticamente al primo utilizzo.
  const logApi = useApi<any>('/export-log', { limit: 100 }, []);
  const presetsApi = useApi<any>('/presets', undefined, []);
  const partApi = useApi<any>('/partitions', undefined, []);
  const partitionRows: any[] = (partApi.data && partApi.data.rows) || [];
  const partName = (guid?: string) => {
    if (!guid) {
      return 'Tutte';
    }
    const p = partitionRows.find((r: any) => String(r.partitionGuid) === String(guid));
    return p ? p.aeTitle || p.description || 'Partizione' : 'Partizione';
  };
  const history: any[] = (logApi.data && logApi.data.rows) || [];
  const presets: any[] = (presetsApi.data && presetsApi.data.rows) || [];

  // Rigenera un export dalla sua config (nessun file è salvato sul server: si ricostruisce la
  // stessa richiesta CSV con le stesse identiche opzioni). Usata da preset e da storico.
  const runExport = async (nm: string, cfg: any) => {
    cfg = cfg || {};
    const p = periodFromConfig(cfg);
    const descArr = Array.isArray(cfg.description)
      ? cfg.description
      : cfg.description
        ? [String(cfg.description)]
        : [];
    const params = {
      ...periodParams(p),
      modality: cfg.modality && cfg.modality.length ? cfg.modality.join(',') : undefined,
      description: descArr.length ? JSON.stringify(descArr) : undefined,
      fields: cfg.fields && cfg.fields.length ? cfg.fields.join(',') : undefined,
      name: nm,
    };
    window.open(exportCsvUrl(params), '_blank');
    await logExport({ name: nm, format: 'CSV', period: p.label, partition: cfg.partition || undefined, config: cfg });
    logApi.reload();
  };
  const downloadPreset = (preset: any) => runExport(preset.name, preset.config);
  const downloadLog = (entry: any) => runExport(entry.name, entry.config);
  const removePreset = async (id: number) => {
    try {
      await deletePreset(id);
      presetsApi.reload();
    } catch (_) {
      /* ignora */
    }
  };
  const removeLog = async (id: number) => {
    try {
      await deleteExportLog(id);
      logApi.reload();
    } catch (_) {
      /* ignora */
    }
  };

  // Conferma eliminazione: nessuna delete parte senza il consenso esplicito nella modale.
  const [confirm, setConfirm] = useState<{ kind: 'log' | 'preset'; id: number; label: string } | null>(
    null
  );

  return (
    <div>
      <Panel title="Preset salvati">
        <StateBlock
          loading={presetsApi.loading}
          error={presetsApi.error}
          errorBody={presetsApi.errorBody}
          empty={presets.length === 0}
          emptyText="Nessun preset salvato. Creane uno dal Report builder con «Salva come preset»."
        >
          <div className="pa-checkgrid">
            {presets.map((p: any) => (
              <div
                key={p.id}
                className="pa-action"
                style={{ cursor: 'default', alignItems: 'flex-start' }}
              >
                <div style={{ minWidth: 0 }}>
                  <b>{p.name}</b>
                  <ConfigSummary
                    cfg={p.config}
                    partName={partName}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                  <button
                    className="pa-btn pa-btn-red"
                    onClick={() => downloadPreset(p)}
                  >
                    Scarica
                  </button>
                  <button
                    className="pa-btn pa-btn-ghost"
                    data-tip="Elimina preset"
                    onClick={() => setConfirm({ kind: 'preset', id: p.id, label: p.name })}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        </StateBlock>
      </Panel>

      <Panel
        title="Storico generazioni"
        className="pa-mt"
      >
        <StateBlock
          loading={logApi.loading}
          error={logApi.error}
          errorBody={logApi.errorBody}
          empty={history.length === 0}
          emptyText="Nessun export ancora generato."
        >
          <div className="pa-checkgrid">
            {history.map((h: any) => (
              <div
                key={h.id}
                className="pa-action"
                style={{ cursor: 'default', alignItems: 'flex-start' }}
              >
                <div style={{ minWidth: 0 }}>
                  <b>{h.name}</b>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--pa-text-dim)' }}>
                      {h.when ? new Date(h.when).toLocaleString('it-IT') : '—'} · {h.format}
                    </span>
                  </div>
                  {h.config ? (
                    <ConfigSummary
                      cfg={h.config}
                      partName={partName}
                    />
                  ) : (
                    <div>
                      <span>
                        {h.period} · {partName(h.partition)}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                  {h.config && (
                    <button
                      className="pa-btn pa-btn-red"
                      data-tip="Rigenera questo export con le stesse opzioni"
                      onClick={() => downloadLog(h)}
                    >
                      Scarica
                    </button>
                  )}
                  <button
                    className="pa-btn pa-btn-ghost"
                    data-tip="Elimina voce"
                    onClick={() => setConfirm({ kind: 'log', id: h.id, label: h.name })}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        </StateBlock>
        <div className="pa-note">
          Ogni voce può essere <b>ri-scaricata</b> (rigenera l'export con le stesse identiche opzioni).
        </div>
      </Panel>

      {confirm && (
        <ConfirmDialog
          text={
            confirm.kind === 'preset'
              ? `Vuoi eliminare il preset «${confirm.label}»? L'operazione non è reversibile.`
              : `Vuoi eliminare questa voce dello storico («${confirm.label}»)? L'operazione non è reversibile.`
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirm;
            try {
              if (c.kind === 'preset') {
                await removePreset(c.id);
              } else {
                await removeLog(c.id);
              }
            } finally {
              setConfirm(null);
            }
          }}
        />
      )}
    </div>
  );
}

/* ============================ PARTIZIONI ================================= */

export function PartizioniView({ period }: ViewProps) {
  const part = useApi<any>('/partitions', periodParams(period), [period.label, period.partition]);
  const rows = (part.data && part.data.rows) || [];
  const note = part.data && part.data.note;
  const totalStudies = (part.data && part.data.totalStudies) || 0;
  const totalStorageKB = (part.data && part.data.totalStorageKB) || 0;

  const donutSegments: Segment[] = useMemo(() => {
    return rows.slice(0, 8).map((r: any, i: number) => ({
      label: r.aeTitle || r.description || String(r.partitionGuid || '').slice(0, 8),
      value: r.storageKB,
      color: colorForModality(r.aeTitle || String(i), i),
    }));
  }, [part.data]);

  const label = (r: any) => r.aeTitle || r.description || String(r.partitionGuid || '').slice(0, 8) || '—';

  return (
    <div>
      <div className="pa-grid pa-kpis">
        <Kpi
          label="Partizioni"
          value={formatInt(rows.length)}
        />
        <Kpi
          label="Studi (totale)"
          value={formatInt(totalStudies)}
        />
        <Kpi
          label="Storage (totale)"
          value={formatKB(totalStorageKB)}
        />
      </div>

      <div className="pa-grid pa-cols-2 pa-mt">
        <Panel title="Storage per partizione">
          <StateBlock
            loading={part.loading}
            error={part.error}
            errorBody={part.errorBody}
            empty={rows.length === 0}
            emptyText={note || 'Nessuna partizione.'}
          >
            <HBarChart
              bars={rows.slice(0, 12).map((r: any) => ({
                label: label(r),
                value: kbToTB(r.storageKB),
                valueLabel: formatKB(r.storageKB),
              }))}
            />
          </StateBlock>
        </Panel>
        <Panel title="Distribuzione storage">
          <StateBlock
            loading={part.loading}
            error={part.error}
            empty={rows.length === 0}
            emptyText={note || 'Nessuna partizione.'}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DonutChart
                segments={donutSegments}
                centerValue={formatKB(totalStorageKB)}
                centerLabel="totale"
              />
            </div>
          </StateBlock>
        </Panel>
      </div>

      <Panel title="Dettaglio partizioni" className="pa-mt">
        <StateBlock
          loading={part.loading}
          error={part.error}
          empty={rows.length === 0}
          emptyText={note || 'Nessuna partizione.'}
        >
          <div
            className="pa-table-wrap"
            style={{ maxHeight: 460, overflowY: 'auto' }}
          >
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Partizione (AE)</th>
                  <th>Descrizione</th>
                  <th className="pa-num">Studi</th>
                  <th className="pa-num">Storage</th>
                  <th className="pa-num">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={i}>
                    <td data-tip={r.partitionGuid}>{r.aeTitle || '—'}</td>
                    <td>{r.description || ''}</td>
                    <td className="pa-num">{formatInt(r.studyCount)}</td>
                    <td className="pa-num">{formatKB(r.storageKB)}</td>
                    <td className="pa-num">{formatPct(r.weightPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateBlock>
      </Panel>
      {note && <div className="pa-note">{note}</div>}
    </div>
  );
}

/* ============================ COMMERCIALE ================================= */

export function CommercialeView({ period }: ViewProps) {
  const c = useApi<any>('/commercial', periodParams(period), [period.label, period.partition]);
  const d = c.data || {};
  const forecast = d.forecast || [];
  const history = d.history || [];
  const fbars = forecast.map((f: any) => ({
    label: f.anno,
    value: f.previstoTB,
    valueLabel: formatTBAdaptive(f.previstoTB),
  }));
  return (
    <div>
      <div className="pa-grid pa-kpis">
        <Kpi label="Studi" value={formatInt(d.studyCount)} />
        <Kpi label="Storage occupato" value={formatTBAdaptive(d.occupiedTB)} />
        <Kpi label="Capacità storage" value={d.capacityTB == null ? '—' : formatTBAdaptive(d.capacityTB)} />
        <Kpi label="Disponibile" value={d.availableTB == null ? '—' : formatTBAdaptive(d.availableTB)} />
        <Kpi label="Utilizzo" value={d.usedPct == null ? '—' : formatPct(d.usedPct)} accent />
      </div>
      <div className="pa-grid pa-cols-2 pa-mt">
        <Panel title="Crescita e saturazione (proiezione statistica, senza AI)">
          <StateBlock loading={c.loading} error={c.error} errorBody={c.errorBody} empty={false}>
            <div className="pa-grid pa-kpis">
              <Kpi label="Media mensile" value={formatKB(d.monthlyGrowthKB)} small />
              <Kpi label="Media giornaliera" value={formatKB(d.dailyGrowthKB)} small />
              <Kpi
                label="Mesi a saturazione"
                value={d.monthsToSaturation == null ? '—' : formatDecimal(d.monthsToSaturation, 1)}
                small
              />
            </div>
            <div className="pa-note" style={{ marginTop: 12 }}>
              {d.recommendation || ''}
            </div>
          </StateBlock>
        </Panel>
        <Panel title="Previsione storage prossimi anni">
          <StateBlock
            loading={c.loading}
            error={c.error}
            empty={fbars.length === 0}
            emptyText="Previsione non disponibile (crescita non stimabile)."
          >
            <ColumnChart bars={fbars} showValues />
          </StateBlock>
        </Panel>
      </div>
      <Panel title="Storico storage per anno" className="pa-mt">
        <StateBlock loading={c.loading} error={c.error} empty={history.length === 0}>
          <div className="pa-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Anno</th>
                  <th className="pa-num">Iniziale</th>
                  <th className="pa-num">Finale</th>
                  <th className="pa-num">Incremento</th>
                  <th className="pa-num">Crescita</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: any, i: number) => (
                  <tr key={i}>
                    <td>{h.anno}</td>
                    <td className="pa-num">{formatTBAdaptive(h.inizialeTB)}</td>
                    <td className="pa-num">{formatTBAdaptive(h.finaleTB)}</td>
                    <td className="pa-num">{formatTBAdaptive(h.incrementoTB)}</td>
                    <td className="pa-num">{h.crescitaPct == null ? '—' : formatPct(h.crescitaPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateBlock>
      </Panel>
    </div>
  );
}

/* ============================ ADMIN ================================= */

/** Campo password con occhiello mostra/nascondi. */
export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  onKeyDown,
  style,
  autoComplete,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  style?: React.CSSProperties;
  autoComplete?: string;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="pa-input-clear-wrap"
      style={style}
    >
      <input
        type={show ? 'text' : 'password'}
        className="pa-input"
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        name={name}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="pa-eye"
        data-tip={show ? 'Nascondi password' : 'Mostra password'}
        aria-label={show ? 'Nascondi password' : 'Mostra password'}
        onClick={() => setShow(s => !s)}
      >
        {show ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line
              x1="1"
              y1="1"
              x2="23"
              y2="23"
            />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle
              cx="12"
              cy="12"
              r="3"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Modale per cambiare la password di un utente (senza mai mostrare/leggere quella attuale). */
/**
 * Modale "Credenziali di sistema": compare quando un'operazione elevata fallisce perché le
 * credenziali admin del server sono errate/scadute (code NEED_CREDENTIALS). onSubmit ritenta
 * l'operazione con le credenziali inserite; se ancora NEED_CREDENTIALS mostra "ancora errate".
 */
function SystemCredentialsModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (username: string, password: string) => Promise<{ ok: boolean; code?: string; message?: string }>;
}) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!u || !p) {
      setError('Inserisci username e password di sistema.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(u, p);
      if (res && res.ok) {
        return; // l'operazione ha chiuso tutto
      }
      if (res && res.code === 'NEED_CREDENTIALS') {
        setError('Credenziali di sistema ancora errate. Riprova.');
        setP('');
      } else {
        setError((res && res.message) || 'Operazione non riuscita.');
      }
    } catch (e: any) {
      setError((e && e.message) || 'Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="pa-modal-overlay"
      onMouseDown={onCancel}
    >
      <div
        className="pa-modal"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="pa-modal-title">Credenziali di sistema</div>
        <div className="pa-modal-body">
          Le credenziali amministrative del server risultano errate o scadute. Inseriscile per
          completare l'operazione: verranno usate ora e sincronizzate con la dashboard cloud.
          <input
            className="pa-input"
            style={{ width: '100%', marginTop: 12 }}
            placeholder="Username amministratore"
            value={u}
            autoFocus
            onChange={e => {
              setU(e.target.value);
              setError(null);
            }}
          />
          <PasswordInput
            placeholder="Password amministratore"
            value={p}
            style={{ marginTop: 8 }}
            onChange={v => {
              setP(v);
              setError(null);
            }}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          {error && <div className="pa-modal-error">{error}</div>}
        </div>
        <div className="pa-modal-actions">
          <button
            className="pa-btn pa-btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            className="pa-btn pa-btn-red"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Verifica…' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({
  userName,
  onClose,
  onDone,
}: {
  userName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needCreds, setNeedCreds] = useState(false);
  const attempt = (elevU?: string, elevP?: string) => changeUserPassword(userName, pw, elevU, elevP);
  const submit = async () => {
    if (!pw) {
      setError('Inserisci la nuova password.');
      return;
    }
    if (pw !== pw2) {
      setError('Le due password non coincidono.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await attempt();
      if (res && res.ok) {
        onDone(`Password di «${userName}» aggiornata.`);
      } else if (res && res.code === 'NEED_CREDENTIALS') {
        setNeedCreds(true);
      } else {
        setError((res && res.message) || 'Operazione non riuscita.');
      }
    } catch (e: any) {
      setError((e && e.message) || 'Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div
        className="pa-modal-overlay"
        onMouseDown={onClose}
      >
      <div
        className="pa-modal"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="pa-modal-title">Cambia password — {userName}</div>
        <div className="pa-modal-body">
          La password attuale non viene mai mostrata. Inserisci la nuova password.
          <PasswordInput
            placeholder="Nuova password"
            value={pw}
            autoFocus
            style={{ marginTop: 12 }}
            autoComplete="new-password"
            name="pa-change-password"
            onChange={v => {
              setPw(v);
              setError(null);
            }}
          />
          <PasswordInput
            placeholder="Conferma password"
            value={pw2}
            style={{ marginTop: 8 }}
            autoComplete="new-password"
            name="pa-change-password-2"
            onChange={v => {
              setPw2(v);
              setError(null);
            }}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          {error && <div className="pa-modal-error">{error}</div>}
        </div>
        <div className="pa-modal-actions">
          <button
            className="pa-btn pa-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            className="pa-btn pa-btn-red"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>
      </div>
      {needCreds && (
        <SystemCredentialsModal
          onCancel={() => setNeedCreds(false)}
          onSubmit={async (u, p) => {
            const res = await attempt(u, p);
            if (res && res.ok) {
              onDone(`Password di «${userName}» aggiornata.`);
            }
            return res;
          }}
        />
      )}
    </>
  );
}

/** Modale creazione nuovo utente (username + password con occhiello). */
function AddUserModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needCreds, setNeedCreds] = useState(false);
  const attempt = (elevU?: string, elevP?: string) => createUser(name.trim(), pw, elevU, elevP);
  const submit = async () => {
    const nm = name.trim();
    if (!nm) {
      setError('Inserisci il nome utente.');
      return;
    }
    if (!pw) {
      setError('Inserisci la password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await attempt();
      if (res && res.ok) {
        onDone(`Utente «${nm}» creato.`);
      } else if (res && res.code === 'NEED_CREDENTIALS') {
        setNeedCreds(true);
      } else {
        setError((res && res.message) || 'Operazione non riuscita.');
      }
    } catch (e: any) {
      setError((e && e.message) || 'Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div
        className="pa-modal-overlay"
        onMouseDown={onClose}
      >
      <div
        className="pa-modal"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="pa-modal-title">Nuovo utente</div>
        <div className="pa-modal-body">
          Verrà creato in Users.xml con i permessi standard (Roles.txt).
          <input
            className="pa-input"
            style={{ width: '100%', marginTop: 12 }}
            placeholder="Nome utente"
            value={name}
            autoFocus
            autoComplete="off"
            name="pa-new-username"
            onChange={e => {
              setName(e.target.value);
              setError(null);
            }}
          />
          <PasswordInput
            placeholder="Password"
            value={pw}
            style={{ marginTop: 8 }}
            autoComplete="new-password"
            name="pa-new-password"
            onChange={v => {
              setPw(v);
              setError(null);
            }}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          {error && <div className="pa-modal-error">{error}</div>}
        </div>
        <div className="pa-modal-actions">
          <button
            className="pa-btn pa-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            className="pa-btn pa-btn-red"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Creazione…' : 'Crea utente'}
          </button>
        </div>
      </div>
      </div>
      {needCreds && (
        <SystemCredentialsModal
          onCancel={() => setNeedCreds(false)}
          onSubmit={async (u, p) => {
            const res = await attempt(u, p);
            if (res && res.ok) {
              onDone(`Utente «${name.trim()}» creato.`);
            }
            return res;
          }}
        />
      )}
    </>
  );
}

/** Elenco utenti WebPACS con permessi attivi + gestione (aggiungi/rimuovi/cambio password). */
function UsersPanel() {
  const usersApi = useApi<any>('/users', undefined, []);
  const users: any[] = (usersApi.data && usersApi.data.users) || [];
  const note = usersApi.data && usersApi.data.note;
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [changePwFor, setChangePwFor] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);
  const [deleteCredFor, setDeleteCredFor] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <Panel
      title="Utenti e permessi"
      className="pa-mt"
      right={
        <button
          className="pa-btn pa-btn-red"
          onClick={() => {
            setFlash(null);
            setAddOpen(true);
          }}
        >
          + Aggiungi utente
        </button>
      }
    >
      <StateBlock
        loading={usersApi.loading}
        error={usersApi.error}
        errorBody={usersApi.errorBody}
        empty={users.length === 0}
        emptyText={note || 'Nessun utente disponibile.'}
      >
        {flash && <div className={flash.ok ? 'pa-flash-ok' : 'pa-flash-err'}>{flash.text}</div>}
        <div className="pa-users">
          {users.map((u: any) => {
            const open = openUser === u.userName;
            const isAdmin = String(u.userName).toLowerCase() === 'admin';
            return (
              <div
                className="pa-user"
                key={u.userName}
              >
                <button
                  type="button"
                  className="pa-user-head"
                  onClick={() => setOpenUser(open ? null : u.userName)}
                >
                  <span className="pa-user-name">
                    <b>{u.userName}</b>
                    <span className={`pa-badge ${u.approved ? 'pa-badge-ok' : 'pa-badge-off'}`}>
                      {u.approved ? 'Attivo' : 'Non approvato'}
                    </span>
                  </span>
                  <span className="pa-user-count">
                    {u.permissionCount} permessi{' '}
                    <span className="pa-user-caret">{open ? '▴' : '▾'}</span>
                  </span>
                </button>
                {open && (
                  <div className="pa-user-body">
                    <div className="pa-user-perms">
                      {u.permissions.length === 0 ? (
                        <span className="pa-note">Nessun permesso attivo.</span>
                      ) : (
                        u.permissions.map((p: string) => (
                          <span
                            key={p}
                            className="pa-perm-chip"
                          >
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="pa-user-foot">
                      <button
                        className="pa-btn pa-btn-ghost"
                        onClick={() => {
                          setFlash(null);
                          setChangePwFor(u.userName);
                        }}
                      >
                        Cambia password
                      </button>
                      {!isAdmin && (
                        <button
                          className="pa-btn pa-btn-ghost"
                          data-tip="Rimuovi utente"
                          onClick={() => {
                            setFlash(null);
                            setDeleteFor(u.userName);
                          }}
                        >
                          Elimina utente
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </StateBlock>
      {changePwFor && (
        <ChangePasswordModal
          userName={changePwFor}
          onClose={() => setChangePwFor(null)}
          onDone={msg => {
            setChangePwFor(null);
            setFlash({ text: msg, ok: true });
            usersApi.reload();
          }}
        />
      )}
      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onDone={msg => {
            setAddOpen(false);
            setFlash({ text: msg, ok: true });
            usersApi.reload();
          }}
        />
      )}
      {deleteFor && (
        <ConfirmDialog
          text={`Vuoi eliminare l'utente «${deleteFor}»? Verrà rimosso da Users.xml e dai permessi (Roles.txt). L'operazione non è reversibile.`}
          onCancel={() => setDeleteFor(null)}
          onConfirm={async () => {
            const u = deleteFor;
            try {
              const res = await deleteUser(u);
              if (res && res.ok) {
                setFlash({ text: `Utente «${u}» rimosso.`, ok: true });
                usersApi.reload();
              } else if (res && res.code === 'NEED_CREDENTIALS') {
                setDeleteCredFor(u);
              } else {
                setFlash({ text: (res && res.message) || 'Rimozione non riuscita.', ok: false });
                usersApi.reload();
              }
            } catch (e: any) {
              setFlash({ text: (e && e.message) || 'Rimozione non riuscita.', ok: false });
              usersApi.reload();
            } finally {
              setDeleteFor(null);
            }
          }}
        />
      )}
      {deleteCredFor && (
        <SystemCredentialsModal
          onCancel={() => setDeleteCredFor(null)}
          onSubmit={async (u, p) => {
            const res = await deleteUser(deleteCredFor, u, p);
            if (res && res.ok) {
              setDeleteCredFor(null);
              setFlash({ text: `Utente «${deleteCredFor}» rimosso.`, ok: true });
              usersApi.reload();
            }
            return res;
          }}
        />
      )}
    </Panel>
  );
}

export function AdminView(_props: ViewProps) {
  const a = useApi<any>('/admin', undefined, []);
  const d = a.data || {};
  return (
    <div>
      <div className="pa-grid pa-kpis">
        <Kpi
          label="Provider DB"
          value={d.provider === 'postgres' ? 'PostgreSQL' : d.provider === 'sqlserver' ? 'SQL Server' : '—'}
        />
        <Kpi label="Connessione" value={d.connected ? 'OK' : '—'} accent={!!d.connected} />
        <Kpi label="Studi" value={formatInt(d.studyCount)} />
        <Kpi label="Pazienti" value={d.patientCount == null ? '—' : formatInt(d.patientCount)} />
        <Kpi label="Dati studi (PACS)" value={formatKB(d.storageKB)} />
      </div>
      <div className="pa-grid pa-cols-2 pa-mt">
        <Panel title="Stato database">
          <StateBlock loading={a.loading} error={a.error} errorBody={a.errorBody} empty={false}>
            <table className="pa-table">
              <tbody>
                <tr>
                  <td>Provider</td>
                  <td className="pa-num">{d.provider || '—'}</td>
                </tr>
                <tr>
                  <td>Connection string</td>
                  <td className="pa-num">{d.connectionName || '—'}</td>
                </tr>
                <tr>
                  <td>File config</td>
                  <td
                    className="pa-num"
                    data-tip={d.configPath}
                  >
                    {d.configPath || '—'}
                  </td>
                </tr>
                <tr>
                  <td>Ora server</td>
                  <td className="pa-num">{d.serverTime ? new Date(d.serverTime).toLocaleString() : '—'}</td>
                </tr>
                <tr>
                  <td>Node</td>
                  <td className="pa-num">{d.nodeVersion || '—'}</td>
                </tr>
                <tr>
                  <td>Log SQL</td>
                  <td className="pa-num">{d.logSqlEnabled ? 'attivo' : 'off'}</td>
                </tr>
              </tbody>
            </table>
          </StateBlock>
        </Panel>
        <Panel title="Aggregati e range">
          <StateBlock loading={a.loading} error={a.error} empty={false}>
            <table className="pa-table">
              <tbody>
                <tr>
                  <td>Serie</td>
                  <td className="pa-num">{formatInt(d.seriesCount)}</td>
                </tr>
                <tr>
                  <td>Immagini</td>
                  <td className="pa-num">{formatInt(d.instanceCount)}</td>
                </tr>
                <tr>
                  <td>Partizioni</td>
                  <td className="pa-num">{formatInt(d.partitionCount)}</td>
                </tr>
                <tr>
                  <td>Studio più vecchio</td>
                  <td className="pa-num">{formatDicomDate(d.oldestStudyDate) || '—'}</td>
                </tr>
                <tr>
                  <td>Studio più recente</td>
                  <td className="pa-num">{formatDicomDate(d.newestStudyDate) || '—'}</td>
                </tr>
                <tr>
                  <td>Capacità storage</td>
                  <td className="pa-num">
                    {d.storageCapacityTB
                      ? `${formatTBAdaptive(d.storageCapacityTB)}${
                          d.storageCapacitySource === 'disk'
                            ? ' (dal disco)'
                            : d.storageCapacitySource === 'env'
                              ? ' (impostata)'
                              : ''
                        }`
                      : 'non rilevabile'}
                  </td>
                </tr>
              </tbody>
            </table>
          </StateBlock>
        </Panel>
      </div>
      <UsersPanel />
    </div>
  );
}
