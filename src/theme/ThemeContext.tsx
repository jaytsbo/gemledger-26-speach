import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useLedgerStore } from '../store/useLedgerStore';
import { DARK_COLORS, LIGHT_COLORS, ThemeColors, ThemeMode } from './colors';

const THEME_STORAGE_KEY = 'GEMLEDGER_THEME_MODE';

export interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  colors: LIGHT_COLORS,
  setMode: () => {},
  toggleTheme: () => {},
});

function readStoredThemeMode(): ThemeMode | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      const val = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
      if (val === 'light' || val === 'dark' || val === 'system') {
        return val;
      }
    }
  } catch {
    // Ignore storage read errors on restricted environments
  }
  return null;
}

function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore storage write errors
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const storeThemeMode = useLedgerStore((s) => s.settings.themeMode);
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    const saved = readStoredThemeMode();
    if (saved) {
      console.log(`[ThemeContext/init] RestoreWeb - Mode:${saved}`);
      setModeState(saved);
    }
  }, []);

  useEffect(() => {
    if (
      !readStoredThemeMode() &&
      (storeThemeMode === 'light' || storeThemeMode === 'dark' || storeThemeMode === 'system')
    ) {
      console.log(`[ThemeContext/syncStore] Sync - Mode:${storeThemeMode}`);
      setModeState(storeThemeMode);
    }
  }, [storeThemeMode]);

  const setMode = (nextMode: ThemeMode) => {
    console.log(`[ThemeContext/setMode] Update - Mode:${nextMode}`);
    setModeState(nextMode);
    writeStoredThemeMode(nextMode);
    useLedgerStore
      .getState()
      .updateSettings({ themeMode: nextMode })
      .catch(() => {});
  };

  const isDark = useMemo(() => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return systemScheme === 'dark';
  }, [mode, systemScheme]);

  const toggleTheme = () => {
    const next: ThemeMode = isDark ? 'light' : 'dark';
    setMode(next);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark,
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      setMode,
      toggleTheme,
    }),
    [mode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
