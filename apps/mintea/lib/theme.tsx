import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme, useColorScheme } from "nativewind";

import {
  isThemePreference,
  resolveThemePreference,
  type ThemePreference,
} from "./themePreference";

/**
 * Raw colour values for things that can't take a Tailwind class — SVG charts,
 * status bars, native navigation options. Kept in sync with the palette in
 * tailwind.config.js by hand; there are few enough of them that generating it
 * isn't worth the build step.
 */
export const palette = {
  mint: {
    100: "#D3F5E6",
    300: "#72D9B0",
    400: "#3FC291",
    500: "#1FA678",
    600: "#138661",
    700: "#106B4F",
    900: "#0C4635",
  },
  ink: {
    50: "#F7F9F7",
    100: "#EFF3F0",
    200: "#E2E8E4",
    300: "#CDD7D1",
    400: "#A4ADB8",
    500: "#74808E",
    600: "#54606E",
    700: "#3C4753",
    800: "#28313B",
    900: "#1A212A",
    950: "#0E1513",
  },
  positive: "#12A150",
  negative: "#DC2626",
  white: "#FFFFFF",
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
  positive: "#3ECF8E",
  negative: "#F87171",
  grid: palette.ink[800],
};

const THEME_STORAGE_KEY = "mintea.theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  setPreference: async () => undefined,
  isReady: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [isReady, setIsReady] = useState(false);
  const changedBeforeLoad = useRef(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (active && !changedBeforeLoad.current && isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      colorScheme.set(
        resolveThemePreference(preference, Appearance.getColorScheme()),
      );
    };

    apply();

    if (preference !== "system") return;
    const subscription = Appearance.addChangeListener(apply);
    return () => subscription.remove();
  }, [preference]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      if (next === preference) return;

      changedBeforeLoad.current = true;
      setPreferenceState(next);

      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      } catch (error) {
        setPreferenceState(preference);
        throw error;
      }
    },
    [preference],
  );

  return (
    <ThemeContext.Provider value={{ preference, setPreference, isReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): {
  colors: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  isReady: boolean;
} {
  const { colorScheme: scheme } = useColorScheme();
  const context = useContext(ThemeContext);
  const isDark = scheme === "dark";

  return {
    colors: isDark ? dark : light,
    isDark,
    ...context,
  };
}
