"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Home, ChevronDown } from "lucide-react";
import { locales, localeNames, localeFlags, type Locale } from "@/i18n/config";

export const FloatingNav = ({
  navItems,
  className,
  currentLocale = "en",
  onLocaleChange,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
  currentLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
}) => {
  const [visible, setVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

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

  const handleLocaleSelect = (locale: Locale) => {
    setLangMenuOpen(false);
    if (onLocaleChange) {
      onLocaleChange(locale);
    } else {
      // Default behavior: set cookie and reload
      document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
      window.location.reload();
    }
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
          "flex max-w-fit fixed top-4 inset-x-0 mx-auto border border-transparent dark:border-white/[0.2] rounded-full dark:bg-black bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)] z-[5000] pr-2 pl-4 py-2 items-center justify-center space-x-4",
          className
        )}
      >
        {/* Home link */}
        <Link
          href="/"
          className="relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-amber-400 hover:text-amber-600 transition-colors"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Link>

        {/* Separator */}
        <div className="h-4 w-px bg-neutral-700" />

        {navItems.map((navItem, idx) => (
          <Link
            key={`link-${idx}`}
            href={navItem.link}
            className={cn(
              "relative dark:text-neutral-50 items-center flex space-x-1 text-neutral-600 dark:hover:text-amber-400 hover:text-amber-600 transition-colors"
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
            className="flex items-center gap-1 text-sm dark:text-neutral-50 text-neutral-600 hover:text-amber-600 dark:hover:text-amber-400 transition-colors px-2 py-1"
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
          className="border text-sm font-medium relative border-neutral-200 dark:border-amber-500/30 text-black dark:text-white px-4 py-2 rounded-full hover:border-amber-500 transition-colors"
        >
          <span>Sign In</span>
          <span className="absolute inset-x-0 w-1/2 mx-auto -bottom-px bg-gradient-to-r from-transparent via-amber-500 to-transparent h-px" />
        </Link>
      </motion.div>
    </AnimatePresence>
  );
};

