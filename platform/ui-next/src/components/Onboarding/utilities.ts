import { ShepherdBase } from 'shepherd.js';
import { offset, flip, shift, detectOverflow } from '@floating-ui/dom';

/**
 * Retrieves the list of tours that have been shown from localStorage.
 * @returns {string[]} An array of tour IDs that have been shown.
 */

const getShownTours = () => JSON.parse(localStorage.getItem('shownTours')) || [];

/**
 * Checks if a specific tour has been shown.
 * @param {string} tourId - The ID of the tour to check.
 * @returns {boolean} True if the tour has been shown, false otherwise.
 */
const hasTourBeenShown = (tourId: string) => getShownTours().includes(tourId);

/**
 * Marks a specific tour as shown by adding it to localStorage.
 * @param {string} tourId - The ID of the tour to mark as shown.
 * @returns {void}
 */
const markTourAsShown = (tourId: string) => {
  const shownTours = getShownTours();
  if (!shownTours.includes(tourId)) {
    shownTours.push(tourId);
    localStorage.setItem('shownTours', JSON.stringify(shownTours));
  }
};

/**
 * Default handler for the 'show' event in Shepherd steps.
 * Adds a progress indicator to the footer of the current step.
 *
 * @param {ShepherdBase} Shepherd - The Shepherd.js instance.
 * @returns {void}
 */
const defaultShowHandler = (Shepherd: ShepherdBase) => {
  const currentStep = Shepherd.activeTour?.getCurrentStep();
  if (currentStep) {
    const progress = document.createElement('span');
    progress.className = 'shepherd-progress text-lg text-muted-foreground';
    progress.innerText = `${Shepherd.activeTour?.steps.indexOf(currentStep) + 1}/${Shepherd.activeTour?.steps.length}`;
    progress.style.position = 'absolute';
    progress.style.left = '13px';
    progress.style.bottom = '20px';
    progress.style.zIndex = '1';

    const footer = currentStep?.getElement()?.querySelector('.shepherd-footer');
    footer?.appendChild(progress);
  }
};

/**
 * Custom middleware for adjusting Shepherd step positioning when overflowing.
 *
 * @type {object}
 * @property {string} name - The name of the middleware.
 * @property {function} fn - The function that adjusts the position of the step when overflowing.
 */

const customMiddleware = {
  name: 'customOverflowMiddleware',
  async fn(state) {
    // Il confine e' lo schermo, non <body>.
    //
    // Qui il corpo della pagina non coincide con la finestra: il
    // visualizzatore disegna in un contenitore a posizione fissa e lascia il
    // corpo senza altezza propria. Misurando l'eccedenza contro quello, la
    // correzione verticale spingeva ogni passo esattamente sul bordo
    // inferiore - il riquadro esisteva, per il codice era visibile, e nessuno
    // lo vedeva.
    const overflow = await detectOverflow(state, {
      rootBoundary: 'viewport',
      padding: 24,
    });

    const xAdjustment =
      overflow.left > 0 ? overflow.left : overflow.right > 0 ? -overflow.right : 0;
    const yAdjustment =
      overflow.top > 0 ? overflow.top : overflow.bottom > 0 ? -overflow.bottom : 0;

    return {
      x: state.x + xAdjustment,
      y: state.y + yAdjustment,
    };
  },
};

/**
 * Default Floating UI middleware for positioning steps in Shepherd.js.
 * Includes offset, shift, flip, and custom overflow middleware.
 *
 * @type {Array<object>}
 */

const middleware = [offset(15), flip(), shift({ padding: 24 })];

export { hasTourBeenShown, markTourAsShown, middleware, defaultShowHandler };
