"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowUpRight, BookOpen, LoaderCircle, Search, Server, Star } from "lucide-react";
import styles from "./catalog.module.css";

interface PublicPlaybook {
  id: string;
  guid: string;
  name: string;
  description?: string | null;
  tags?: string[];
  star_count?: number;
  skills_count: number;
  mcp_servers_count: number;
  publisher?: { name?: string | null } | null;
}

const PAGE_SIZE = 12;

export function PublicPlaybookCatalog() {
  const t = useTranslations("explore.catalog");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("stars");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    query: string;
    sort: string;
    limit: number;
    playbooks: PublicPlaybook[];
    error: boolean;
  } | null>(null);
  const query = search.trim();
  const requestKey = JSON.stringify([query, sort, limit, retry]);
  const loading = result?.key !== requestKey;
  const matchesSearch = result?.query === query && result.sort === sort;
  const playbooks = matchesSearch ? result.playbooks.slice(0, result.limit) : [];
  const hasMore = matchesSearch && result.playbooks.length > result.limit;

  useEffect(() => {
    const controller = new AbortController();
    // Search the public API, including results beyond the initial page. Abort
    // superseded requests so a slow response cannot replace a newer search.
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ sort, limit: String(limit + 1) });
        if (query) params.set("search", query);
        const response = await fetch(`/api/public/playbooks?${params}`, {
          signal: controller.signal,
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Public catalog unavailable");
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid public catalog");
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, query, sort, limit, playbooks: data, error: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, query, sort, limit, playbooks: [], error: true });
        }
      }
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, sort, limit, requestKey]);

  return (
    <div className={styles.catalog}>
      <div className={styles.controls}>
        <div className={styles.search}>
          <label htmlFor="public-playbook-search">{t("searchLabel")}</label>
          <div>
            <Search size={19} aria-hidden="true" />
            <input
              id="public-playbook-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder={t("searchPlaceholder")}
              aria-controls="public-playbook-results"
            />
          </div>
        </div>
        <div className={styles.sort}>
          <label htmlFor="public-playbook-sort">{t("sortLabel")}</label>
          <select
            id="public-playbook-sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setLimit(PAGE_SIZE);
            }}
          >
            <option value="stars">{t("sortStars")}</option>
            <option value="newest">{t("sortNewest")}</option>
            <option value="name">{t("sortName")}</option>
          </select>
        </div>
      </div>

      <div id="public-playbook-results" aria-busy={loading}>
        <div role="status" className={styles.status}>
          {loading ? (
            <><LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />{t("loading")}</>
          ) : !result?.error && playbooks.length > 0 ? (
            t("results", { count: playbooks.length })
          ) : null}
        </div>
        {!loading && result?.error ? (
          <div className={styles.empty}>
            <p>{t("error")}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>{t("retry")}</button>
          </div>
        ) : !loading && playbooks.length === 0 ? (
          <div className={styles.empty}>
            <BookOpen size={30} aria-hidden="true" />
            <p>{query ? t("noMatches") : t("empty")}</p>
            {query && <button type="button" onClick={() => { setSearch(""); setLimit(PAGE_SIZE); }}>{t("clear")}</button>}
          </div>
        ) : playbooks.length > 0 ? (
          <>
            <div className={styles.grid}>
              {playbooks.map((playbook) => (
                <article key={playbook.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <BookOpen size={22} aria-hidden="true" />
                    <span><Star size={14} aria-hidden="true" />{playbook.star_count ?? 0}<span className={styles.srOnly}> {t("stars")}</span></span>
                  </div>
                  <h3>
                    <Link href={`/dashboard/playbook/${playbook.guid}`} prefetch={false}>
                      {playbook.name}<ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </h3>
                  {playbook.publisher?.name && <p className={styles.publisher}>{playbook.publisher.name}</p>}
                  <p className={styles.description}>{playbook.description || t("noDescription")}</p>
                  <div className={styles.tags}>
                    {(playbook.tags ?? []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className={styles.counts}>
                    <span><BookOpen size={14} aria-hidden="true" />{t("skills", { count: playbook.skills_count })}</span>
                    <span><Server size={14} aria-hidden="true" />{t("tools", { count: playbook.mcp_servers_count })}</span>
                  </div>
                </article>
              ))}
            </div>
            {hasMore && (
              <div className={styles.more}>
                <button type="button" disabled={loading} onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t("loadMore")}</button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
