"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { 
  BookOpen, 
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

  useEffect(() => {
    const supabase = createBrowserClient();

    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
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
          <h1 className="text-3xl font-bold">
            {t("dashboard.welcome")}, {user?.email?.split("@")[0]}
          </h1>
          <p className="text-slate-400 mt-1">{t("dashboard.myPlaybooks")}</p>
        </div>
        <button
          onClick={handleCreatePlaybook}
          className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-400 text-slate-900 rounded-lg font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-amber-500/25"
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
          <BookOpen className="h-16 w-16 text-blue-800 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-400 mb-2">
            {t("dashboard.noPlaybooks")}
          </h2>
          <p className="text-slate-500 mb-6">
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
                className="block p-6 bg-blue-950/30 border border-blue-900/50 rounded-xl hover:border-amber-500/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold">{playbook.name}</h3>
                  {playbook.is_public ? (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                      <Eye className="h-3 w-3" />
                      {t("dashboard.playbookCard.public")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-blue-900/30 px-2 py-1 rounded-full">
                      <Lock className="h-3 w-3" />
                      {t("dashboard.playbookCard.private")}
                    </span>
                  )}
                </div>
                
                {playbook.description && (
                  <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                    {playbook.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <Brain className="h-4 w-4" />
                    0 {t("dashboard.playbookCard.personas")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    0 {t("dashboard.playbookCard.skills")}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-blue-900/30">
                  <code className="text-xs text-slate-500 font-mono">
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
