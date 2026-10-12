/**
 * Theme tokens for SpendSense.
 * Supports both Light and Dark modes with curated, accessible palettes.
 */

export const Palette = {
  emerald: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
  },
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },
  amber: {
    500: '#F59E0B',
    600: '#D97706',
  },
  blue: {
    500: '#3B82F6',
    600: '#2563EB',
  },
  purple: {
    500: '#A855F7',
    600: '#9333EA',
  },
};

export const LightColors = {
  isDark: false,
  primary: Palette.emerald[700],
  primaryLight: '#E7F4EC',
  primaryHover: Palette.emerald[700],
  
  // Financial indicators
  income: Palette.emerald[600],
  incomeBg: Palette.emerald[50],
  expense: Palette.red[600],
  expenseBg: Palette.red[50],
  transfer: Palette.blue[600],
  
  // Backgrounds & Surfaces
  background: '#F4F8F5',
  surface: '#FFFFFF',
  surfaceElevated: '#EDF4EF',
  surfaceMuted: '#DDE9E0',
  
  // Text
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',
  
  // Borders & Dividers
  border: '#DCE8DF',
  borderStrong: '#C4D6C9',
  
  // Status & Navigation
  card: '#FFFFFF',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: Palette.emerald[700],
  tabInactive: '#94A3B8',
  
  // Modal / overlays
  backdrop: 'rgba(15, 23, 42, 0.4)',
};

export const DarkColors = {
  isDark: true,
  primary: Palette.emerald[500],
  primaryLight: 'rgba(16, 185, 129, 0.15)',
  primaryHover: Palette.emerald[600],
  
  // Financial indicators
  income: Palette.emerald[500],
  incomeBg: 'rgba(16, 185, 129, 0.15)',
  expense: Palette.red[500],
  expenseBg: 'rgba(239, 68, 68, 0.15)',
  transfer: Palette.blue[500],
  
  // Backgrounds & Surfaces
  background: '#0B1120',
  surface: '#151F32',
  surfaceElevated: '#1E293B',
  surfaceMuted: '#334155',
  
  // Text
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',
  
  // Borders & Dividers
  border: '#1E293B',
  borderStrong: '#334155',
  
  // Status & Navigation
  card: '#151F32',
  tabBar: '#101726',
  tabBarBorder: '#1E293B',
  tabActive: Palette.emerald[500],
  tabInactive: '#64748B',
  
  // Modal / overlays
  backdrop: 'rgba(0, 0, 0, 0.65)',
};

export type ThemeColors = typeof LightColors;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Typography = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  hero: 32,
};
