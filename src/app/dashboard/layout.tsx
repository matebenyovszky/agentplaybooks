"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { DashboardAuthProvider } from "./DashboardAuthContext";
import {
  Sidebar,
  SidebarBody,
  SidebarLink
} from "@/components/ui/sidebar";
import { useTheme } from "@/components/theme-provider";
import {
  BookOpen,
  Globe,
  Settings,
  LogOut,
  Star,
  Play,
  Sun,
  Moon,
  Laptop
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const supabase = useMemo(() => createBrowserClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      // Allow viewing public playbooks without login (playbook/[id] pages)
      // Only redirect if we're on main dashboard pages that require auth
      const isPlaybookViewerPage = pathname.includes('/dashboard/playbook/');

      if (!user && !isPlaybookViewerPage) {
        router.push("/login");
        return;
      }
      setUser(user);
      setLoading(false);
    });
  }, [supabase, pathname, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const sidebarLinks = [
    {
      label: t("dashboard.myPlaybooks"),
      href: "/dashboard",
      icon: <BookOpen className="h-5 w-5 text-blue-400" />,
    },
    {
      label: t("dashboard.favorites"),
      href: "/dashboard/favorites",
      icon: <Star className="h-5 w-5 text-amber-400" />,
    },
    {
      label: t("common.explore"),
      href: "/explore",
      icon: <Globe className="h-5 w-5 text-emerald-400" />,
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: <Settings className="h-5 w-5 text-neutral-500 dark:text-slate-400" />,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DashboardAuthProvider value={{ supabase, user, loading }}>
      <div className="min-h-screen bg-background text-foreground flex">
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="justify-between gap-10 border-r border-blue-900/30">
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-blue-900/20 transition-all duration-200">
                <span className="shrink-0 flex items-center justify-center w-6 h-6">
                  <div className="h-6 w-6 bg-gradient-to-br from-blue-500 to-amber-400 rounded-md flex items-center justify-center">
                    <Play className="h-3.5 w-3.5 text-white fill-white" />
                  </div>
                </span>
                <motion.span
                  animate={{
                    opacity: sidebarOpen ? 1 : 0,
                    width: sidebarOpen ? "auto" : 0
                  }}
                  transition={{ duration: 0.2 }}
                  className="text-lg font-bold text-amber-400 whitespace-nowrap overflow-hidden"
                >
                  AgentPlaybooks
                </motion.span>
              </Link>

              {/* Navigation */}
              <div className="mt-4 flex flex-col gap-1">
                {sidebarLinks.map((link, idx) => (
                  <SidebarLink key={idx} link={link} />
                ))}
              </div>
            </div>

            {/* User section */}
            <div className="border-t border-blue-900/30 pt-4 mt-4">
              <div className="flex items-center gap-3 mb-3 py-2.5 px-2">
                <span className="shrink-0 flex items-center justify-center w-6">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-amber-400 flex items-center justify-center text-xs font-bold">
                    {user?.email?.charAt(0).toUpperCase() || "?"}
                  </div>
                </span>
                <motion.div
                  animate={{
                    opacity: sidebarOpen ? 1 : 0,
                    width: sidebarOpen ? "auto" : 0
                  }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  <p className="text-sm font-medium truncate max-w-[140px]">
                    {user?.user_metadata?.full_name || user?.email?.split("@")[0]}
                  </p>
                  <p className="text-xs text-slate-500 truncate max-w-[140px]">
                    {user?.email}
                  </p>
                </motion.div>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={() => {
                  if (theme === "light") setTheme("dark");
                  else if (theme === "dark") setTheme("system");
                  else setTheme("light");
                }}
                className="flex items-center gap-3 py-2.5 px-2 text-neutral-600 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors w-full"
                title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
              >
                <span className="shrink-0 flex items-center justify-center w-6">
                  {theme === "light" && <Sun className="h-5 w-5" />}
                  {theme === "dark" && <Moon className="h-5 w-5" />}
                  {theme === "system" && <Laptop className="h-5 w-5" />}
                </span>
                <motion.span
                  animate={{
                    opacity: sidebarOpen ? 1 : 0,
                    width: sidebarOpen ? "auto" : 0
                  }}
                  transition={{ duration: 0.2 }}
                  className="text-sm whitespace-nowrap overflow-hidden"
                >
                  Theme: {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </motion.span>
              </button>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 py-2.5 px-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors w-full"
              >
                <span className="shrink-0 flex items-center justify-center w-6">
                  <LogOut className="h-5 w-5" />
                </span>
                <motion.span
                  animate={{
                    opacity: sidebarOpen ? 1 : 0,
                    width: sidebarOpen ? "auto" : 0
                  }}
                  transition={{ duration: 0.2 }}
                  className="text-sm whitespace-nowrap overflow-hidden"
                >
                  {t("dashboard.signOut")}
                </motion.span>
              </button>
            </div>
          </SidebarBody>
        </Sidebar>

        {/* Main content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </DashboardAuthProvider>
  );
}

