"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Home, ChevronDown } from "lucide-react";
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";

export const FloatingNav = ({
  navItems,
  className,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
}) => {
  const t = useTranslations();
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<Locale>("en");

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

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setLangMenuOpen(false);
    if (langMenuOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [langMenuOpen]);

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

        <Link
          href="/login"
          className="text-sm font-medium relative border border-amber-500/50 text-white px-4 py-2 rounded-full hover:border-amber-400 hover:bg-amber-500/10 transition-all"
        >
          <span>{t("common.signIn")}</span>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
};

