import { useEffect } from 'react';
import { useShepherd } from 'react-shepherd';
import { StepOptions, TourOptions } from 'shepherd.js';
import { useLocation } from 'react-router';
import 'shepherd.js/dist/css/shepherd.css';
import './Onboarding.css';

import { hasTourBeenShown, markTourAsShown, defaultShowHandler, middleware } from './utilities';

/**
 * Attende che un elemento esista, e dice se e' arrivato.
 *
 * Restituisce anche il modo di smettere di aspettare: chi cambia pagina mentre
 * lo studio sta ancora caricando non deve ritrovarsi il giro guidato che parte
 * addosso alla pagina nuova.
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
     * Selettore da attendere prima di far partire il giro.
     *
     * Serve perche' questo effetto scatta al cambio di rotta, mentre lo studio
     * ci mette una ventina di secondi ad arrivare dall'archivio. Shepherd
     * risolve il bersaglio dei passi quando il giro parte: se il bersaglio non
     * c'e' ancora, il riquadro viene appeso a <body> e finisce sotto il bordo
     * inferiore della pagina - presente per il codice, invisibile per chi
     * guarda, con la pagina velata e nessun modo di chiuderlo.
     */
    waitFor?: string;
    /** Quanto attendere quel selettore prima di rinunciare del tutto al giro. */
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
      // Niente bersaglio, niente giro: meglio non mostrarlo che mostrarlo
      // appeso al nulla. Resta segnato come gia' visto, cosi' non ritenta a
      // ogni studio.
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
