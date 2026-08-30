import { addTool, ReferenceCursors, ScaleOverlayTool } from '@cornerstonejs/tools';

/**
 * Two Cornerstone tools the stock viewer never exposes.
 *
 * Both ship with Cornerstone and neither is registered by OHIF, so no toolbar
 * can offer them: a button for either would sit there and do nothing. They are
 * added here, and the mode puts them in the default tool group.
 *
 * Reference cursors put the pointer's position in one viewport onto every other
 * viewport showing the same anatomy, which is how you show a colleague what you
 * are looking at without describing it. The scale overlay draws a ruler down the
 * side of the image, so a lesion can be sized by eye before anyone reaches for
 * a measurement tool.
 */
export default function registerTools(): void {
  addTool(ReferenceCursors);
  addTool(ScaleOverlayTool);
}
