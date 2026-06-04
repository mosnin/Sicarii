"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, FolderKanban, MessageSquare, FileText, Loader2, AlertCircle } from "lucide-react";

interface SearchResult {
  id: string;
  type: "project" | "message" | "file";
  title: string;
  subtitle: string;
  href: string;
}

const typeIcons = {
  project: FolderKanban,
  message: MessageSquare,
  file: FileText,
};

const typeLabels: Record<SearchResult["type"], string> = {
  project: "Projects",
  message: "Messages",
  file: "Files",
};

function groupByType(results: SearchResult[]) {
  const groups: Partial<Record<SearchResult["type"], SearchResult[]>> = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type]!.push(r);
  }
  return groups;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const fetchResults = useCallback(async (searchQuery: string) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (searchQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery.trim())}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Search failed (${res.status})`);
      }

      const data: SearchResult[] = await res.json();
      setResults(data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Request was cancelled, ignore
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResults([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      fetchResults(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchResults]);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setResults([]);
      setError(null);
      setLoading(false);
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const grouped = groupByType(results);
  const hasResults = results.length > 0;
  const showNoResults = query.trim().length >= 2 && !loading && !error && !hasResults;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div ref={containerRef} className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in">
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4">
              {loading ? (
                <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
              ) : (
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <input
                ref={inputRef}
                type="text"
                placeholder="Search projects, messages, files..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery("")} className="cursor-pointer">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto">
              {/* Error state */}
              {error && (
                <div className="p-6 flex flex-col items-center gap-2 text-center text-sm text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <p>{error}</p>
                </div>
              )}

              {/* No results */}
              {showNoResults && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              )}

              {/* Grouped results */}
              {hasResults && !error && (
                <>
                  {(["project", "message", "file"] as const).map((type) => {
                    const items = grouped[type];
                    if (!items || items.length === 0) return null;
                    return (
                      <div key={type}>
                        <div className="px-4 pt-3 pb-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {typeLabels[type]}
                          </p>
                        </div>
                        {items.map((result) => {
                          const Icon = typeIcons[result.type];
                          return (
                            <button
                              key={result.id}
                              onClick={() => {
                                setOpen(false);
                                router.push(result.href);
                              }}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors cursor-pointer"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange/10">
                                <Icon className="h-4 w-4 text-orange" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{result.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                              </div>
                              <span className="text-[10px] uppercase text-muted-foreground shrink-0">
                                {result.type}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Empty state */}
              {!query.trim() && !error && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Type to search across projects, messages, and files
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd> Navigate
              </span>
              <span>
                <kbd className="rounded border border-border px-1 font-mono">Esc</kbd> Close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
