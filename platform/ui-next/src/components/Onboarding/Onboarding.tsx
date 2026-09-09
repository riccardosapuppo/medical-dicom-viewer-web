import { useEffect } from 'react';
import { useShepherd } from 'react-shepherd';
import { StepOptions, TourOptions } from 'shepherd.js';
import { useLocation } from 'react-router';
import 'shepherd.js/dist/css/shepherd.css';
import './Onboarding.css';

import { hasTourBeenShown, markTourAsShown, defaultShowHandler, middleware } from './utilities';

/**
 * Waits for an element to exist, and says whether it turned up.
 *
 * It also hands back a way to stop waiting: somebody who changes page while the study is
 * still loading should not find the guided tour starting on top of the new one.
 */
function attendiElemento(selettore: string, attesaMassimaMs: number) {
  let ferma = () => {};

  const promessa = new Promise<boolean>(risolvi => {
    if (document.querySelector(selettore)) {
      risolvi(true);
      return;
    }

    const intervallo = 100;
    let trascorso = 0;

    const controllo = setInterval(() => {
      if (document.querySelector(selettore)) {
        clearInterval(controllo);
        risolvi(true);
        return;
      }

      trascorso += intervallo;
      if (trascorso >= attesaMassimaMs) {
        clearInterval(controllo);
        risolvi(false);
      }
    }, intervallo);

    ferma = () => {
      clearInterval(controllo);
      risolvi(false);
    };
  });

  return { promessa, ferma: () => ferma() };
}

const Onboarding = ({
  tours = [],
}: {
  tours?: Array<{
    id: string;
    route: string;
    tourOptions: TourOptions;
    steps: StepOptions[];
    /**
     * The selector to wait for before the tour starts.
     *
     * It is needed because this effect fires on a change of route, while the study takes
     * some twenty seconds to arrive from the archive. Shepherd resolves each step's
     * target when the tour starts: with no target there yet, the box is hung off <body>
     * and ends up below the bottom edge of the page, present as far as the code is
     * concerned and invisible to anyone looking, with the page dimmed and no way to
     * close it.
     */
    waitFor?: string;
    /** How long to wait for that selector before giving the tour up entirely. */
    waitForTimeout?: number;
  }>;
}) => {
  const Shepherd = useShepherd();
  const location = useLocation();

  /**
   * Show the tour if it hasn't been shown yet based on the current route.
   * Constructs a tour instance and adds steps to it based on the matching tour.
   */
  useEffect(() => {
    if (!tours.length) {
      return;
    }

    const matchingTour = tours.find(tour => tour.route === location.pathname);
    if (!matchingTour || hasTourBeenShown(matchingTour.id)) {
      return;
    }

    let annullato = false;
    const attesa = matchingTour.waitFor
      ? attendiElemento(matchingTour.waitFor, matchingTour.waitForTimeout ?? 60000)
      : { promessa: Promise.resolve(true), ferma: () => {} };

    attesa.promessa.then(pronto => {
      // No target, no tour: better not shown than shown hanging off nothing. It is still
      // marked as seen, so it does not try again on every study.
      if (annullato || !pronto) {
        markTourAsShown(matchingTour.id);
        return;
      }

      const tourInstance = new Shepherd.Tour({
        ...matchingTour.tourOptions,
        defaultStepOptions: {
          ...matchingTour.tourOptions?.defaultStepOptions,
          floatingUIOptions: matchingTour.tourOptions?.defaultStepOptions?.floatingUIOptions || {
            middleware,
          },
          when: {
            ...matchingTour.tourOptions?.defaultStepOptions?.when,
            show:
              matchingTour.tourOptions?.defaultStepOptions?.when?.show ||
              (() => defaultShowHandler(Shepherd)),
          },
        },
      });
      matchingTour.steps.forEach(step => tourInstance.addStep(step));
      tourInstance.start();
      markTourAsShown(matchingTour.id);
    });

    return () => {
      annullato = true;
      attesa.ferma();
    };
  }, [Shepherd, tours, location.pathname]);

  return null;
};

export { Onboarding };
