/**
 * Client API per la dashboard PACS Analytics.
 *
 * Base URL (in ordine di priorità):
 *   1. window.PACS_ANALYTICS_API_BASE            (override esplicito runtime)
 *   2. window.config.pacsAnalyticsApiBase        (config viewer, se presente)
 *   3. dev: viewer su :3000 -> backend su :8080
 *   4. prod: stessa origin, path relativo /api/pacs-analytics
 *
 * La dashboard è indipendente dal viewer: usa solo fetch nativo.
 */

declare global {
  interface Window {
    PACS_ANALYTICS_API_BASE?: string;
    config?: { pacsAnalyticsApiBase?: string; [k: string]: any };
    isSuite?: boolean;
    suiteOrigin?: string;
    PUBLIC_URL?: string;
  }
}

/**
 * Base URL degli endpoint backend, endpoint alla ROOT `/api/pacs-analytics`.
 * Regola (come il resto del viewer):
 *   - se `window.isSuite` è true → si usa il dominio suite (`window.suiteOrigin` o
 *     http://localhost:3000): lì gira lo STESSO backend del viewer, già aggiornato;
 *   - altrimenti si usa l'origin della pagina (in dev, viewer :3000 → backend :8080).
 * In produzione (isSuite=false) una globalRule IIS instrada `/api/pacs-analytics/*` al
 * server farm del backend (ARR).
 *
 * Override espliciti (se servono, es. test verso un backend remoto):
 *   window.PACS_ANALYTICS_API_BASE = 'http://host:8080/api/pacs-analytics'
 *   window.config.pacsAnalyticsApiBase = '...'
 */
export function resolveApiBase(): string {
  if (typeof window !== 'undefined') {
    if (window.PACS_ANALYTICS_API_BASE) {
      return stripTrailingSlash(window.PACS_ANALYTICS_API_BASE);
    }
    if (window.config && window.config.pacsAnalyticsApiBase) {
      return stripTrailingSlash(window.config.pacsAnalyticsApiBase);
    }
    // Modalità suite: API su localhost (stesso backend del viewer).
    if (window.isSuite) {
      const origin = stripTrailingSlash(window.suiteOrigin || 'http://localhost:3000');
      return `${origin}/api/pacs-analytics`;
    }
    const loc = window.location;
    // Dev locale: il viewer gira su :3000 (webpack dev server), il backend Express su :8080.
    if (loc.port === '3000') {
      return `${loc.protocol}//${loc.hostname}:8080/api/pacs-analytics`;
    }
    // Altrimenti: stessa origin della pagina, endpoint alla ROOT.
    return `${stripTrailingSlash(loc.origin)}/api/pacs-analytics`;
  }
  return '/api/pacs-analytics';
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function buildUrl(path: string, params?: Record<string, any>): string {
  const base = resolveApiBase();
  const qs = params ? toQueryString(params) : '';
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

export function toQueryString(params: Record<string, any>): string {
  const parts: string[] = [];
  Object.keys(params).forEach(key => {
    const v = params[key];
    if (v !== undefined && v !== null && v !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.join('&');
}

/**
 * fetch con messaggio d'errore in ITALIANO: se la fetch fallisce a livello di rete il
 * browser lancia un TypeError "Failed to fetch" (backend spento/irraggiungibile, CORS…).
 * Lo intercettiamo e lo sostituiamo con un testo leggibile mostrato nell'interfaccia.
 */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (_e) {
    const err: any = new Error('Impossibile recuperare i dati in questo momento. Riprova più tardi.');
    err.network = true;
    throw err;
  }
}

/**
 * Interpreta la risposta con messaggi d'errore SEMPRE amichevoli per l'utente finale.
 * Non mostra mai il corpo grezzo (es. la pagina HTML "Cannot GET ..." quando l'endpoint
 * non esiste ancora sul server): usa messaggi in italiano non tecnici.
 */
async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: any = null;
  let jsonOk = true;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    jsonOk = false;
    body = null; // NON usare il testo (può essere HTML) come messaggio
  }
  if (!res.ok) {
    let message: string;
    if (res.status === 404) {
      message = 'Questa sezione non è ancora disponibile.';
    } else if (res.status === 503) {
      message = 'Dati non ancora pronti: riprova tra qualche istante.';
    } else if (res.status === 401 || res.status === 403) {
      message = 'Accesso non consentito.';
    } else if (jsonOk && body && typeof body === 'object' && (body.error || body.message)) {
      message = String(body.error || body.message);
    } else if (res.status >= 500) {
      message = 'Si è verificato un errore nel recupero dei dati.';
    } else {
      message = 'Si è verificato un errore. Riprova più tardi.';
    }
    const err: any = new Error(message);
    err.status = res.status;
    err.body = jsonOk ? body : null;
    throw err;
  }
  return body as T;
}

export async function apiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  const url = buildUrl(path, params);
  const res = await safeFetch(url, { headers: { Accept: 'application/json' } });
  return parseResponse<T>(res);
}

export async function apiPost<T = any>(path: string, payload?: any): Promise<T> {
  const url = buildUrl(path);
  const res = await safeFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return parseResponse<T>(res);
}

/** URL diretto (per download CSV via <a href> o window.open). */
export function exportCsvUrl(params?: Record<string, any>): string {
  return buildUrl('/studies/export.csv', params);
}

/* ---------------- Storico export + Preset (persistiti sul DB collegato) ---------------- */

export interface ExportLogEntry {
  name?: string;
  format?: string;
  period?: string;
  partition?: string;
  /** Config completa (periodo/partizione/modalità/tipo esame/colonne) per rigenerare l'export. */
  config?: any;
}

/** Registra una generazione nello storico (audit su DB). Silenzioso in caso di errore. */
export async function logExport(entry: ExportLogEntry): Promise<void> {
  try {
    await apiPost('/export-log', entry);
  } catch (_) {
    /* lo storico è un audit: un errore non deve bloccare il download */
  }
}

/** Elimina una singola voce dello storico. */
export async function deleteExportLog(id: number): Promise<void> {
  await apiPost('/export-log/delete', { id });
}

/** Crea un preset riutilizzabile (dal Report builder). */
export async function createPreset(entry: { name: string; config: any }): Promise<void> {
  await apiPost('/presets', entry);
}

/** Elimina un preset salvato. */
export async function deletePreset(id: number): Promise<void> {
  await apiPost('/presets/delete', { id });
}

/**
 * Cambia la password di un utente WebPACS. Il backend ricontrolla il file: se l'utente non
 * esiste più restituisce { ok:false, code:'NOT_FOUND' }. Non mostra/legge mai la password attuale.
 */
export async function changeUserPassword(
  userName: string,
  newPassword: string,
  elevUsername?: string,
  elevPassword?: string
): Promise<{ ok: boolean; message?: string; code?: string }> {
  return apiPost('/users/password', { userName, newPassword, elevUsername, elevPassword });
}

/** Crea un nuovo utente (Users.xml) + regola permessi di default (Roles.txt). */
export async function createUser(
  userName: string,
  password: string,
  elevUsername?: string,
  elevPassword?: string
): Promise<{ ok: boolean; message?: string; code?: string }> {
  return apiPost('/users/create', { userName, password, elevUsername, elevPassword });
}

/** Rimuove un utente da Users.xml e la sua regola da Roles.txt. */
export async function deleteUser(
  userName: string,
  elevUsername?: string,
  elevPassword?: string
): Promise<{ ok: boolean; message?: string; code?: string }> {
  return apiPost('/users/delete', { userName, elevUsername, elevPassword });
}
