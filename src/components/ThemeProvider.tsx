"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_PREFS, Preferences, ThemeKey, themeByKey } from "@/lib/themes";
import { LANGS, translate } from "@/lib/i18n";

type Ctx = {
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  setTheme: (k: ThemeKey) => void;
};

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children, initial }: { children: React.ReactNode; initial?: Partial<Preferences> }) {
  const [prefs, setPrefsState] = useState<Preferences>({ ...DEFAULT_PREFS, ...(initial ?? {}) });

  // Hydrate from localStorage (client-only override)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("nass-prefs");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Preferences>;
        setPrefsState((p) => ({ ...DEFAULT_PREFS, ...p, ...parsed }));
      }
    } catch {}
  }, []);

  // Apply theme variables + document language / text direction to <html>
  useEffect(() => {
    const t = themeByKey(prefs.theme);
    const root = document.documentElement;
    Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.theme = t.key;
    root.dataset.density = prefs.density;
    root.dataset.dark = String(t.isDark);
    root.style.colorScheme = t.isDark ? "dark" : "light";

    const lang = prefs.lang ?? DEFAULT_PREFS.lang;
    const entry = LANGS.find((l) => l.key === lang) ?? LANGS[0];
    root.lang = entry.key;
    root.dir = entry.dir;
  }, [prefs.theme, prefs.density, prefs.lang]);

  const setPrefs = useCallback((p: Partial<Preferences>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem("nass-prefs", JSON.stringify(next));
        // fire-and-forget server persistence
        fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences: next }),
        }).catch(() => {});
      } catch {}
      return next;
    });
  }, []);

  const setTheme = useCallback((k: ThemeKey) => setPrefs({ theme: k }), [setPrefs]);

  const value = useMemo(() => ({ prefs, setPrefs, setTheme }), [prefs, setPrefs, setTheme]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs outside PrefsProvider");
  return ctx;
}

export function useTranslate() {
  const { prefs } = usePrefs();
  const lang = prefs.lang ?? DEFAULT_PREFS.lang;
  return useCallback(
    (key: string, vars?: Record<string, string>) => translate(lang, key, vars),
    [lang],
  );
}
