"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Search,
  Server,
  Plus,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Globe,
  Package,
  CheckCircle2,
  X
} from "lucide-react";

interface RegistryServer {
  registry_id: string;
  name: string;
  description: string;
  version: string;
  repository_url?: string;
  website_url?: string;
  icon_url?: string;
  transport_type: string | null;
  transport_config: Record<string, unknown>;
  is_latest: boolean;
  published_at: string;
  updated_at: string;
  source: string;
  publisher: {
    id: string;
    display_name: string;
    is_verified: boolean;
    is_virtual: boolean;
    website_url?: string;
  };
}

interface McpRegistrySearchProps {
  playbookId: string;
  onAdd: (server: RegistryServer) => Promise<void>;
  onClose: () => void;
}

export function McpRegistrySearch({ playbookId, onAdd, onClose }: McpRegistrySearchProps) {
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<RegistryServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Search the registry
  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        q,
        latest: "true",
        limit: "50"
      });
      
      const response = await fetch(`/api/mcp-registry/search?${params}`);
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setServers([]);
      } else {
        setServers(data.servers || []);
      }
    } catch (e) {
      console.error("Registry search error:", e);
      setError("Failed to search registry");
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load - fetch popular servers
  useEffect(() => {
    search("");
  }, [search]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [query, search]);

  // Add server to playbook
  const handleAdd = async (server: RegistryServer) => {
    setAdding(server.registry_id);
    
    try {
      await onAdd(server);
      setAddedIds(prev => new Set([...prev, server.registry_id]));
    } catch (e) {
      console.error("Add server error:", e);
    } finally {
      setAdding(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-3xl max-h-[85vh] bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
                <Globe className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Anthropic MCP Registry</h2>
                <p className="text-sm text-slate-400">Browse official MCP servers</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search MCP servers..."
              className={cn(
                "w-full pl-10 pr-4 py-3 rounded-xl",
                "bg-slate-800/70 border border-slate-700/50",
                "text-slate-200 placeholder:text-slate-500",
                "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              )}
              autoFocus
            />
          </div>
        </div>
        
        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-400">
              <p>{error}</p>
              <button
                onClick={() => search(query)}
                className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No servers found{query ? ` for "${query}"` : ""}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {servers.map((server) => (
                <motion.div
                  key={server.registry_id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn(
                    "p-4 rounded-xl border transition-all duration-200",
                    "bg-slate-800/50 border-slate-700/50",
                    "hover:bg-slate-800/70 hover:border-slate-600/50"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      "bg-gradient-to-br from-pink-600/20 to-orange-600/20",
                      "border border-pink-500/20"
                    )}>
                      {server.icon_url ? (
                        <img 
                          src={server.icon_url} 
                          alt={server.name}
                          className="h-6 w-6 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Server className="h-6 w-6 text-pink-400" />
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-white truncate">
                          {server.name}
                        </h3>
                        <span className="px-2 py-0.5 text-xs bg-slate-700/50 text-slate-400 rounded-full">
                          v{server.version}
                        </span>
                        {server.publisher.is_verified && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                            <ShieldCheck className="h-3 w-3" />
                            Official
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                        {server.description}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        {server.transport_type && (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {server.transport_type.toUpperCase()}
                          </span>
                        )}
                        {server.repository_url && (
                          <a
                            href={server.repository_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-slate-300 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                            GitHub
                          </a>
                        )}
                      </div>
                    </div>
                    
                    {/* Add Button */}
                    <button
                      onClick={() => handleAdd(server)}
                      disabled={adding === server.registry_id || addedIds.has(server.registry_id)}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shrink-0",
                        addedIds.has(server.registry_id)
                          ? "bg-green-500/20 text-green-400 cursor-default"
                          : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                      )}
                    >
                      {adding === server.registry_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : addedIds.has(server.registry_id) ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          Add
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>
                Powered by{" "}
                <a
                  href="https://registry.modelcontextprotocol.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline"
                >
                  Official MCP Registry
                </a>
              </span>
            </div>
            <span className="text-sm text-slate-500">
              {servers.length} servers
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default McpRegistrySearch;

