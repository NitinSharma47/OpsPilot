"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeContext, themeNames, type ThemeName } from "@/lib/theme";

const storageKey = "opspilot-theme";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved && themeNames.includes(saved as ThemeName)) {
      setThemeState(saved as ThemeName);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  function setTheme(next: ThemeName) {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(storageKey, next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
