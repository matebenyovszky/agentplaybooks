"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { 
  Sidebar, 
  SidebarBody, 
  SidebarLink 
} from "@/components/ui/sidebar";
import { 
  BookOpen, 
  Globe, 
  Settings, 
  LogOut, 
  Star,
  Play
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUser(user);
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
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
      icon: <Settings className="h-5 w-5 text-slate-400" />,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white flex">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-10 border-r border-blue-900/30">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 py-2 px-2 mb-2">
              <div className="h-9 w-9 shrink-0 bg-gradient-to-br from-blue-500 to-amber-400 rounded-lg flex items-center justify-center">
                <Play className="h-5 w-5 text-white fill-white" />
              </div>
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
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-amber-400 flex items-center justify-center text-sm font-bold">
                {user?.email?.charAt(0).toUpperCase() || "?"}
              </div>
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

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-2 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors w-full"
            >
              <LogOut className="h-5 w-5 shrink-0" />
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
  );
}

