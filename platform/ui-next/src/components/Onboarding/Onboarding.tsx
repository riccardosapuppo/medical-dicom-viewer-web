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
function waitForElement(selector: string, timeoutMs: number) {
  let stop = () => {};

  const promise = new Promise<boolean>(resolve => {
    if (document.querySelector(selector)) {
      resolve(true);
      return;
    }

    const every = 100;
    let elapsed = 0;

    const timer = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(timer);
        resolve(true);
        return;
      }

      elapsed += every;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, every);

    stop = () => {
      clearInterval(timer);
      resolve(false);
    };
  });

  return { promise, stop: () => stop() };
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

    let cancelled = false;
    const waiting = matchingTour.waitFor
      ? waitForElement(matchingTour.waitFor, matchingTour.waitForTimeout ?? 60000)
      : { promise: Promise.resolve(true), stop: () => {} };

    waiting.promise.then(ready => {
      // No target, no tour: better not shown than shown hanging off nothing. It is still
      // marked as seen, so it does not try again on every study.
      if (cancelled || !ready) {
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
      cancelled = true;
      waiting.stop();
    };
  }, [Shepherd, tours, location.pathname]);

  return null;
};

export { Onboarding };
