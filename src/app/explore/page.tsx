"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Search,
  BookOpen,
  Globe,
  Star,
  Brain,
  Zap,
  Server,
  Wrench,
  FolderOpen,
  Filter,
  Clock,
  User,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import type { Skill, MCPServer } from "@/lib/supabase/types";

// Extended types from API that include publisher info
interface Publisher {
  id: string;
  name: string;
  avatar_svg?: string;
  website_url?: string;
  is_verified?: boolean;
  is_virtual?: boolean;
}

interface PublicPlaybook {
  id: string;
  guid: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  star_count: number;
  tags?: string[];
  created_at: string;
  updated_at?: string;
  user_id: string;
  personas_count: number;
  skills_count: number;
  mcp_servers_count: number;
  publisher?: Publisher;
}

type TabType = "playbooks" | "skills" | "mcp";
type SortType = "stars" | "recent" | "name";

import { FileText, Link as LinkIcon, AlertCircle } from "lucide-react"; // Import missing icons

export default function ExplorePage() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<TabType>("playbooks");

  // Playbooks state
  const [playbooks, setPlaybooks] = useState<PublicPlaybook[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortType>("stars");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  // Skills & MCP state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [mcpSearch, setMcpSearch] = useState("");

  const loadUserStars = useCallback(async (uid: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("playbook_stars")
      .select("playbook_id")
      .eq("user_id", uid);

    if (data) {
      setStarredIds(new Set(data.map(s => s.playbook_id)));
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      loadUserStars(user.id);
    }
  }, [loadUserStars]);

  const loadPlaybooks = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (selectedTags.length) params.set("tags", selectedTags.join(","));
      params.set("sort", sortBy);

      const res = await fetch(`/api/public/playbooks?${params}`);
      const data = await res.json();

      setPlaybooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load playbooks:", error);
      setPlaybooks([]);
    }

    setLoading(false);
  }, [searchQuery, selectedTags, sortBy]);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await fetch("/api/public/skills");
      const data = await res.json();
      setSkills(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load skills:", e);
      setSkills([]);
    }
    setSkillsLoading(false);
  }, []);

  const loadMCPServers = useCallback(async () => {
    setMcpLoading(true);
    try {
      const res = await fetch("/api/public/mcp");
      const data = await res.json();
      setMcpServers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load MCP servers:", e);
      setMcpServers([]);
    }
    setMcpLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (activeTab === "playbooks") {
      loadPlaybooks();
    } else if (activeTab === "skills" && skills.length === 0) {
      loadSkills();
    } else if (activeTab === "mcp" && mcpServers.length === 0) {
      loadMCPServers();
    }
  }, [activeTab, loadPlaybooks, loadSkills, loadMCPServers, skills.length, mcpServers.length]);

  const toggleStar = async (playbookId: string) => {
    if (!userId) {
      window.location.href = "/login?redirect=/explore";
      return;
    }

    const supabase = createBrowserClient();
    const isStarred = starredIds.has(playbookId);

    if (isStarred) {
      await supabase
        .from("playbook_stars")
        .delete()
        .eq("playbook_id", playbookId)
        .eq("user_id", userId);

      setStarredIds(prev => {
        const next = new Set(prev);
        next.delete(playbookId);
        return next;
      });

      setPlaybooks(prev => prev.map(p =>
        p.id === playbookId ? { ...p, star_count: Math.max(0, p.star_count - 1) } : p
      ));
    } else {
      await supabase
        .from("playbook_stars")
        .insert({ playbook_id: playbookId, user_id: userId });

      setStarredIds(prev => new Set(prev).add(playbookId));

      setPlaybooks(prev => prev.map(p =>
        p.id === playbookId ? { ...p, star_count: p.star_count + 1 } : p
      ));
    }
  };

  // Extract unique tags from all playbooks
  const allTags = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    playbooks.forEach(p => {
      (p.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag)
      .slice(0, 15);
  }, [playbooks]);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Filtered skills and MCP servers
  const filteredSkills = skills.filter(s =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
    (s.description || "").toLowerCase().includes(skillSearch.toLowerCase())
  );

  const filteredMCPs = mcpServers.filter(m =>
    m.name.toLowerCase().includes(mcpSearch.toLowerCase()) ||
    (m.description || "").toLowerCase().includes(mcpSearch.toLowerCase())
  );

  const tabs = [
    { id: "playbooks" as TabType, label: t("explore.tabPlaybooks"), icon: BookOpen, count: playbooks.length },
    { id: "skills" as TabType, label: t("explore.tabSkills"), icon: Zap, count: skills.length },
    { id: "mcp" as TabType, label: t("explore.tabMCP"), icon: Server, count: mcpServers.length },
  ];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      <FloatingNav />

      {/* Hero */}
      <section className="pt-32 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold mb-4 gradient-text"
          >
            {t("explore.title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-slate-400"
          >
            {t("explore.subtitle")}
          </motion.p>
        </div>
      </section>

      {/* Tabs */}
      <section className="px-4 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex gap-2 border-b border-blue-900/30">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-all",
                  activeTab === tab.id
                    ? "border-amber-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white hover:border-slate-700"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-xs",
                    activeTab === tab.id ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-500"
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {/* Playbooks Tab */}
        {activeTab === "playbooks" && (
          <motion.div
            key="playbooks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {/* Search & Filters */}
            <section className="px-4 pb-8">
              <div className="max-w-5xl mx-auto">
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("explore.searchPlaybooks")}
                    className={cn(
                      "w-full pl-12 pr-4 py-4 rounded-xl text-lg",
                      "bg-blue-950/30 border border-blue-900/50",
                      "focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20",
                      "placeholder:text-slate-600"
                    )}
                  />
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-6">
                  <span className="flex items-center gap-1 text-sm text-slate-500 mr-2">
                    <Filter className="h-4 w-4" />
                    {t("explore.tags")}:
                  </span>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm transition-colors",
                        selectedTags.includes(tag)
                          ? "bg-amber-500 text-slate-900 font-medium"
                          : "bg-blue-950/50 text-slate-400 hover:bg-blue-900/50 border border-blue-800/30"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span>{playbooks.length} {t("explore.playbooks")}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">{t("explore.sortBy")}:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortType)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-sm cursor-pointer",
                        "bg-slate-800 border border-slate-600",
                        "text-white focus:outline-none focus:border-amber-500",
                        "[&>option]:bg-slate-800 [&>option]:text-white"
                      )}
                    >
                      <option value="stars">{t("explore.mostStarred")}</option>
                      <option value="recent">{t("explore.mostRecent")}</option>
                      <option value="name">{t("explore.alphabetical")}</option>
                    </select>
                  </div>
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
                ) : playbooks.length === 0 ? (
                  <EmptyState type="playbooks" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {playbooks.map((playbook, idx) => (
                      <PlaybookCard
                        key={playbook.id}
                        playbook={playbook}
                        index={idx}
                        isStarred={starredIds.has(playbook.id)}
                        onToggleStar={() => toggleStar(playbook.id)}
                        isLoggedIn={!!userId}
                        isOwner={playbook.user_id === userId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {/* Skills Tab */}
        {activeTab === "skills" && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <section className="px-4 pb-8">
              <div className="max-w-5xl mx-auto">
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="text"
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    placeholder={t("explore.searchSkills")}
                    className={cn(
                      "w-full pl-12 pr-4 py-4 rounded-xl text-lg",
                      "bg-blue-950/30 border border-blue-900/50",
                      "focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20",
                      "placeholder:text-slate-600"
                    )}
                  />
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  {filteredSkills.length} {t("explore.skillsAvailable")}
                </p>
              </div>
            </section>

            <section className="px-4 pb-24">
              <div className="max-w-6xl mx-auto">
                {skillsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <EmptyState type="skills" />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSkills.map((skill, idx) => (
                      <SkillCard key={skill.id} skill={skill} index={idx} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}

        {/* MCP Tab */}
        {activeTab === "mcp" && (
          <motion.div
            key="mcp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <section className="px-4 pb-8">
              <div className="max-w-5xl mx-auto">
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="text"
                    value={mcpSearch}
                    onChange={(e) => setMcpSearch(e.target.value)}
                    placeholder={t("explore.searchMCP")}
                    className={cn(
                      "w-full pl-12 pr-4 py-4 rounded-xl text-lg",
                      "bg-blue-950/30 border border-blue-900/50",
                      "focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20",
                      "placeholder:text-slate-600"
                    )}
                  />
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  {filteredMCPs.length} {t("explore.mcpAvailable")}
                </p>
              </div>
            </section>

            <section className="px-4 pb-24">
              <div className="max-w-6xl mx-auto">
                {mcpLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-2 border-pink-500 border-t-transparent rounded-full" />
                  </div>
                ) : filteredMCPs.length === 0 ? (
                  <EmptyState type="mcp" />
                ) : (
                  <div className="space-y-4">
                    {filteredMCPs.map((mcp, idx) => (
                      <MCPCard key={mcp.id} mcp={mcp} index={idx} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA */}
      <section className="px-4 pb-24">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={cn(
              "p-8 rounded-2xl text-center",
              "bg-gradient-to-br from-amber-900/20 to-orange-900/20",
              "border border-amber-500/30"
            )}
          >
            <Sparkles className="h-10 w-10 text-amber-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">{t("explore.createOwn")}</h3>
            <p className="text-slate-400 mb-6">{t("explore.createOwnDesc")}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/login"
                className={cn(
                  "px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2",
                  "bg-amber-500 text-slate-900 hover:bg-amber-400 transition-colors"
                )}
              >
                {t("common.getStarted")}
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ type }: { type: "playbooks" | "skills" | "mcp" }) {
  const t = useTranslations();

  const config = {
    playbooks: { icon: Globe, color: "text-blue-700", title: t("explore.noPlaybooks"), desc: t("explore.noPlaybooksDesc") },
    skills: { icon: Zap, color: "text-purple-700", title: t("explore.noSkills"), desc: t("explore.noSkillsDesc") },
    mcp: { icon: Server, color: "text-pink-700", title: t("explore.noMCP"), desc: t("explore.noMCPDesc") },
  };

  const { icon: Icon, color, title, desc } = config[type];

  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 bg-blue-900/30 rounded-full flex items-center justify-center">
        <Icon className={cn("h-8 w-8", color)} />
      </div>
      <h3 className="text-xl font-semibold text-slate-400 mb-2">{title}</h3>
      <p className="text-slate-500 mb-6">{desc}</p>
      <Link
        href="/login"
        className={cn(
          "inline-flex items-center gap-2 px-6 py-3 rounded-lg",
          "bg-amber-500 text-slate-900 font-medium",
          "hover:bg-amber-400 transition-colors"
        )}
      >
        <Sparkles className="h-5 w-5" />
        {t("common.getStarted")}
      </Link>
    </div>
  );
}

interface PlaybookCardProps {
  playbook: PublicPlaybook;
  index: number;
  isStarred: boolean;
  onToggleStar: () => void;
  isLoggedIn: boolean;
  isOwner: boolean;
}

function PlaybookCard({ playbook, index, isStarred, onToggleStar, isLoggedIn, isOwner }: PlaybookCardProps) {
  const t = useTranslations();
  const playbookUrl = `/dashboard/playbook/${playbook.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "rounded-xl overflow-hidden group cursor-pointer",
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border border-blue-900/30 hover:border-amber-500/30",
        "transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5"
      )}
    >
      <Link href={playbookUrl} className="block">
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg truncate group-hover:text-amber-400 transition-colors">
                  {playbook.name}
                </h3>
                {isOwner && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium shrink-0">
                    {t("explore.yours")}
                  </span>
                )}
              </div>
              {/* Publisher profile */}
              {playbook.publisher && (
                <div className="flex items-center gap-2">
                  {playbook.publisher.avatar_svg ? (
                    <div
                      className="w-5 h-5 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: playbook.publisher.avatar_svg }}
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center">
                      <User className="h-3 w-3 text-slate-400" />
                    </div>
                  )}
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    {playbook.publisher.name}
                    {playbook.publisher.is_verified && (
                      <span className="text-blue-400" title="Verified">✓</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleStar();
              }}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all",
                isStarred
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-slate-800/50 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
              )}
              title={isLoggedIn ? (isStarred ? "Unstar" : "Star") : "Sign in to star"}
            >
              <Star className={cn("h-4 w-4", isStarred && "fill-current")} />
              <span className="text-sm font-medium">{playbook.star_count}</span>
            </button>
          </div>

          {playbook.description && (
            <p className="text-sm text-slate-400 mb-4 line-clamp-2">{playbook.description}</p>
          )}

          <div className="flex flex-wrap gap-3 mb-4">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Brain className="h-3.5 w-3.5 text-blue-400" />
              {playbook.personas_count} {t("explore.personas")}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              {playbook.skills_count} {t("explore.skills")}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Server className="h-3.5 w-3.5 text-pink-400" />
              {playbook.mcp_servers_count} MCP
            </span>
          </div>

          {playbook.tags && playbook.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {playbook.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-blue-900/30 rounded text-xs text-slate-400">
                  {tag}
                </span>
              ))}
              {playbook.tags.length > 4 && (
                <span className="px-2 py-0.5 text-xs text-slate-500">+{playbook.tags.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="px-5 py-3 border-t border-slate-700/30 bg-slate-900/30">
        <div className="flex items-center justify-between">
          <Link
            href={playbookUrl}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
              "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
              "transition-colors"
            )}
          >
            <ExternalLink className="h-4 w-4" />
            {t("explore.view")}
          </Link>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(playbook.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Extended skill type from API
interface SkillWithPublisher extends Skill {
  playbook_name?: string;
  playbook_guid?: string;
  publisher?: {
    id: string;
    name: string;
    avatar_svg?: string;
    is_verified?: boolean;
    is_virtual?: boolean;
  };
  skill_attachments?: SkillAttachment[];
}

interface SkillAttachment {
  type: 'file' | 'link';
  url?: string;
  filename?: string;
}

function SkillCard({ skill, index }: { skill: SkillWithPublisher; index: number }) {
  const [copied, setCopied] = useState(false);
  const isMarkdownSkill = !!(skill.content && skill.content.length > 0);

  const copyToClipboard = async () => {
    // Copy skill content (markdown) or definition (JSON)
    const content = skill.content || JSON.stringify(skill.definition || {}, null, 2);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "p-4 rounded-xl",
        isMarkdownSkill
          ? "bg-gradient-to-br from-emerald-900/20 to-slate-900/80 border-emerald-500/20 hover:border-emerald-500/40"
          : "bg-gradient-to-br from-purple-900/20 to-slate-900/80 border-purple-500/20 hover:border-purple-500/40",
        "border transition-all"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={cn("h-4 w-4", isMarkdownSkill ? "text-emerald-400" : "text-purple-400")} />
          <h4 className="font-medium text-white">{skill.name}</h4>
          {isMarkdownSkill && (
            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded font-medium">
              SKILL
            </span>
          )}
        </div>
        <button
          onClick={copyToClipboard}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isMarkdownSkill
              ? "text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
              : "text-slate-400 hover:text-purple-400 hover:bg-purple-500/10"
          )}
          title="Copy skill content"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {skill.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">{skill.description}</p>
      )}

      {/* Show token count for markdown skills, or JSON preview for schema skills */}
      {isMarkdownSkill ? (
        <div className="text-xs text-slate-500 mb-2">
          ~{Math.round((skill.content?.length || 0) / 4).toLocaleString()} tokens
        </div>
      ) : skill.definition && Object.keys(skill.definition).length > 0 && (
        <div className="bg-slate-900/50 rounded-lg p-2 max-h-24 overflow-hidden mb-2">
          <pre className="text-xs text-slate-500 font-mono line-clamp-3">{JSON.stringify(skill.definition, null, 2)}</pre>
        </div>
      )}

      {/* Attachments */}
      {skill.skill_attachments && skill.skill_attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {skill.skill_attachments.map((att: SkillAttachment, i: number) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-300 max-w-full"
            >
              {att.type === 'file' ? <FileText className="h-3 w-3" /> : <LinkIcon className="h-3 w-3" />}
              <span className="truncate max-w-[150px]">{att.url || att.filename}</span>
            </div>
          ))}
        </div>
      )}

      {/* Publisher info */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
        {skill.publisher ? (
          <div className="flex items-center gap-2">
            {skill.publisher.avatar_svg ? (
              <div
                className="w-5 h-5 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: skill.publisher.avatar_svg }}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center">
                <User className="h-3 w-3 text-slate-400" />
              </div>
            )}
            <span className="text-xs text-slate-400 flex items-center gap-1">
              {skill.publisher.name}
              {skill.publisher.is_verified && (
                <span className="text-blue-400" title="Verified">✓</span>
              )}
            </span>
          </div>
        ) : skill.playbook_name && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {skill.playbook_name}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// Extended MCP type from API
interface MCPWithPublisher extends MCPServer {
  playbook_name?: string;
  playbook_guid?: string;
  publisher?: {
    id: string;
    name: string;
    avatar_svg?: string;
    is_verified?: boolean;
    is_virtual?: boolean;
  };
}

function MCPCard({ mcp, index }: { mcp: MCPWithPublisher; index: number }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tools = Array.isArray(mcp.tools) ? mcp.tools : [];
  const resources = Array.isArray(mcp.resources) ? mcp.resources : [];
  const toolCount = tools.length;
  const resourceCount = resources.length;
  const hasDetails = toolCount > 0 || resourceCount > 0;

  const copyConfig = async () => {
    const config = JSON.stringify(mcp.transport_config || {}, null, 2);
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "rounded-xl overflow-hidden",
        "bg-gradient-to-br from-pink-900/20 to-slate-900/80",
        "border border-pink-500/20 hover:border-pink-500/40",
        "transition-all"
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 p-4",
          hasDetails ? "cursor-pointer" : "cursor-default"
        )}
        onClick={() => {
          if (!hasDetails) return;
          setExpanded((prev) => !prev);
        }}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20">
            <Server className="h-4 w-4 text-pink-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-white truncate">{mcp.name}</h4>
            </div>
            {mcp.description && (
              <p className="text-sm text-slate-400 line-clamp-2">{mcp.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Wrench className="h-3 w-3 text-pink-400" />
                {toolCount} tools
              </span>
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-purple-400" />
                {resourceCount} resources
              </span>
              {mcp.transport_type && (
                <span className="px-2 py-0.5 rounded bg-slate-700/30 text-slate-500">
                  {mcp.transport_type}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyConfig();
            }}
            className="p-1.5 text-slate-400 hover:text-pink-400 hover:bg-pink-500/10 rounded-lg transition-colors"
            title="Copy MCP config"
          >
            {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
          </button>
          {hasDetails && (
            <div className="text-slate-500">
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          )}
        </div>
      </div>

      {/* Expanded tools/resources */}
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-slate-800/60"
          >
            <div className="px-4 pb-4 pt-3 space-y-4">
              {toolCount > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Tools</div>
                  <div className="space-y-2">
                    {tools.map((tool, toolIndex) => (
                      <div
                        key={`${tool.name}-${toolIndex}`}
                        className="rounded-lg border border-pink-500/10 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="text-sm font-mono text-pink-300">{tool.name}</div>
                        {tool.description && (
                          <div className="text-xs text-slate-400 mt-1">{tool.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {resourceCount > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Resources</div>
                  <div className="space-y-2">
                    {resources.map((resource, resourceIndex) => (
                      <div
                        key={`${resource.name}-${resourceIndex}`}
                        className="rounded-lg border border-purple-500/10 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="text-sm text-purple-200">{resource.name}</div>
                        <div className="text-xs text-slate-500 mt-1 break-all">{resource.uri}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Publisher info */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/30">
        {mcp.publisher ? (
          <div className="flex items-center gap-2">
            {mcp.publisher.avatar_svg ? (
              <div
                className="w-5 h-5 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: mcp.publisher.avatar_svg }}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center">
                <User className="h-3 w-3 text-slate-400" />
              </div>
            )}
            <span className="text-xs text-slate-400 flex items-center gap-1">
              {mcp.publisher.name}
              {mcp.publisher.is_verified && (
                <span className="text-blue-400" title="Verified">✓</span>
              )}
            </span>
          </div>
        ) : mcp.playbook_name && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {mcp.playbook_name}
          </span>
        )}
      </div>
    </motion.div>
  );
}
