/**
 * Closes the guided tour, which otherwise sits over every one of these checks.
 *
 * It opens on a first visit, dims the page to thirty per cent and takes the
 * clicks. A check that leaves it up is measuring a veil: the layout check
 * reported the tour's own text as overlapping the page, the controls check
 * pressed buttons nothing could reach, and the screenshots in the README were
 * of a dimmed viewer.
 *
 * All three had their own copy of this, all three named the buttons as they
 * were called before they were renamed, and none of the three noticed.
 */
import { requireInSource } from './in-source.mjs';

/** What the tour's last and first buttons say, from its own customization. */
const LABELS = ['Close', 'Got it'];

/** For requireInSource: rename either label and the checks go red. */
export const TOUR_HANDLES = LABELS.map(label => ({
  name: `tour button "${label}"`,
  handle: `text: '${label}'`,
}));

export function requireTour(root) {
  requireInSource(root, TOUR_HANDLES);
}

/**
 * @returns {Promise<boolean>} whether a button was there to press.
 */
export async function dismissTour(page, settle = 1300) {
  const closed = await page.evaluate(labels => {
    const button = [...document.querySelectorAll('.shepherd-button')].find(one =>
      labels.includes((one.innerText || '').trim())
    );
    button?.click();
    return Boolean(button);
  }, LABELS);

  await page.waitForTimeout(settle);

  // The veil is a separate element from the box, and on some steps it outlives
  // the click. Nothing here is checking the tour, so what is left of it goes.
  await page.evaluate(() => {
    for (const leftover of document.querySelectorAll('.shepherd-modal-overlay-container')) {
      leftover.remove();
    }
  });

  return closed;
}
