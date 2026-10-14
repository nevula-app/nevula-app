// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export type DisplayTheme = 'dark' | 'light';

const KEY = 'nevula.display.theme.v1';

export type HomePalette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  danger: string;
};

export const HOME_PALETTES: Record<DisplayTheme, HomePalette> = {
  dark: {
    bg: '#0B0D10',
    surface: '#12151A',
    surfaceAlt: '#181C22',
    border: '#2A313B',
    text: '#F2F4F7',
    muted: '#8B93A0',
    accent: '#3B82F6',
    accentSoft: '#1A2740',
    danger: '#C81E35',
  },
  light: {
    bg: '#EEF2F7',
    surface: '#F7F9FC',
    surfaceAlt: '#E4EAF2',
    border: '#C5D0DE',
    text: '#15181D',
    muted: '#5A6B80',
    // Match Camera header blue (#7fb2ff family) across light screens
    accent: '#4D8FE9',
    accentSoft: '#D6E4F8',
    danger: '#B42318',
  },
};

/** NEVULA eyebrow / brand line — same blue as Camera top bar */
export const BRAND_EYEBROW = '#7fb2ff';

export async function loadDisplayTheme(): Promise<DisplayTheme> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw === 'light' ? 'light' : 'dark';
}

export async function saveDisplayTheme(theme: DisplayTheme) {
  await SecureStore.setItemAsync(KEY, theme, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

type DisplayThemeContextValue = {
  theme: DisplayTheme;
  palette: HomePalette;
  setTheme: (next: DisplayTheme) => Promise<void>;
  ready: boolean;
};

const DisplayThemeContext = createContext<DisplayThemeContextValue>({
  theme: 'dark',
  palette: HOME_PALETTES.dark,
  setTheme: async () => undefined,
  ready: false,
});

export function DisplayThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<DisplayTheme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadDisplayTheme()
      .then(setThemeState)
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const setTheme = useCallback(async (next: DisplayTheme) => {
    setThemeState(next);
    try {
      await saveDisplayTheme(next);
    } catch {
      /* keep local choice */
    }
  }, []);

  const value = useMemo(
    () => ({ theme, palette: HOME_PALETTES[theme], setTheme, ready }),
    [theme, setTheme, ready],
  );

  return <DisplayThemeContext.Provider value={value}>{children}</DisplayThemeContext.Provider>;
}

export function useDisplayTheme() {
  return useContext(DisplayThemeContext);
}
