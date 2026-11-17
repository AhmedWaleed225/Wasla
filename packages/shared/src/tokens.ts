/**
 * Design tokens taken from the approved Wasla design canvas
 * (board "03 · Design system & tokens"). Change values here, not in components.
 */
export const colors = {
  primary: '#0B6E5F', // Nile Teal
  primaryPressed: '#06302B', // Deep Teal
  primaryTint: '#DDF1EC', // Mint
  accent: '#F2A33A', // Sun Amber — fill only, never text on white
  accentTint: '#FDF0DC', // Sand
  accentText: '#7A4A06',
  text: '#0F1C1A', // Ink
  textSecondary: '#566360', // Slate
  textTertiary: '#3D4B48',
  placeholder: '#66736F',
  line: '#E3E8E6',
  lineStrong: '#D3DAD7',
  railLine: '#B9C4C0',
  ground: '#F4F6F5', // Mist
  surface: '#FFFFFF',
  muted: '#EDF0EF',
  success: '#17804A',
  successTint: '#E5F3EA',
  successText: '#0F5A33',
  info: '#2357C6',
  infoTint: '#E3ECFB',
  infoText: '#1B448F',
  warning: '#B86A0E',
  danger: '#C2362B',
  dangerTint: '#FBE6E3',
  dangerText: '#9B2219',
  women: '#7A1F5C',
  womenTint: '#F6E6F1',
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { tag: 8, icon: 14, button: 16, card: 20, sheet: 28, pill: 999 } as const;

export const fontSize = { caption: 12, meta: 13, body: 15, h3: 15, h2: 18, h1: 26, price: 20, display: 44 } as const;

export const lineHeight = { caption: 18, meta: 18, body: 22, h2: 24, h1: 32 } as const;

/** Arabic text runs +2 px line height. */
export const arabicLineHeightBonus = 2;

export const touch = { min: 44, button: 52, field: 56 } as const;

export const motion = { fastMs: 150, sheetMs: 280 } as const;

export const tokens = { colors, space, radius, fontSize, lineHeight, touch, motion } as const;
export type Tokens = typeof tokens;
