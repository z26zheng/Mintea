import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { colorScheme, useColorScheme } from 'nativewind';

/**
 * Raw colour values for things that can't take a Tailwind class — SVG charts,
 * status bars, native navigation options. Kept in sync with the palette in
 * tailwind.config.js by hand; there are few enough of them that generating it
 * isn't worth the build step.
 */
export const palette = {
  mint: {
    100: '#D3F5E6',
    300: '#72D9B0',
    400: '#3FC291',
    500: '#1FA678',
    600: '#138661',
    700: '#106B4F',
    900: '#0C4635',
  },
  ink: {
    50: '#F7F9F7',
    100: '#EFF3F0',
    200: '#E2E8E4',
    300: '#CDD7D1',
    400: '#A4ADB8',
    500: '#74808E',
    600: '#54606E',
    700: '#3C4753',
    800: '#28313B',
    900: '#1A212A',
    950: '#0E1513',
  },
  positive: '#12A150',
  negative: '#DC2626',
  white: '#FFFFFF',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  positive: string;
  negative: string;
  grid: string;
};

const light: ThemeColors = {
  background: palette.ink[50],
  surface: palette.white,
  border: palette.ink[200],
  text: palette.ink[900],
  textMuted: palette.ink[500],
  accent: palette.mint[600],
  accentSoft: palette.mint[100],
  positive: palette.positive,
  negative: palette.negative,
  grid: palette.ink[200],
};

const dark: ThemeColors = {
  background: palette.ink[950],
  surface: palette.ink[900],
  border: palette.ink[800],
  text: palette.ink[50],
  textMuted: palette.ink[400],
  accent: palette.mint[400],
  accentSoft: palette.mint[900],
  positive: '#3ECF8E',
  negative: '#F87171',
  grid: palette.ink[800],
};

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const { colorScheme: scheme } = useColorScheme();
  const isDark = scheme === 'dark';

  return { colors: isDark ? dark : light, isDark };
}

/**
 * Keeps NativeWind's colour scheme in step with the operating system.
 *
 * Needed because Tailwind's `dark:` variants are gated on a `.dark` class, and
 * NativeWind's web runtime only *adds* that class for an explicit 'dark' —
 * passing 'system' removes it, leaving the web app permanently light. Native
 * handles 'system' correctly on its own, so only web mirrors `Appearance`.
 */
export function useSystemColorScheme(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      colorScheme.set('system');
      return;
    }

    const apply = () =>
      colorScheme.set(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

    apply();

    const subscription = Appearance.addChangeListener(apply);
    return () => subscription.remove();
  }, []);
}
