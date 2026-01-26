import * as React from "react";

export type AppTheme = "default" | "apple";

const APP_THEME_KEY = "simplecrm_app_theme";

type AppThemeContextValue = {
  appTheme: AppTheme;
  setAppTheme: (theme: AppTheme) => void;
};

const AppThemeContext = React.createContext<AppThemeContextValue | null>(null);

const getStoredTheme = (): AppTheme => {
  if (typeof window === "undefined") return "default";
  try {
    return localStorage.getItem(APP_THEME_KEY) === "apple" ? "apple" : "default";
  } catch {
    return "default";
  }
};

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [appTheme, setAppThemeState] = React.useState<AppTheme>(getStoredTheme);

  const setAppTheme = React.useCallback((theme: AppTheme) => {
    setAppThemeState(theme);
    try {
      localStorage.setItem(APP_THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, []);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APP_THEME_KEY) return;
      setAppThemeState(event.newValue === "apple" ? "apple" : "default");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return <AppThemeContext.Provider value={{ appTheme, setAppTheme }}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const context = React.useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }
  return context;
}
