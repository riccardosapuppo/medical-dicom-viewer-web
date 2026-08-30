import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Switch,
  Label,
  Icons,
} from '@ohif/ui-next';
import {
  getContext,
  ensureStudyInfoFromMetadata,
  readPreferenze,
  listSavedConfigs,
  saveConfig,
  deleteConfig,
  applyConfigNow,
  normalizza,
  canonModalityKey,
} from '../../../../../platform/app/public/estensioni/gestioneHP/hpStore';

type Scope = 'studioSpecifico' | 'descrizioneEsame' | 'modality';

type CaptureOptions = {
  grid: boolean;
  series: boolean;
  instance: boolean;
  windowLevel: boolean;
  zoomPan: boolean;
  colorLut: boolean;
};

const TOGGLES: Array<{ key: keyof CaptureOptions; label: string; hint: string }> = [
  { key: 'series', label: 'Serie', hint: 'Aggancia ogni viewport alla sua serie' },
  { key: 'instance', label: 'Istanza specifica', hint: "L'immagine/slice visualizzata" },
  { key: 'windowLevel', label: 'Window Level', hint: 'Luminosità/contrasto (WW/WC)' },
  { key: 'zoomPan', label: 'Zoom / Pan', hint: 'Inquadratura corrente' },
  { key: 'colorLut', label: 'Color LUT', hint: 'Mappa colore (colormap)' },
];

const SCOPE_TABS: Array<{ value: Scope; label: string }> = [
  { value: 'studioSpecifico', label: 'Studio' },
  { value: 'descrizioneEsame', label: 'Esame' },
  { value: 'modality', label: 'Modality' },
];

const ALL_ON: CaptureOptions = {
  grid: true,
  series: true,
  instance: true,
  windowLevel: true,
  zoomPan: true,
  colorLut: true,
};
const GRID_ONLY: CaptureOptions = {
  grid: true,
  series: false,
  instance: false,
  windowLevel: false,
  zoomPan: false,
  colorLut: false,
};

const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  window.servicesManager?.services?.uiNotificationService?.show({
    title: 'Hanging protocol',
    message,
    type,
  });
};

function GridIcon({ rows, columns }: { rows: number; columns: number }) {
  const total = Math.min(rows * columns, 64);
  return (
    <div
      className="border-input grid shrink-0 gap-[2px] rounded border p-1"
      style={{
        gridTemplateColumns: `repeat(${columns}, 6px)`,
        gridTemplateRows: `repeat(${rows}, 6px)`,
      }}
    >
      {Array.from({ length: total }).map((_, idx) => (
        <span
          key={idx}
          className="bg-primary/40 block h-[6px] w-[6px] rounded-[1px]"
        />
      ))}
    </div>
  );
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'bg-destructive/20 text-destructive'
      : 'bg-primary/20 text-foreground';
  return <span className={`${cls} rounded px-1.5 py-0.5 text-xs`}>{children}</span>;
}

function CapturedChips({ captured, hasMontage }: { captured: CaptureOptions; hasMontage?: boolean }) {
  const chips = [
    captured.grid !== false && 'Griglia',
    hasMontage && 'Sottogriglia',
    captured.series && 'Serie',
    captured.instance && 'Istanza',
    captured.windowLevel && 'WL',
    captured.zoomPan && 'Zoom',
    captured.colorLut && 'LUT',
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(c => (
        <Chip key={c}>{c}</Chip>
      ))}
    </div>
  );
}

type SavedItem = {
  scope: Scope;
  key: string;
  scopeLabel: string;
  title: string;
  layout: { rows: number; columns: number };
  captured: CaptureOptions;
  hasMontage: boolean;
  isApplied: boolean;
  relevant: boolean;
  applicable: boolean;
  missingSeries: number;
  entry: any;
};

type ModalProps = { hide: () => void };

export default function HangingProtocolManagerModal({ hide }: ModalProps) {
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState(() => getContext());
  const [preferenzeJson, setPreferenzeJson] = useState<any>(null);
  const [scope, setScope] = useState<Scope>('studioSpecifico');
  const [captureOptions, setCaptureOptions] = useState<CaptureOptions>({ ...ALL_ON });
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  const refresh = useCallback(async () => {
    const payload = await readPreferenze();
    setPreferenzeJson(payload.json);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await ensureStudyInfoFromMetadata();
      const payload = await readPreferenze();
      if (!active) {
        return;
      }
      setCtx(getContext());
      setPreferenzeJson(payload.json);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const savedList: SavedItem[] = useMemo(
    () => (preferenzeJson ? listSavedConfigs(preferenzeJson, ctx) : []),
    [preferenzeJson, ctx]
  );
  const relevantList = useMemo(() => savedList.filter(i => i.relevant), [savedList]);
  const otherList = useMemo(() => savedList.filter(i => !i.relevant), [savedList]);

  const toggleOption = (key: keyof CaptureOptions, value: boolean) => {
    setCaptureOptions(prev => ({ ...prev, [key]: value }));
  };

  const existsForScope = useMemo(() => {
    const hp = preferenzeJson?.hp;
    if (!hp) {
      return false;
    }
    if (scope === 'studioSpecifico') {
      return !!hp.studioSpecifico?.[ctx.studyInstanceUIDs];
    }
    if (scope === 'descrizioneEsame') {
      // Confronto NORMALIZZATO, coerente con save/delete/caricamento: così il pulsante
      // mostra "Sovrascrivi" (e chiede conferma) anche per un'entry legacy senza nome.
      const target = normalizza(ctx.studyDescription);
      return (hp.nomeEsame || []).some((i: any) => normalizza(i?.nomeEsame) === target);
    }
    // Chiave CANONICA (insieme ordinato), coerente con saveConfig/deleteConfig/dedup:
    // "Sovrascrivi" appare solo se esiste una config della STESSA combinazione di modality
    // → il salvataggio la sovrascrive davvero (niente doppione), e combinazioni diverse
    // ma sovrapposte (es. 'PT\CT' vs 'CT') restano config distinte.
    const target = canonModalityKey(ctx.modality);
    return (hp.modality || []).some((i: any) => canonModalityKey(i?.nomeModality) === target);
  }, [preferenzeJson, scope, ctx]);

  const modalityMissing = scope === 'modality' && !ctx.modality;
  const esameSenzaNome = scope === 'descrizioneEsame' && !ctx.studyDescription;

  const doSave = useCallback(async () => {
    setConfirmOverwrite(false);
    setBusy(true);
    try {
      const res = await saveConfig(scope, captureOptions);
      if (res?.ok) {
        notify('Configurazione salvata', 'success');
        await refresh();
      } else {
        notify(res?.reason || 'Salvataggio non riuscito', 'error');
      }
    } finally {
      setBusy(false);
    }
  }, [scope, captureOptions, refresh]);

  const onSaveClick = () => {
    if (modalityMissing) {
      notify('Modality non disponibile per questo studio', 'error');
      return;
    }
    if (existsForScope) {
      setConfirmOverwrite(true);
      return;
    }
    doSave();
  };

  const onDelete = async (item: SavedItem) => {
    setBusy(true);
    try {
      const res = await deleteConfig(item.scope, item.key);
      if (res?.ok) {
        notify('Configurazione eliminata', 'info');
        await refresh();
      } else {
        notify(res?.reason || 'Eliminazione non riuscita', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const onApply = (item: SavedItem, gridOnly: boolean) => {
    setBusy(true);
    try {
      const res = applyConfigNow(item.entry, { gridOnly });
      if (res?.ok) {
        notify(gridOnly ? 'Griglia caricata' : 'Configurazione caricata', 'success');
        hide();
      } else {
        notify(res?.reason || 'Caricamento non riuscito', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="text-foreground p-6 text-center text-base">Caricamento…</div>;
  }

  const renderSavedItem = (item: SavedItem, manage: boolean) => (
    <li
      key={`${item.scope}:${item.key}`}
      className="border-input bg-muted/30 flex items-center gap-3 rounded-md border p-2"
    >
      <GridIcon
        rows={item.layout.rows}
        columns={item.layout.columns}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{item.scopeLabel}</Chip>
          <span className="truncate font-medium">{item.title}</span>
          {item.isApplied && (
            <span className="bg-primary text-primary-foreground rounded px-1.5 py-0.5 text-xs">
              Attiva ora
            </span>
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 text-xs">
          Griglia {item.layout.columns}×{item.layout.rows}
        </div>
        <div className="mt-1">
          <CapturedChips
            captured={item.captured}
            hasMontage={item.hasMontage}
          />
        </div>
        {!manage && !item.applicable && (
          <div className="text-destructive mt-1 flex items-center gap-1 text-xs">
            <Icons.StatusWarning className="h-3.5 w-3.5" />
            {item.missingSeries} serie non disponibili in questo studio
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {!manage &&
          (item.applicable ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onApply(item, false)}
            >
              Carica
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onApply(item, true)}
            >
              Carica solo griglia
            </Button>
          ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(item)}
        >
          <Icons.Trash className="mr-1 h-4 w-4" />
          Elimina
        </Button>
      </div>
    </li>
  );

  return (
    <div className="text-foreground flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-1 text-base">
      {/* Header info studio */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md p-3">
        <div>
          <span className="text-muted-foreground">Esame: </span>
          <span className="font-medium">{ctx.studyDescription || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Modality: </span>
          <span className="font-medium">{ctx.modality || '—'}</span>
        </div>
      </div>

      {/* Sezione salvataggio */}
      <section className="border-input rounded-md border p-3">
        <h3 className="mb-3 text-base font-semibold">Salva la visualizzazione attuale</h3>

        <Tabs
          value={scope}
          onValueChange={v => {
            setScope(v as Scope);
            setConfirmOverwrite(false);
          }}
        >
          <TabsList className="w-full">
            {SCOPE_TABS.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex-1"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="studioSpecifico">
            <p className="text-muted-foreground py-2 text-sm">
              Si applicherà <span className="text-foreground font-medium">solo a questo studio</span>.
            </p>
          </TabsContent>
          <TabsContent value="descrizioneEsame">
            <p className="text-muted-foreground py-2 text-sm">
              Si applicherà a tutti gli esami con descrizione{' '}
              <span className="text-foreground font-medium">{ctx.studyDescription || '(senza nome)'}</span>.
            </p>
            {esameSenzaNome && (
              <p className="text-destructive flex items-center gap-1 text-sm">
                <Icons.StatusWarning className="h-4 w-4" />
                Questo esame non ha un nome: la config varrà per tutti gli esami senza nome.
              </p>
            )}
          </TabsContent>
          <TabsContent value="modality">
            <p className="text-muted-foreground py-2 text-sm">
              Si applicherà a tutti gli esami con modality{' '}
              <span className="text-foreground font-medium">{ctx.modality || '—'}</span>.
            </p>
            {modalityMissing && (
              <p className="text-destructive flex items-center gap-1 text-sm">
                <Icons.StatusWarning className="h-4 w-4" />
                Modality non disponibile per questo studio.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {/* Cosa salvare — toggle granulari */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-muted-foreground text-sm">Cosa salvare</Label>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setCaptureOptions({ ...ALL_ON })}
              >
                Tutto
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setCaptureOptions({ ...GRID_ONLY })}
              >
                Solo griglia
              </button>
            </div>
          </div>
          <div className="border-input rounded-md border p-3">
            <p className="text-muted-foreground mb-2 text-xs">
              La griglia (e l'eventuale sottogriglia) viene sempre salvata. Scegli cos'altro includere:
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TOGGLES.map(t => (
                <label
                  key={t.key}
                  className="hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-3 rounded p-1.5"
                >
                  <span className="flex flex-col">
                    <span className="text-sm">{t.label}</span>
                    <span className="text-muted-foreground text-xs">{t.hint}</span>
                  </span>
                  <Switch
                    checked={!!captureOptions[t.key]}
                    onCheckedChange={v => toggleOption(t.key, v)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Azione salva */}
        <div className="mt-3 flex items-center justify-end gap-2">
          {confirmOverwrite ? (
            <>
              <span className="text-muted-foreground mr-auto text-sm">
                Sovrascrivere la configurazione esistente?
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmOverwrite(false)}
              >
                Annulla
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={doSave}
              >
                Sovrascrivi
              </Button>
            </>
          ) : (
            <Button
              disabled={busy || modalityMissing}
              onClick={onSaveClick}
            >
              {existsForScope ? 'Sovrascrivi configurazione' : 'Salva configurazione'}
            </Button>
          )}
        </div>
      </section>

      {/* Configurazioni per questo studio */}
      <section className="border-input rounded-md border p-3">
        <h3 className="mb-2 text-base font-semibold">Configurazioni per questo studio</h3>
        {relevantList.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nessuna configurazione salvata applicabile a questo studio.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">{relevantList.map(item => renderSavedItem(item, false))}</ul>
        )}

        {otherList.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              className="text-primary text-sm hover:underline"
              onClick={() => setShowOthers(s => !s)}
            >
              {showOthers
                ? '▾ Nascondi altre configurazioni'
                : `▸ Altre configurazioni salvate (${otherList.length}) — gestione`}
            </button>
            {showOthers && (
              <>
                <p className="text-muted-foreground mb-2 mt-1 text-xs">
                  Configurazioni di altri esami/modality. Qui puoi solo eliminarle (non sono
                  applicabili a questo studio).
                </p>
                <ul className="flex flex-col gap-2">
                  {otherList.map(item => renderSavedItem(item, true))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={hide}
        >
          Chiudi
        </Button>
      </div>
    </div>
  );
}
