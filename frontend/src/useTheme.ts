import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "transport-planner-theme";

export type Theme = "light" | "dark";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function setStoredTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void } {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setStoredTheme(theme);
  }, [theme]);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggleTheme };
}
