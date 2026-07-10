// WP6.3 - semantic UI tokens (single source for colors + font sizes).
// Convention: no color hex literals or raw fontSize numbers in module or
// component files. If a new color/size is needed, add a token here first.
import { createTheme } from '@mantine/core'

export const COLOR = {
  // Status / semantic accents
  profit: '#51cf66',
  loss: '#ff6b6b',
  accent: '#74c0fc', // light-blue emphasis text / values
  accentStrong: '#4dabf7',
  info: '#339af0', // active / selected blue
  warning: '#ffd43b',
  gold: '#ffd700', // "excellent" tier, Avarice chisel
  amber: '#fbbf24',
  chisel: '#fd7e14',
  orange: '#ff932b', // active-toggle orange (Atlas Calc)
  nightmare: '#cc88ff', // Nightmare map mods (purple)
  white: '#fff',

  // Text ramp (light -> dark)
  text: '#e0e0e0',
  textSoft: '#ccc',
  textDim: '#aaa',
  textFaint: '#888',
  textMuted: '#666',
  dim: '#555', // muted labels, neutral values, inactive borders

  // Surfaces (dark -> light)
  bgDeep: '#0d0e10',
  bgSunken: '#141517',
  bgPanel: '#16171a',
  bgInset: '#1a1b1e',
  bgRaised: '#1e1f22',
  bgHover: '#2a2b2e',
  bgHoverStrong: '#3a3b3e',

  // Borders
  border: '#2c2d30',
  borderDeep: '#1f2020',
  borderFaint: '#333',
  borderSoft: '#444',

  // Tinted section backgrounds (bg + matching border)
  tintTealBg: '#1a2020',
  tintTealBorder: '#2a4040',
  tintOliveBg: '#1e2018',
  tintOliveBorder: '#3a4020',
  tintYellowBg: '#12130e',
  tintYellowBorder: '#2a2d1a',
  tintGoldBg: '#2d2a10', // analyzer: excellent
  tintGreenBg: '#1a2d1a', // analyzer: good
  tintBlueBg: '#1a2a3d' // analyzer: decent
} as const

// Density pass (2026-07-08): small end lifted +1..+2 so token-driven surfaces
// match the Sessions reference panel (Mantine size="xs" body text = 12px).
// body === Mantine xs is the anchor; keep that equality if rescaling again.
export const FONT = {
  micro: 8,
  tiny: 9,
  label: 10, // uppercase letterspaced section labels
  small: 11,
  body: 12, // = Mantine size="xs"
  md: 13,
  stat: 15, // stat-tile values
  lg: 16,
  xl: 18
} as const

// App-wide Mantine theme (wired in main.tsx)
export const appTheme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'sm',
  components: {
    Checkbox: {
      // Lift unchecked checkbox borders out of near-invisibility on dark
      // surfaces (unchecked state only, so the checked fill still reads).
      styles: {
        input: {
          '&:not(:checked):not(:indeterminate)': { borderColor: COLOR.textFaint }
        }
      }
    }
  }
})
