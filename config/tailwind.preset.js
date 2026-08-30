/**
 * The palette, for the half of the viewer that does not use CSS variables.
 *
 * OHIF is two generations of UI package at once. The newer one publishes its
 * colours as CSS custom properties, which config/../theme.css redefines. The
 * older one carries 132 literal hex values in its Tailwind preset, and the
 * toolbar is built from those: theming only the variables recolours half the
 * application and leaves the rest visibly stock. This preset is applied after
 * both of OHIF's, so these names win.
 *
 * The scheme is slate with one warm accent. Cool grey-blue is what a reporting
 * display should be, because anything more saturated competes with the image;
 * amber is spent only on what the reader has deliberately kept, so it never
 * appears twice meaning two different things.
 */

const slate = {
  abyss: '#0d0f12',
  ground: '#111418',
  panel: '#1a1f26',
  raised: '#212832',
  line: '#272e38',
  muted: '#5b6472',
  dim: '#94a3b8',
  text: '#e2e8f0',
};

const accent = {
  /** State: which tool is active, which viewport has focus. */
  live: '#38bdf8',
  liveDim: '#7dd3fc',
  /** Kept: starred frames, saved arrangements. Nothing else may use it. */
  kept: '#f59e0b',
};

module.exports = {
  theme: {
    extend: {
      colors: {
        aqua: { pale: slate.dim },

        primary: {
          light: accent.live,
          main: '#1e6fb8',
          dark: slate.abyss,
          active: accent.live,
        },

        inputfield: {
          main: slate.line,
          disabled: slate.panel,
          focus: accent.live,
          placeholder: slate.muted,
        },

        secondary: {
          light: slate.line,
          main: slate.panel,
          dark: slate.ground,
          active: slate.raised,
        },

        indigo: { dark: slate.panel },

        common: {
          bright: slate.text,
          light: slate.dim,
          main: '#fff',
          dark: slate.muted,
          active: slate.raised,
        },

        bkg: {
          low: slate.abyss,
          med: slate.ground,
          full: slate.panel,
        },

        info: {
          primary: slate.text,
          secondary: slate.dim,
        },

        actions: {
          primary: accent.live,
          highlight: accent.kept,
          hover: 'rgba(56, 189, 248, 0.18)',
        },

        customblue: {
          10: '#161b22',
          20: slate.panel,
          30: slate.raised,
          40: slate.line,
          50: '#2d3542',
          80: accent.live,
          100: slate.text,
          200: accent.liveDim,
          300: '#1e242c',
          400: slate.dim,
        },

        customgray: { 100: slate.panel },

        /** Named for meaning, for this repository's own components. */
        reading: {
          kept: accent.kept,
          live: accent.live,
          rule: slate.line,
          label: slate.text,
          ground: slate.panel,
        },
      },
    },
  },
};
