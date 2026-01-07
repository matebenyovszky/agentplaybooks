"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Home, ChevronDown, BookOpen, LogOut, Globe, Server, Star, Settings, LayoutDashboard, Rss } from "lucide-react";
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";
import { createBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export const FloatingNav = ({
  navItems: customNavItems,
  className,
}: {
  navItems?: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
}) => {
  const t = useTranslations();

  // State declarations - must come before useMemo that depends on them
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<Locale>("en");
  const [user, setUser] = useState<User | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Default nav items - used if no custom items provided
  const defaultNavItems = useMemo(() => [
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.selfHost"), link: "/enterprise", icon: <Server className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
    { name: t("common.blog"), link: "/blog", icon: <Rss className="h-4 w-4" /> },
  ], [t]);

  // Nav items for logged-in users - includes Dashboard link
  const loggedInNavItems = useMemo(() => [
    { name: t("common.dashboard"), link: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.selfHost"), link: "/enterprise", icon: <Server className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
    { name: t("common.blog"), link: "/blog", icon: <Rss className="h-4 w-4" /> },
  ], [t]);

  // Dashboard menu items - used in user dropdown
  const dashboardItems = useMemo(() => [
    { name: t("dashboard.myPlaybooks"), link: "/dashboard", icon: <BookOpen className="h-4 w-4" /> },
    { name: t("dashboard.favorites"), link: "/dashboard/favorites", icon: <Star className="h-4 w-4" /> },
    { name: t("common.settings"), link: "/dashboard/settings", icon: <Settings className="h-4 w-4" /> },
  ], [t]);

  // Use logged-in nav items when user is authenticated, otherwise default
  const navItems = customNavItems || (user ? loggedInNavItems : defaultNavItems);

  // Check authentication status
  useEffect(() => {
    const supabase = createBrowserClient();

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Read locale from cookie on mount
  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith("NEXT_LOCALE="))
      ?.split("=")[1] as Locale | undefined;

    if (cookieLocale && locales.includes(cookieLocale)) {
      setCurrentLocale(cookieLocale);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 100) {
        setVisible(true);
      } else if (currentScrollY > lastScrollY) {
        setVisible(false);
      } else {
        setVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setLangMenuOpen(false);
      setUserMenuOpen(false);
    };
    if (langMenuOpen || userMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [langMenuOpen, userMenuOpen]);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setUserMenuOpen(false);
    window.location.href = "/";
  };

  const handleLocaleSelect = (newLocale: Locale) => {
    setLangMenuOpen(false);
    setCurrentLocale(newLocale);
    // Set cookie and reload to apply new locale
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
    window.location.reload();
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 1,
          y: 0,
        }}
        animate={{
          y: visible ? 0 : -100,
          opacity: visible ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          "flex max-w-fit fixed top-4 inset-x-0 mx-auto border border-white/[0.2] rounded-full bg-black shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)] z-[5000] pr-2 pl-4 py-2 items-center justify-center space-x-4",
          className
        )}
      >
        {/* Home link */}
        <Link
          href="/"
          className="relative text-neutral-50 items-center flex space-x-1 hover:text-amber-400 transition-colors"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Link>

        {navItems.map((navItem, idx) => (
          <Link
            key={`link-${idx}`}
            href={navItem.link}
            className={cn(
              "relative text-neutral-50 items-center flex space-x-1 hover:text-amber-400 transition-colors"
            )}
          >
            <span className="block sm:hidden">{navItem.icon}</span>
            <span className="hidden sm:block text-sm">{navItem.name}</span>
          </Link>
        ))}

        {/* Language selector */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLangMenuOpen(!langMenuOpen);
            }}
            className="flex items-center gap-1 text-sm text-neutral-50 hover:text-amber-400 transition-colors px-2 py-1"
          >
            <span>{localeFlags[currentLocale]}</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", langMenuOpen && "rotate-180")} />
          </button>

          <AnimatePresence>
            {langMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full right-0 mt-2 py-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl min-w-[140px]"
                onClick={(e) => e.stopPropagation()}
              >
                {locales.map((locale) => (
                  <button
                    key={locale}
                    onClick={() => handleLocaleSelect(locale)}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-800 transition-colors",
                      currentLocale === locale ? "text-amber-400" : "text-neutral-300"
                    )}
                  >
                    <span>{localeFlags[locale]}</span>
                    <span>{localeNames[locale]}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Auth section - show user menu or sign in */}
        {user ? (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setUserMenuOpen(!userMenuOpen);
              }}
              className="flex items-center gap-2 text-sm font-medium border border-amber-500/50 text-white px-3 py-2 rounded-full hover:border-amber-400 hover:bg-amber-500/10 transition-all"
            >
              <span className="w-6 h-6 rounded-full bg-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-400">
                {user.email?.charAt(0).toUpperCase() || "U"}
              </span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", userMenuOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 py-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-4 py-2 border-b border-neutral-700">
                    <p className="text-xs text-neutral-400 truncate">{user.email}</p>
                  </div>
                  {dashboardItems.map((item, idx) => (
                    <Link
                      key={idx}
                      href={item.link}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-800 transition-colors text-neutral-300"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </Link>
                  ))}
                  <div className="border-t border-neutral-700 mt-1 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-800 transition-colors text-red-400"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{t("dashboard.signOut")}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium relative border border-amber-500/50 text-white px-4 py-2 rounded-full hover:border-amber-400 hover:bg-amber-500/10 transition-all"
          >
            <span>{t("common.signIn")}</span>
          </Link>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

