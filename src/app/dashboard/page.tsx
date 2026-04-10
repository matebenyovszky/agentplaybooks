"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { useDashboardAuth } from "./DashboardAuthContext";
import {
  BookOpen,
  Plus,
  Zap,
  Lock,
  Eye,
  Server,
  Database
} from "lucide-react";
import type { Playbook } from "@/lib/supabase/types";
import { authFetch } from "@/lib/auth-fetch";

// API returns Playbook rows enriched with computed counts
type PlaybookWithCounts = Playbook & {
  skill_count?: number;
  mcp_server_count?: number;
  persona_count?: number;
  memory_count?: number;
};

export default function DashboardPage() {
  const t = useTranslations();
  const { user } = useDashboardAuth();
  const [playbooks, setPlaybooks] = useState<PlaybookWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let active = true;
    const loadPlaybooks = async () => {
      const res = await authFetch("/api/manage/playbooks");
      const data = await res.json().catch(() => null);

      if (!active) return;
      setPlaybooks(Array.isArray(data) ? data as PlaybookWithCounts[] : []);
      setLoading(false);
    };

    loadPlaybooks();

    return () => {
      active = false;
    };
  }, [user]);

  const handleCreatePlaybook = async () => {
    const name = prompt("Enter playbook name:");
    if (!name || !user) return;

    const res = await authFetch("/api/manage/playbooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description: "",
        config: {},
        visibility: "private",
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      alert("Error creating playbook");
      return;
    }

    setPlaybooks([data as PlaybookWithCounts, ...playbooks]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            {t("dashboard.welcome")}, {user?.email?.split("@")[0]}
          </h1>
          <p className="text-neutral-600 dark:text-slate-400 mt-1">{t("dashboard.myPlaybooks")}</p>
        </div>
        <button
          onClick={handleCreatePlaybook}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-900 rounded-lg font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25"
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
          <BookOpen className="h-16 w-16 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-neutral-600 dark:text-slate-400 mb-2">
            {t("dashboard.noPlaybooks")}
          </h2>
          <p className="text-neutral-500 dark:text-slate-500 mb-6">
            Create your first playbook to get started
          </p>
          <button
            onClick={handleCreatePlaybook}
            className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 rounded-lg font-semibold inline-flex items-center gap-2 shadow-lg shadow-amber-500/25"
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
                className="block p-6 bg-white dark:bg-blue-950/30 border border-neutral-200 dark:border-blue-900/50 rounded-xl hover:border-amber-500/30 hover:shadow-lg dark:hover:shadow-none transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{playbook.name}</h3>
                  {playbook.visibility === 'public' ? (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 px-2 py-1 rounded-full">
                      <Eye className="h-3 w-3" />
                      {t("dashboard.playbookCard.public")}
                    </span>
                  ) : playbook.visibility === 'unlisted' ? (
                    <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-gray-400 bg-neutral-100 dark:bg-gray-500/10 px-2 py-1 rounded-full">
                      <Eye className="h-3 w-3" />
                      Unlisted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-slate-400 bg-neutral-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                      <Lock className="h-3 w-3" />
                      {t("dashboard.playbookCard.private")}
                    </span>
                  )}
                </div>

                {playbook.description && (
                  <p className="text-sm text-neutral-600 dark:text-slate-400 mb-4 line-clamp-2">
                    {playbook.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    {playbook.skill_count || 0} {t("dashboard.playbookCard.skills")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Server className="h-4 w-4" />
                    {playbook.mcp_server_count || 0} MCP
                  </span>
                  <span className="flex items-center gap-1">
                    <Database className="h-4 w-4" />
                    {playbook.memory_count || 0} Memory
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-blue-900/30">
                  <code className="text-xs text-neutral-400 dark:text-slate-500 font-mono">
                    /{playbook.guid}
                  </code>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
