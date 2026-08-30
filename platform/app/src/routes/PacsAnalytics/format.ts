/** Helper di formattazione (locale it-IT) per la dashboard PACS Analytics. */

const KB_PER_MB = 1024;
const KB_PER_GB = 1048576; // 1024^2
const KB_PER_TB = 1073741824; // 1024^3

const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return '—';
  }
  return nf0.format(Math.round(n));
}

export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return '—';
  }
  return new Intl.NumberFormat('it-IT', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

/** Formatta una quantità in KB scegliendo automaticamente MB/GB/TB. */
export function formatKB(kb: number | null | undefined): string {
  if (kb === null || kb === undefined || Number.isNaN(kb)) {
    return '—';
  }
  if (kb >= KB_PER_TB) {
    return `${nf1.format(kb / KB_PER_TB)} TB`;
  }
  if (kb >= KB_PER_GB) {
    return `${nf1.format(kb / KB_PER_GB)} GB`;
  }
  if (kb >= KB_PER_MB) {
    return `${nf1.format(kb / KB_PER_MB)} MB`;
  }
  return `${nf0.format(kb)} KB`;
}

export function kbToTB(kb: number): number {
  return kb / KB_PER_TB;
}

export function formatTB(tb: number | null | undefined): string {
  if (tb === null || tb === undefined || Number.isNaN(tb)) {
    return '—';
  }
  return `${nf1.format(tb)} TB`;
}

/**
 * Formatta una misura espressa in TB scegliendo dinamicamente l'unità leggibile (MB/GB/TB):
 * evita valori come "0,0 TB" o "0,1 TB" quando gli importi sono piccoli (es. storico/incrementi).
 */
export function formatTBAdaptive(tb: number | null | undefined): string {
  if (tb === null || tb === undefined || Number.isNaN(tb)) {
    return '—';
  }
  return formatKB(tb * KB_PER_TB);
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return '—';
  }
  return `${nf1.format(n)}%`;
}

export function formatSignedPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) {
    return '—';
  }
  const sign = n > 0 ? '+' : '';
  return `${sign}${nf1.format(n)}%`;
}

/** 'YYYYMMDD' -> 'dd/mm/yyyy'. */
export function formatDicomDate(d: string | null | undefined): string {
  if (!d) {
    return '';
  }
  const s = String(d);
  if (s.length < 8) {
    return s;
  }
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** 'HHMMSS(.frac)' -> 'HH:mm'. */
export function formatDicomTime(t: string | null | undefined): string {
  if (!t) {
    return '';
  }
  const s = String(t).replace(/[^0-9]/g, '');
  if (s.length < 4) {
    return s;
  }
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/** Etichetta periodo trend: 'YYYY' | 'YYYYMM' | 'YYYYMMDD' -> leggibile. */
export function formatPeriodLabel(period: string, granularity: string): string {
  if (!period) {
    return '';
  }
  if (granularity === 'year') {
    return period;
  }
  if (granularity === 'month') {
    // Formato compatto e uniforme MM/YYYY (es. 07/2025) — sta meglio come etichetta.
    const y = period.slice(0, 4);
    const m = parseInt(period.slice(4, 6), 10);
    return `${String(m).padStart(2, '0')}/${y}`;
  }
  // day
  return formatDicomDate(period);
}

export const MODALITY_COLORS: Record<string, string> = {
  RM: '#e11f2e',
  MR: '#e11f2e',
  TC: '#3b9dff',
  CT: '#3b9dff',
  CR: '#f5a623',
  DX: '#f5a623',
  RX: '#f5a623',
  US: '#7a7a83',
  MG: '#a855f7',
  NM: '#20c997',
  PT: '#ff6b9d',
  XA: '#ffd166',
  OT: '#5b7fff',
};

const PALETTE = [
  '#e11f2e',
  '#3b9dff',
  '#f5a623',
  '#7a7a83',
  '#a855f7',
  '#20c997',
  '#ff6b9d',
  '#ffd166',
  '#5b7fff',
  '#e8590c',
];

export function colorForModality(mod: string, index = 0): string {
  const key = (mod || '').trim().toUpperCase();
  return MODALITY_COLORS[key] || PALETTE[index % PALETTE.length];
}

export function colorByIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
