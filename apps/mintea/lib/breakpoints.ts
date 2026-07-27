import { useWindowDimensions } from 'react-native';

/**
 * Layout breakpoints, matching Tailwind's so `md:` classes and JS-side layout
 * decisions flip at the same width.
 */
export const BREAKPOINTS = {
  /** Phones below this; tablets and desktop above. */
  md: 768,
  lg: 1024,
} as const;

export function useBreakpoint() {
  const { width } = useWindowDimensions();

  return {
    width,
    /** Phone-sized. Bottom tab bar, single column, full-bleed cards. */
    isCompact: width < BREAKPOINTS.md,
    /** Tablet and up. Side navigation, centred content column. */
    isWide: width >= BREAKPOINTS.md,
    isLarge: width >= BREAKPOINTS.lg,
  };
}
