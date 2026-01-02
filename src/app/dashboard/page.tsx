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
  Plus,
  Brain,
  Zap,
  Lock,
  Eye
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Playbook } from "@/lib/supabase/types";

export default function DashboardPage() {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
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
    });

    // Get user's playbooks
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data } = await supabase
          .from("playbooks")
          .select("*")
          .order("created_at", { ascending: false });
        
        setPlaybooks((data as Playbook[]) || []);
      }
      setLoading(false);
    });
  }, []);

  const handleSignOut = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleCreatePlaybook = async () => {
    const supabase = createBrowserClient();
    
    const name = prompt("Enter playbook name:");
    if (!name) return;

    const guid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    const { data, error } = await supabase
      .from("playbooks")
      .insert({
        user_id: user?.id,
        guid,
        name,
        description: "",
        config: {},
        is_public: false,
      })
      .select()
      .single();

    if (error) {
      alert("Error creating playbook: " + error.message);
      return;
    }

    setPlaybooks([data as Playbook, ...playbooks]);
  };

  const sidebarLinks = [
    {
      label: t("dashboard.myPlaybooks"),
      href: "/dashboard",
      icon: <BookOpen className="h-5 w-5 text-neutral-400" />,
    },
    {
      label: t("common.explore"),
      href: "/explore",
      icon: <Globe className="h-5 w-5 text-neutral-400" />,
    },
    {
      label: "Settings",
      href: "/dashboard/settings",
      icon: <Settings className="h-5 w-5 text-neutral-400" />,
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-10 border-r border-neutral-800">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 py-2">
              <div className="h-8 w-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg" />
              <motion.span
                animate={{ opacity: sidebarOpen ? 1 : 0 }}
                className="text-lg font-bold gradient-text whitespace-pre"
              >
                AgentPlaybooks
              </motion.span>
            </Link>

            {/* Navigation */}
            <div className="mt-8 flex flex-col gap-2">
              {sidebarLinks.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>

          {/* User section */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <motion.div
                animate={{ opacity: sidebarOpen ? 1 : 0 }}
                className="whitespace-pre"
              >
                <p className="text-sm font-medium truncate max-w-[150px]">
                  {user?.email}
                </p>
              </motion.div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors w-full py-2"
            >
              <LogOut className="h-5 w-5" />
              <motion.span
                animate={{ opacity: sidebarOpen ? 1 : 0 }}
                className="whitespace-pre"
              >
                {t("common.signOut")}
              </motion.span>
            </button>
          </div>
        </SidebarBody>
      </Sidebar>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">
                {t("dashboard.welcome")}, {user?.email?.split("@")[0]}
              </h1>
              <p className="text-neutral-400 mt-1">{t("dashboard.myPlaybooks")}</p>
            </div>
            <button
              onClick={handleCreatePlaybook}
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Plus className="h-5 w-5" />
              {t("dashboard.createPlaybook")}
            </button>
          </div>

          {playbooks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <BookOpen className="h-16 w-16 text-neutral-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-neutral-400 mb-2">
                {t("dashboard.noPlaybooks")}
              </h2>
              <p className="text-neutral-500 mb-6">
                Create your first playbook to get started
              </p>
              <button
                onClick={handleCreatePlaybook}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg font-semibold inline-flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                {t("dashboard.createPlaybook")}
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playbooks.map((playbook, idx) => (
                <motion.div
                  key={playbook.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Link
                    href={`/dashboard/playbook/${playbook.id}`}
                    className="block p-6 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-semibold">{playbook.name}</h3>
                      {playbook.is_public ? (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                          <Eye className="h-3 w-3" />
                          {t("dashboard.playbookCard.public")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800 px-2 py-1 rounded-full">
                          <Lock className="h-3 w-3" />
                          {t("dashboard.playbookCard.private")}
                        </span>
                      )}
                    </div>
                    
                    {playbook.description && (
                      <p className="text-sm text-neutral-400 mb-4 line-clamp-2">
                        {playbook.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Brain className="h-4 w-4" />
                        0 {t("dashboard.playbookCard.personas")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-4 w-4" />
                        0 {t("dashboard.playbookCard.skills")}
                      </span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-neutral-800">
                      <code className="text-xs text-neutral-500 font-mono">
                        /{playbook.guid}
                      </code>
                    </div>
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

