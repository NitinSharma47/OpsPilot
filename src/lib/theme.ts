"use client";

import { createContext, useContext } from "react";

export const themeNames = ["light", "dark", "classic", "lovely"] as const;
export type ThemeName = (typeof themeNames)[number];

export const ThemeContext = createContext<{
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}>({
  theme: "light",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
