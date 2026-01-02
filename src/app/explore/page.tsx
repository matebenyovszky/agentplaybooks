"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FloatingNav } from "@/components/ui/floating-navbar";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { 
  Search,
  BookOpen,
  Building2,
  Globe,
  Star,
  Download,
  Brain,
  Zap,
  Server,
  Database,
  Copy,
  Check,
  ChevronDown,
  Filter,
  TrendingUp,
  Clock,
  User,
  ExternalLink,
  FileJson,
  FileCode,
  FileText,
  Sparkles
} from "lucide-react";
import type { PublicPlaybook } from "@/lib/supabase/types";

type SortType = "stars" | "recent" | "name";

export default function ExplorePage() {
  const t = useTranslations();
  const [playbooks, setPlaybooks] = useState<PublicPlaybook[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortType>("stars");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());

  const navItems = [
    { name: t("common.explore"), link: "/explore", icon: <Globe className="h-4 w-4" /> },
    { name: t("common.enterprise"), link: "/enterprise", icon: <Building2 className="h-4 w-4" /> },
    { name: t("common.docs"), link: "/docs", icon: <BookOpen className="h-4 w-4" /> },
  ];

  useEffect(() => {
    checkAuth();
    loadPlaybooks();
  }, [searchQuery, selectedTags, sortBy]);

  const checkAuth = async () => {
    const supabase = createBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      loadUserStars(user.id);
    }
  };

  const loadUserStars = async (uid: string) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("playbook_stars")
      .select("playbook_id")
      .eq("user_id", uid);
    
    if (data) {
      setStarredIds(new Set(data.map(s => s.playbook_id)));
    }
  };

  const loadPlaybooks = async () => {
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
  };

  const toggleStar = async (playbookId: string) => {
    if (!userId) {
      // Redirect to login
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
      
      // Update local count
      setPlaybooks(prev => prev.map(p => 
        p.id === playbookId ? { ...p, star_count: Math.max(0, p.star_count - 1) } : p
      ));
    } else {
      await supabase
        .from("playbook_stars")
        .insert({ playbook_id: playbookId, user_id: userId });
      
      setStarredIds(prev => new Set(prev).add(playbookId));
      
      // Update local count
      setPlaybooks(prev => prev.map(p => 
        p.id === playbookId ? { ...p, star_count: p.star_count + 1 } : p
      ));
    }
  };

  const allTags = [
    "coding", "writing", "data", "automation", 
    "research", "creative", "business", "education",
    "productivity", "development"
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

      {/* Search & Filters */}
      <section className="px-4 pb-8">
        <div className="max-w-5xl mx-auto">
          {/* Search */}
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

          {/* Sort & Stats */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>{playbooks.length} {t("explore.playbooks")}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">{t("explore.sortBy")}:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm",
                  "bg-blue-950/50 border border-blue-800/50",
                  "text-slate-300 focus:outline-none focus:border-amber-500"
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
            <EmptyState />
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
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA for creating playbook */}
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
                href="/demo/playbook"
                className={cn(
                  "px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2",
                  "bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                )}
              >
                {t("landing.hero.tryDemo")}
              </Link>
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

function EmptyState() {
  const t = useTranslations();
  
  return (
    <div className="text-center py-16">
      <div className="w-16 h-16 mx-auto mb-4 bg-blue-900/30 rounded-full flex items-center justify-center">
        <Globe className="h-8 w-8 text-blue-700" />
      </div>
      <h3 className="text-xl font-semibold text-slate-400 mb-2">
        {t("explore.noPlaybooks")}
      </h3>
      <p className="text-slate-500 mb-6">
        {t("explore.noPlaybooksDesc")}
      </p>
      <Link
        href="/demo/playbook"
        className={cn(
          "inline-flex items-center gap-2 px-6 py-3 rounded-lg",
          "bg-amber-500 text-slate-900 font-medium",
          "hover:bg-amber-400 transition-colors"
        )}
      >
        <Sparkles className="h-5 w-5" />
        {t("explore.createFirst")}
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
}

function PlaybookCard({ playbook, index, isStarred, onToggleStar, isLoggedIn }: PlaybookCardProps) {
  const t = useTranslations();
  const [showFormats, setShowFormats] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const formats = [
    { 
      id: "json", 
      label: "JSON", 
      icon: FileJson, 
      url: `${baseUrl}/api/playbooks/${playbook.guid}`,
      color: "text-green-400"
    },
    { 
      id: "mcp", 
      label: "MCP", 
      icon: Server, 
      url: `${baseUrl}/api/playbooks/${playbook.guid}?format=mcp`,
      color: "text-blue-400"
    },
    { 
      id: "openapi", 
      label: "OpenAPI", 
      icon: FileCode, 
      url: `${baseUrl}/api/playbooks/${playbook.guid}?format=openapi`,
      color: "text-purple-400"
    },
    { 
      id: "markdown", 
      label: "Markdown", 
      icon: FileText, 
      url: `${baseUrl}/api/playbooks/${playbook.guid}?format=markdown`,
      color: "text-amber-400"
    },
  ];

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "rounded-xl overflow-hidden",
        "bg-gradient-to-br from-slate-900/80 to-slate-800/80",
        "border border-blue-900/30 hover:border-amber-500/30",
        "transition-all duration-300"
      )}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate mb-1">
              {playbook.name}
            </h3>
            {playbook.author_email && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <User className="h-3 w-3" />
                {playbook.author_email.split("@")[0]}
              </p>
            )}
          </div>
          
          {/* Star button */}
          <button
            onClick={onToggleStar}
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

        {/* Description */}
        {playbook.description && (
          <p className="text-sm text-slate-400 mb-4 line-clamp-2">
            {playbook.description}
          </p>
        )}

        {/* Stats */}
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

        {/* Tags */}
        {playbook.tags && playbook.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {playbook.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-blue-900/30 rounded text-xs text-slate-400"
              >
                {tag}
              </span>
            ))}
            {playbook.tags.length > 4 && (
              <span className="px-2 py-0.5 text-xs text-slate-500">
                +{playbook.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-slate-700/30 bg-slate-900/30">
        <div className="flex items-center justify-between">
          <div className="relative">
            <button
              onClick={() => setShowFormats(!showFormats)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
                "transition-colors"
              )}
            >
              <Download className="h-4 w-4" />
              {t("explore.download")}
              <ChevronDown className={cn(
                "h-4 w-4 transition-transform",
                showFormats && "rotate-180"
              )} />
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {showFormats && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2 w-64",
                    "bg-slate-800 border border-slate-700 rounded-lg shadow-xl",
                    "overflow-hidden z-10"
                  )}
                >
                  {formats.map((format) => (
                    <div
                      key={format.id}
                      className="flex items-center justify-between p-3 hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <format.icon className={cn("h-4 w-4", format.color)} />
                        <span className="text-sm text-slate-300">{format.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyUrl(format.url, format.id)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-colors"
                          title="Copy URL"
                        >
                          {copied === format.id ? (
                            <Check className="h-4 w-4 text-green-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        <a
                          href={format.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600 rounded transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(playbook.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
