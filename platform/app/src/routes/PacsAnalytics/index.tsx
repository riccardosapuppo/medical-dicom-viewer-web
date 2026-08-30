import React, { useMemo, useState, useEffect } from 'react';
import './PacsAnalytics.css';
import { useApi } from './useApi';
import { TooltipLayer } from './Tooltip';
import {
  DashboardView,
  AnalisiView,
  StudiesView,
  StorageView,
  PartizioniView,
  ReportView,
  DownloadView,
  CommercialeView,
  AdminView,
  Period,
  buildPeriod,
  PasswordInput,
} from './views';

/**
 * PACS Analytics - Dashboard autonoma (route /pacs-analytics).
 *
 * NON dipende da viewport, modes, DICOM services, hanging protocol, cornerstone
 * o dalle toolbar del viewer: usa solo React, fetch e CSS locali.
 * I props del router OHIF (servicesManager, ecc.) vengono ignorati.
 */

interface NavEntry {
  key: string;
  label: string;
  title: string;
  subtitle: string;
  render: (props: {
    period: Period;
    goTo: (v: string) => void;
    setPartition: (v: string) => void;
  }) => React.ReactNode;
}

const NAV: NavEntry[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    title: 'Dashboard principale',
    subtitle: 'Sintesi operativa PACS',
    render: p => <DashboardView {...p} />,
  },
  {
    key: 'studies',
    label: 'Studi',
    title: 'Archivio studi',
    subtitle: 'Ricerca, filtri ed esportazione',
    render: p => <StudiesView {...p} />,
  },
  {
    key: 'analisi',
    label: 'Analisi',
    title: 'Analisi',
    subtitle: 'Trend, modalità, apparecchiature, temporale',
    render: p => <AnalisiView {...p} />,
  },
  {
    key: 'storage',
    label: 'Storage',
    title: 'Dashboard storage',
    subtitle: 'Capienza, occupazione e forecast statistico',
    render: p => <StorageView {...p} />,
  },
  {
    key: 'partizioni',
    label: 'Partizioni',
    title: 'Partizioni',
    subtitle: 'Studi e spazio occupato per partizione (ServerPartition)',
    render: p => <PartizioniView {...p} />,
  },
  {
    key: 'report',
    label: 'Report',
    title: 'Report builder',
    subtitle: 'Creazione report / export CSV',
    render: p => <ReportView {...p} />,
  },
  {
    key: 'download',
    label: 'Download',
    title: 'Centro download',
    subtitle: 'Report predefiniti e storico export',
    render: p => <DownloadView {...p} />,
  },
  {
    key: 'commerciale',
    label: 'Commerciale',
    title: 'Dashboard commerciale',
    subtitle: 'Storage, contratto, forecast e raccomandazione (senza PHI)',
    render: p => <CommercialeView {...p} />,
  },
  {
    key: 'admin',
    label: 'Sistema',
    title: 'Stato del sistema',
    subtitle: 'Stato database, aggregati e diagnostica',
    render: p => <AdminView {...p} />,
  },
];

function HealthBadge() {
  const health = useApi<any>('/health', undefined, []);
  const h = health.data;
  let cls = 'pa-badge pa-badge-warn';
  let text = 'DB…';
  if (health.loading) {
    text = 'DB…';
  } else if (health.error) {
    cls = 'pa-badge pa-badge-err';
    text = 'DB offline';
  } else if (h) {
    if (h.connected) {
      cls = 'pa-badge pa-badge-ok';
      text = 'DB connesso';
    } else if (!h.driverInstalled) {
      cls = 'pa-badge pa-badge-err';
      text = 'Driver mancante';
    } else if (!h.configFound) {
      cls = 'pa-badge pa-badge-err';
      text = 'Config assente';
    } else {
      cls = 'pa-badge pa-badge-warn';
      text = 'DB non pronto';
    }
  }
  return (
    <span
      className={cls}
      data-tip={h ? h.message || '' : health.error || ''}
    >
      {text}
    </span>
  );
}

/**
 * Error boundary LOCALE: la dashboard è wrappata dall'ErrorBoundary di OHIF che,
 * con window.mostraErroriFrontend=false, mostra `null` (pagina nera) su qualunque
 * errore. Questo boundary intercetta prima gli errori del nostro sottoalbero e li
 * mostra in modo VISIBILE (stili inline, indipendenti dal CSS della dashboard).
 */
class PaErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { error, info: '' };
  }
  componentDidCatch(error: Error, info: any) {
    // eslint-disable-next-line no-console
    console.error('[pacs-analytics] errore di render:', error, info);
    this.setState({ error, info: (info && info.componentStack) || '' });
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#0a0a0b',
            color: '#f4f4f6',
            padding: 24,
            overflow: 'auto',
            fontFamily: 'monospace',
            zIndex: 999999,
          }}
        >
          <h2 style={{ color: '#e11f2e', marginTop: 0 }}>Errore nella dashboard PACS Analytics</h2>
          <p style={{ fontSize: 14 }}>{String(this.state.error.message || this.state.error)}</p>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#9a9aa3', fontSize: 12 }}>
            {this.state.error.stack || ''}
            {this.state.info}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Modale password (moderna) per l'accesso a sezioni riservate. */
function PasswordModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (pw: string) => boolean;
}) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (onSubmit(pw)) {
      return;
    }
    setError('Password non valida');
    setPw('');
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
        <div className="pa-modal-title">Accesso riservato</div>
        <div className="pa-modal-body">
          Questa sezione è protetta: inserisci la password per continuare.
          <PasswordInput
            value={pw}
            autoFocus
            placeholder="Password"
            style={{ marginTop: 12 }}
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
            onClick={onCancel}
          >
            Annulla
          </button>
          <button
            className="pa-btn pa-btn-red"
            onClick={submit}
          >
            Entra
          </button>
        </div>
      </div>
    </div>
  );
}

function PacsAnalyticsInner() {
  const [active, setActive] = useState('dashboard');
  const [periodKey, setPeriodKey] = useState('all');
  const [partition, setPartition] = useState('');
  // Accesso alla sezione "Sistema": password richiesta una sola volta, valida fino al reload.
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const navigateTo = (key: string) => {
    if (key === 'admin' && !adminUnlocked) {
      setPwOpen(true);
      return;
    }
    setActive(key);
  };
  const checkAdminPassword = (pw: string): boolean => {
    const now = new Date();
    const expected = `mdvamn${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;
    if (pw === expected) {
      setAdminUnlocked(true);
      setPwOpen(false);
      setActive('admin');
      return true;
    }
    return false;
  };

  // Elenco partizioni (per il selettore globale). Se il DB non ha ServerPartition la lista
  // è vuota e il selettore non viene mostrato.
  const partitions = useApi<any>('/partitions', undefined, []);
  const partitionRows: any[] = useMemo(
    () => (partitions.data && partitions.data.rows) || [],
    [partitions.data]
  );

  // Anni disponibili dal DB, per il selettore periodo.
  const yearly = useApi<any>('/storage/yearly', undefined, []);
  const years: string[] = useMemo(() => {
    const rows = (yearly.data && yearly.data.rows) || [];
    return rows
      .map((r: any) => String(r.anno))
      .filter((y: string) => /^\d{4}$/.test(y))
      .sort((a: string, b: string) => Number(b) - Number(a));
  }, [yearly.data]);

  // Nella vista "Partizioni" (panoramica di tutte) il filtro partizione è ignorato ma la selezione
  // precedente è preservata. Il Report builder è indipendente: usa proprie select (non queste).
  const period: Period = useMemo(
    () => buildPeriod(periodKey, active === 'partizioni' ? '' : partition),
    [periodKey, partition, active]
  );

  const entry = NAV.find(n => n.key === active) || NAV[0];

  // Titolo della scheda del browser dedicato a PACS Analytics (per distinguerlo dal viewer).
  // Alla mount si memorizza il titolo del viewer e lo si ripristina quando si esce dalla dashboard.
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);
  useEffect(() => {
    document.title = `PACS Analytics · ${entry.title}`;
  }, [entry.title]);

  return (
    <div className="pa-root">
      <TooltipLayer />
      <aside className="pa-sidebar">
        <div className="pa-brand">
          <div className="pa-brand-title">PACS</div>
          <div className="pa-brand-sub">ANALYTICS</div>
        </div>
        <nav className="pa-nav">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`pa-nav-item ${active === n.key ? 'pa-active' : ''}`}
              onClick={() => navigateTo(n.key)}
            >
              <span className="pa-nav-dot" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="pa-nav-spacer" />
        <div className="pa-sidebar-footer">
          <img
            className="pa-mdv-logo"
            src={`${(typeof window !== 'undefined' && window.PUBLIC_URL) || '/'}assets/logo_mdv.png`}
            alt="Mdv"
            onError={e => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <HealthBadge />
        </div>
      </aside>

      <main className="pa-main">
        <header className="pa-header">
          <div className="pa-header-title">
            <h1>{entry.title}</h1>
            <p>{entry.subtitle}</p>
          </div>
          <div className="pa-header-right">
            {/* Su "Partizioni" (panoramica di tutte) e "Storage" (capacità/disco fisico, globale)
                il filtro partizione non si applica; nel "Report builder" le select sono locali e
                indipendenti (quelle globali qui sopra vengono nascoste). */}
            {active !== 'partizioni' &&
              active !== 'storage' &&
              active !== 'report' &&
              active !== 'admin' &&
              partitionRows.length > 0 && (
              <div className="pa-period">
                <span>Partizione:</span>
                <select
                  className="pa-select"
                  value={partition}
                  onChange={e => setPartition(e.target.value)}
                >
                  <option value="">Tutte</option>
                  {partitionRows.map((p: any) => (
                    <option
                      key={p.partitionGuid}
                      value={p.partitionGuid}
                    >
                      {p.aeTitle || p.description || String(p.partitionGuid || '').slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {active !== 'report' && active !== 'admin' && (
              <div className="pa-period">
                <span>Periodo:</span>
                <select
                  className="pa-select"
                  value={periodKey}
                  onChange={e => setPeriodKey(e.target.value)}
                >
                  <option value="all">Tutti</option>
                  <option value="last12">Ultimi 12 mesi</option>
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
            )}
          </div>
        </header>

        <div className="pa-content">{entry.render({ period, goTo: navigateTo, setPartition })}</div>
        {pwOpen && (
          <PasswordModal
            onCancel={() => setPwOpen(false)}
            onSubmit={checkAdminPassword}
          />
        )}
      </main>
    </div>
  );
}

// La route OHIF passa props del viewer (servicesManager, ecc.): vengono ignorate.
export default function PacsAnalytics() {
  return (
    <PaErrorBoundary>
      <PacsAnalyticsInner />
    </PaErrorBoundary>
  );
}
