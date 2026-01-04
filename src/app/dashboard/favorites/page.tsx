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
  Brain,
  Zap,
  ExternalLink,
  StarOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import type { PublicPlaybook } from "@/lib/supabase/types";

export default function FavoritesPage() {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<PublicPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUser(user);
      loadFavorites(user.id);
    });
  }, []);

  const loadFavorites = async (userId: string) => {
    const supabase = createBrowserClient();
    
    // Get starred playbook IDs
    const { data: stars } = await supabase
      .from("playbook_stars")
      .select("playbook_id")
      .eq("user_id", userId);
    
    if (!stars || stars.length === 0) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    const playbookIds = stars.map(s => s.playbook_id);
    
    // Get playbook details
    const { data: playbooks } = await supabase
      .from("playbooks")
      .select(`
        id, guid, name, description, is_public, star_count, tags, created_at, user_id,
        personas:personas(count),
        skills:skills(count),
        mcp_servers:mcp_servers(count)
      `)
      .in("id", playbookIds);

    const formattedPlaybooks = (playbooks || []).map((p: any) => ({
      ...p,
      personas_count: p.personas?.[0]?.count || 0,
      skills_count: p.skills?.[0]?.count || 0,
      mcp_servers_count: p.mcp_servers?.[0]?.count || 0,
      is_starred: true,
    }));

    setFavorites(formattedPlaybooks);
    setLoading(false);
  };

  const handleUnstar = async (playbookId: string) => {
    if (!user) return;
    
    const supabase = createBrowserClient();
    await supabase
      .from("playbook_stars")
      .delete()
      .eq("playbook_id", playbookId)
      .eq("user_id", user.id);
    
    setFavorites(prev => prev.filter(p => p.id !== playbookId));
  };

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
                <span className="text-white font-bold text-sm">AP</span>
              </div>
              <motion.span
                animate={{ 
                  opacity: sidebarOpen ? 1 : 0,
                  width: sidebarOpen ? "auto" : 0
                }}
                className="font-semibold text-lg whitespace-nowrap overflow-hidden text-amber-400"
              >
                AgentPlaybooks
              </motion.span>
            </Link>

            {/* Nav links */}
            <nav className="flex flex-col gap-1 mt-4">
              {sidebarLinks.map((link) => (
                <SidebarLink key={link.href} link={link} />
              ))}
            </nav>
          </div>

          {/* User section */}
          <div className="border-t border-blue-900/30 pt-4">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-blue-500/20 flex items-center justify-center text-sm font-medium text-blue-400">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <motion.div
                animate={{ 
                  opacity: sidebarOpen ? 1 : 0,
                  width: sidebarOpen ? "auto" : 0
                }}
                className="overflow-hidden"
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
              className="flex items-center gap-3 px-2 py-2 w-full text-red-400 hover:bg-red-500/10 rounded-lg transition-colors mt-2"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <motion.span
                animate={{ 
                  opacity: sidebarOpen ? 1 : 0,
                  width: sidebarOpen ? "auto" : 0
                }}
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
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Star className="h-8 w-8 text-amber-400" />
                {t("dashboard.favorites")}
              </h1>
              <p className="text-slate-400 mt-1">
                Playbooks you&apos;ve starred
              </p>
            </div>
          </div>

          {favorites.length === 0 ? (
            <div className="text-center py-16">
              <Star className="h-16 w-16 text-slate-700 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-400 mb-2">
                No favorites yet
              </h2>
              <p className="text-slate-500 mb-6">
                Star playbooks from the Explore page to add them here
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 rounded-lg font-medium hover:bg-amber-400 transition-colors"
              >
                <Globe className="h-5 w-5" />
                Explore Playbooks
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {favorites.map((playbook) => (
                <motion.div
                  key={playbook.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-5 rounded-xl border transition-all group",
                    "bg-gradient-to-br from-slate-900/80 to-slate-800/50",
                    "border-slate-700/50 hover:border-amber-500/30"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg group-hover:text-amber-400 transition-colors">
                      {playbook.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star className="h-4 w-4 fill-amber-400" />
                        {playbook.star_count}
                      </span>
                      <button
                        onClick={() => handleUnstar(playbook.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove from favorites"
                      >
                        <StarOff className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {playbook.description && (
                    <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                      {playbook.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Brain className="h-3.5 w-3.5" />
                      {playbook.personas_count} personas
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      {playbook.skills_count} skills
                    </span>
                  </div>

                  {playbook.tags && playbook.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {playbook.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-blue-900/30 rounded text-xs text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <Link
                    href={`/explore?playbook=${playbook.guid}`}
                    className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Details
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


