// Design system for Freedwise — "The Commonplace Instrument".
//
// Freedwise is a memory instrument, not a cozy library. The chrome speaks in
// grotesk + monospace (the instrument's voice); the *book's own words* are the
// only thing set in serif (Newsreader). That serif/sans split is semantic:
// serif === a quoted passage from a book, never decoration.
//
// Signature element: the "marker stroke" — a skewed highlighter swipe behind
// one hero word or number per screen (see components/MarkerText). It is the
// product's core action (highlighting) turned into the brand.

// A Palette is the set of color tokens that flips between light and dark.
// Non-color tokens (type/space/border/radius) are theme-invariant and stay as
// direct imports. Both palettes share the same keys so makeStyles factories work
// against either.
export interface Palette {
  ink: string;
  inkSoft: string;
  inkFaint: string;
  paper: string;
  card: string;
  line: string;
  lineSoft: string;
  marker: string;
  markerDeep: string;
  pop: string;
  popText: string;
  good: string;
  warn: string;
  danger: string;
  white: string;
  black: string;
}

export const lightPalette: Palette = {
  // Cool print, deliberately NOT warm cream. Paper is a cool grey-white.
  ink: '#17181C', // near-black, faintly cool — primary text, borders
  inkSoft: '#5B5D66', // muted ink — secondary text, captions
  inkFaint: '#9A9CA6', // faint ink — tertiary / disabled
  paper: '#ECEDE8', // cool grey-white — app background
  card: '#F6F6F2', // very slightly lifted paper — surfaces
  line: '#17181C', // hard ink rules (cards are bordered, not shadowed)
  lineSoft: '#D8D9D2', // hairline separators within surfaces

  marker: '#FFE34D', // highlighter yellow — THE signature accent
  markerDeep: '#E8C200', // pressed/again state of the marker
  pop: '#2B2BF5', // riso ink-blue — interactive + structural accents
  popText: '#FFFFFF',

  // Functional accents kept in the riso family, not iOS system colors.
  good: '#1F8A4C', // recall: good (review grading)
  warn: '#C2410C', // recall: hard
  danger: '#C81E47', // again / destructive
  white: '#FFFFFF',
  black: '#000000',
};

// Dark = the Commonplace Instrument inverted: deep cool-grey "paper", light ink,
// the SAME signature marker yellow + riso blue so the brand reads identically.
export const darkPalette: Palette = {
  ink: '#ECEDE8', // light ink on dark paper — primary text, borders
  inkSoft: '#A2A4AD', // muted
  inkFaint: '#6A6C75', // faint / disabled
  paper: '#141519', // deep cool near-black — app background
  card: '#1E1F25', // slightly lifted surface
  line: '#ECEDE8', // hard rules now light
  lineSoft: '#2C2D34', // hairline separators

  marker: '#FFE34D', // unchanged signature accent
  markerDeep: '#E8C200',
  pop: '#5B6BFF', // riso blue lifted for contrast on dark
  popText: '#0B0B0F',

  good: '#3FB873',
  warn: '#E0743C',
  danger: '#F0506E',
  white: '#FFFFFF',
  black: '#000000',
};

// Back-compat default: any file still importing `palette` directly gets light.
// Converted screens use the active palette via useTheme()/makeStyles instead.
export const palette = lightPalette;

// Highlighter ink colors for the marker palette (used on highlights/cards).
// Tuned to sit on cool paper rather than the old candy pastels.
export const markerInks = {
  yellow: '#FFE34D',
  green: '#A8E0B0',
  blue: '#A9C7FF',
  pink: '#F7B2C8',
  orange: '#FFC487',
} as const;
