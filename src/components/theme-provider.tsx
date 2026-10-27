"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

const THEME_CHANGE_EVENT = "apb-theme-change";

function subscribeToTheme(onChange: () => void) {
    window.addEventListener("storage", onChange);
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    };
}

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
}: ThemeProviderProps) {
    const readTheme = useCallback((): Theme => {
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored === "light" || stored === "dark" || stored === "system") {
                return stored;
            }
        } catch {
            // Reading storage can be disabled by the browser.
        }
        return defaultTheme;
    }, [storageKey, defaultTheme]);
    // Hydration uses the same default as SSR before reading the saved choice.
    // Otherwise theme-dependent navigation icons can invalidate the page tree.
    const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => defaultTheme);

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
                .matches
                ? "dark"
                : "light";

            root.classList.add(systemTheme);
            return;
        }

        root.classList.add(theme);
    }, [theme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
        },
    };

    return (
        <ThemeProviderContext.Provider value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider");

    return context;
};
