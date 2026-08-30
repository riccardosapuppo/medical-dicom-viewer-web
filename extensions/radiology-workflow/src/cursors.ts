import { cursors } from '@cornerstonejs/tools';

/**
 * Cursors for the tools a reader spends the most time in.
 *
 * Cornerstone draws tool cursors from registered SVG, substituting {{color}}
 * for the active colour, so replacing one is a matter of registering a
 * different drawing under the same tool name. The stock cursors are arrows
 * with a small glyph beside them; these are the glyph alone, centred on the
 * hotspot, because on a diagnostic image the pointer sits over the pixels being
 * judged and a large opaque arrow hides them.
 */
const CURSORS: Array<{ tool: string; icon: string; size: number }> = [
  {
    // A circle half filled: the window is what divides shown from clipped.
    tool: 'WindowLevel',
    size: 512,
    icon: `
      <circle cx="256" cy="256" r="188" fill="none" stroke="{{color}}" stroke-width="34" />
      <path fill="{{color}}" d="M256 68 A188 188 0 0 0 256 444 Z" />`,
  },
  {
    // Two arrowheads on a shaft: the stack runs through the slice, not across it.
    tool: 'StackScroll',
    size: 512,
    icon: `
      <path fill="{{color}}" d="M256 40 L340 168 H172 Z" />
      <path fill="{{color}}" d="M256 472 L172 344 H340 Z" />
      <rect x="234" y="158" width="44" height="196" fill="{{color}}" />`,
  },
  {
    // Four arrowheads: the image moves, the frame does not.
    tool: 'Pan',
    size: 512,
    icon: `
      <path fill="{{color}}" d="M256 34 L330 130 H182 Z M256 478 L182 382 H330 Z
                                 M34 256 L130 182 V330 Z M478 256 L382 330 V182 Z" />
      <rect x="238" y="120" width="36" height="272" fill="{{color}}" />
      <rect x="120" y="238" width="272" height="36" fill="{{color}}" />`,
  },
];

/**
 * Registers them. Cornerstone reads the drawing when a tool becomes active, so
 * this only has to run before the reader picks up a tool, and running it twice
 * simply replaces the entry.
 */
export default function registerCursors(): void {
  for (const { tool, icon, size } of CURSORS) {
    cursors.registerCursor(tool, icon, { x: size, y: size });
  }
}
