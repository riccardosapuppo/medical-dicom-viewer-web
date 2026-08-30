import React from 'react';

export function Panel({
  title,
  children,
  right,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pa-panel ${className}`}>
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {title ? (
            <h2
              className="pa-panel-title"
              style={{ marginBottom: 0 }}
            >
              {title}
            </h2>
          ) : (
            <span />
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  delta,
  accent = false,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  delta?: number | null;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`pa-kpi ${accent ? 'pa-accent' : ''}`}>
      <div className="pa-kpi-label">{label}</div>
      <div className={`pa-kpi-value ${small ? 'pa-sm' : ''}`}>{value}</div>
      {sub && <div className="pa-kpi-sub">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className={delta >= 0 ? 'pa-delta-pos' : 'pa-delta-neg'}>
          {delta >= 0 ? '+' : ''}
          {new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(delta)}%
        </div>
      )}
    </div>
  );
}

/**
 * Blocco di stato: mostra spinner, errore o "vuoto" e altrimenti i figli.
 * `error` può avere un messaggio dedicato e un suggerimento (per driver mancante, ecc.).
 */
export function StateBlock({
  loading,
  error,
  errorBody,
  empty,
  emptyText = 'Nessun dato disponibile.',
  children,
}: {
  loading: boolean;
  error?: string | null;
  errorBody?: any;
  empty?: boolean;
  emptyText?: string;
  children?: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="pa-loading">
        <span className="pa-spinner" /> Caricamento…
      </div>
    );
  }
  if (error) {
    const hint =
      errorBody && errorBody.code === 'DRIVER_MISSING'
        ? 'Il servizio si sta avviando: riprova tra qualche istante.'
        : errorBody && errorBody.code === 'CONFIG_ERROR'
          ? "Configurazione dati non disponibile: contatta l'assistenza Mdv."
          : errorBody && errorBody.code === 'DB_CONNECT_ERROR'
            ? 'Origine dati momentaneamente non raggiungibile: riprova tra poco.'
            : '';
    return (
      <div className="pa-error">
        <div>
          <div>⚠ {error}</div>
          {hint && <div className="pa-note">{hint}</div>}
        </div>
      </div>
    );
  }
  if (empty) {
    return <div className="pa-empty">{emptyText}</div>;
  }
  return <>{children}</>;
}
