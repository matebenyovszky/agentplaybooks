"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { 
  Zap, 
  Server, 
  Search,
  BookOpen,
  Building2,
  Globe,
  CheckCircle,
  TrendingUp
} from "lucide-react";
import type { PublicSkill, PublicMCPServer } from "@/lib/supabase/types";

type TabType = "skills" | "mcp";

export default function ExplorePage() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<TabType>("skills");
  const [skills, setSkills] = useState<PublicSkill[]>([]);
  const [mcpServers, setMcpServers] = useState<PublicMCPServer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const navItems = [
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.enterprise"), link: "/enterprise", icon: <Building2 className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
  ];

  useEffect(() => {
    loadData();
  }, [searchQuery, selectedTags]);

  const loadData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedTags.length) params.set("tags", selectedTags.join(","));

    const [skillsRes, mcpRes] = await Promise.all([
      fetch(`/api/public/skills?${params}`),
      fetch(`/api/public/mcp?${params}`),
    ]);

    const skillsData = await skillsRes.json();
    const mcpData = await mcpRes.json();

    setSkills(Array.isArray(skillsData) ? skillsData : []);
    setMcpServers(Array.isArray(mcpData) ? mcpData : []);
    setLoading(false);
  };

  const allTags = [
    "coding", "writing", "data", "automation", 
    "research", "creative", "business", "education"
  ];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <FloatingNav navItems={navItems} />

      {/* Hero */}
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 gradient-text">
            {t("explore.title")}
          </h1>
          <p className="text-xl text-slate-400">
            {t("landing.publicRepo.description")}
          </p>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="px-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("explore.search")}
              className="w-full pl-12 pr-4 py-4 bg-blue-950/30 border border-blue-900/50 rounded-xl focus:outline-none focus:border-amber-500 text-lg"
            />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-8">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  selectedTags.includes(tag)
                    ? "bg-amber-500 text-slate-900"
                    : "bg-blue-950/50 text-slate-400 hover:bg-blue-900/50 border border-blue-800/30"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-4 border-b border-blue-900/30 mb-8">
            <button
              onClick={() => setActiveTab("skills")}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "skills"
                  ? "border-amber-500 text-white"
                  : "border-transparent text-slate-400"
              }`}
            >
              <Zap className="h-5 w-5" />
              {t("explore.skills")}
              <span className="px-2 py-0.5 bg-blue-900/30 rounded-full text-xs">
                {skills.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("mcp")}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "mcp"
                  ? "border-amber-500 text-white"
                  : "border-transparent text-slate-400"
              }`}
            >
              <Server className="h-5 w-5" />
              {t("explore.mcp")}
              <span className="px-2 py-0.5 bg-blue-900/30 rounded-full text-xs">
                {mcpServers.length}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
          ) : activeTab === "skills" ? (
            skills.length === 0 ? (
              <EmptyState 
                icon={<Zap className="h-12 w-12" />}
                message="No skills found"
                subMessage="Try adjusting your search or filters"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {skills.map((skill, idx) => (
                  <SkillCard key={skill.id} skill={skill} index={idx} />
                ))}
              </div>
            )
          ) : (
            mcpServers.length === 0 ? (
              <EmptyState 
                icon={<Server className="h-12 w-12" />}
                message="No MCP servers found"
                subMessage="Try adjusting your search or filters"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mcpServers.map((mcp, idx) => (
                  <MCPCard key={mcp.id} mcp={mcp} index={idx} />
                ))}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ 
  icon, 
  message, 
  subMessage 
}: { 
  icon: React.ReactNode; 
  message: string; 
  subMessage: string;
}) {
  return (
    <div className="text-center py-16">
      <div className="text-blue-700 mb-4 flex justify-center">{icon}</div>
      <h3 className="text-xl font-semibold text-slate-400 mb-2">{message}</h3>
      <p className="text-slate-500">{subMessage}</p>
    </div>
  );
}

function SkillCard({ skill, index }: { skill: PublicSkill; index: number }) {
  const t = useTranslations();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-5 bg-blue-950/30 border border-blue-900/50 rounded-xl hover:border-amber-500/30 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Zap className="h-5 w-5 text-amber-400" />
          </div>
          <h3 className="font-semibold">{skill.name}</h3>
        </div>
        {skill.is_verified && (
          <CheckCircle className="h-5 w-5 text-green-400" />
        )}
      </div>

      {skill.description && (
        <p className="text-sm text-slate-400 mb-4 line-clamp-2">
          {skill.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {skill.tags?.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 bg-blue-900/30 rounded text-xs text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-slate-500">
          <TrendingUp className="h-4 w-4" />
          {skill.usage_count} uses
        </span>
        <button className="px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-lg text-sm hover:bg-amber-500/20 transition-colors">
          {t("explore.addToPlaybook")}
        </button>
      </div>
    </motion.div>
  );
}

function MCPCard({ mcp, index }: { mcp: PublicMCPServer; index: number }) {
  const t = useTranslations();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-pink-500/10 rounded-lg">
            <Server className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="font-semibold">{mcp.name}</h3>
        </div>
        {mcp.is_verified && (
          <CheckCircle className="h-5 w-5 text-green-400" />
        )}
      </div>

      {mcp.description && (
        <p className="text-sm text-neutral-400 mb-4 line-clamp-2">
          {mcp.description}
        </p>
      )}

      <div className="flex gap-4 mb-4 text-sm text-neutral-500">
        <span>{Array.isArray(mcp.tools) ? mcp.tools.length : 0} tools</span>
        <span>{Array.isArray(mcp.resources) ? mcp.resources.length : 0} resources</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {mcp.tags?.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-neutral-400"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-neutral-500">
          <TrendingUp className="h-4 w-4" />
          {mcp.usage_count} uses
        </span>
        <button className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-sm hover:bg-indigo-500/20 transition-colors">
          {t("explore.addToPlaybook")}
        </button>
      </div>
    </motion.div>
  );
}

