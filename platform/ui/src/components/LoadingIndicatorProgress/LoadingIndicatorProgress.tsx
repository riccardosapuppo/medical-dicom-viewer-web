import React, { useState, useEffect, ReactElement } from 'react';
import classNames from 'classnames';

import ProgressLoadingBar from '../ProgressLoadingBar';
import { Icons } from '@ohif/ui-next';

// Step messages shown below the progress bar, mapped to the current progress
// bucket so the user sees what the app is actually doing while the study loads.
const LOADING_STEPS: Array<{ threshold: number; label: string }> = [
  { threshold: 0, label: 'Inizializzazione viewer...' },
  { threshold: 15, label: 'Connessione al server DICOM...' },
  { threshold: 35, label: 'Download metadati studio...' },
  { threshold: 55, label: 'Elaborazione serie e immagini...' },
  { threshold: 75, label: 'Preparazione layout e strumenti...' },
  { threshold: 92, label: 'Quasi pronto...' },
];

const getStepLabel = (progress: number | undefined): string => {
  if (progress === undefined) {
    return LOADING_STEPS[0].label;
  }
  let label = LOADING_STEPS[0].label;
  for (const step of LOADING_STEPS) {
    if (progress >= step.threshold) {
      label = step.label;
    }
  }
  return label;
};

/**
 *  A React component that renders a loading indicator.
 * if progress is not provided, it will render an infinite loading indicator
 * if progress is provided, it will render a progress bar
 * Optionally a textBlock can be provided to display a message
 */
function LoadingIndicatorProgress({ className, textBlock, progress }) {
  const [_progress, setProgress] = useState<number | undefined>(0);
  useEffect(() => {
    const updateFakeProgress = () => {
      setProgress(prevProgress => {
        if (prevProgress === undefined) {
          return 0;
        }
        if (prevProgress >= 100) {
          return 100; // Imposta il massimo a 100%
        }
        // Incrementa il progresso con un valore casuale tra 10 e 30
        const randomIncrement = Math.floor(Math.random() * 21) + 10;
        return Math.min(prevProgress + randomIncrement, 100); // Evita di superare il 100%
      });

      // Imposta un intervallo casuale tra 100ms e 500ms per il prossimo aggiornamento
      const randomInterval = Math.floor(Math.random() * 401) + 100;
      setTimeout(updateFakeProgress, randomInterval);
    };

    // Avvia l'aggiornamento del progresso fake, mentre reale se caricamento file da locale dove ho una percentuale effettiva
    if (!window.portableVersion) {
      updateFakeProgress();
    }

    // Non c'è bisogno di pulire setTimeout come si fa con setInterval
  }, []);

  const effectiveProgress = window.portableVersion ? progress : _progress;
  const stepLabel = getStepLabel(effectiveProgress);
  const version = (process.env.VERSION_NUMBER || '').trim();

  return (
    <div
      className={classNames(
        'absolute top-0 left-0 z-50 flex flex-col items-center justify-center space-y-3',
        className
      )}
    >
      {/* Logo Mdv sopra la barra, proporzionato alla larghezza della barra. */}
      <img
        src="assets/logo_mdv.png"
        alt="Mdv"
        className="mdv-loading-logo"
        style={{ width: 140, height: 'auto', objectFit: 'contain' }}
      />
      <div className="w-48">
        <ProgressLoadingBar progress={effectiveProgress} />
      </div>

      {/* Percentuale + etichetta del passo corrente. */}
      <div className="flex flex-col items-center space-y-1">
        {typeof effectiveProgress === 'number' && (
          <div className="mdv-loading-pct text-base font-semibold text-white tabular-nums">
            {Math.round(effectiveProgress)}%
          </div>
        )}
        {/* If the caller provides a custom textBlock, respect it. Otherwise show
            a progress-driven step label so the splash screen isn't blank. */}
        {textBlock || (
          <div
            key={stepLabel}
            className="mdv-loading-step text-center text-[13px] text-white/80"
            style={{ minHeight: 18, letterSpacing: 0.2 }}
          >
            {stepLabel}
          </div>
        )}
      </div>

      {/* Pallini "floating" animati (accento Mdv). */}
      <div
        className="mdv-loading-dots"
        aria-hidden="true"
      >
        <span></span>
        <span></span>
        <span></span>
      </div>

      {/* Numero di versione fisso in basso alla finestra. */}
      {version && (
        <div className="fixed bottom-3 left-0 right-0 text-center text-[11px] tracking-wide text-white/35">
          v{version}
        </div>
      )}
    </div>
  );
}

export default LoadingIndicatorProgress;
