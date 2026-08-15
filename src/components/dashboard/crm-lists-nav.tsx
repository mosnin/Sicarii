"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CrmListItem = {
  id: string;
  name: string;
  kind: string;
  source: string | null;
  members: number;
};

export function CrmListsNav({
  lists,
  industries,
  tags,
  active,
}: {
  lists: CrmListItem[];
  industries: string[];
  tags: string[];
  active: { list?: string; industry?: string; tag?: string; status?: string };
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const href = (next: { list?: string; industry?: string; tag?: string; status?: string }) => {
    const p = new URLSearchParams();
    p.set("tab", "contacts");
    if (next.list) p.set("list", next.list);
    if (next.industry) p.set("industry", next.industry);
    if (next.tag) p.set("tag", next.tag);
    if (next.status) p.set("status", next.status);
    return `/crm?${p.toString()}`;
  };

  async function createList() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: "list" }),
      });
      if (res.ok) {
        const d = await res.json();
        setName("");
        setCreating(false);
        router.push(`/crm?tab=contacts&list=${d.segment.id}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const allActive = !active.list && !active.industry && !active.tag && !active.status;

  return (
    <aside className="space-y-5 lg:w-56 lg:shrink-0">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Lists</p>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          <SideLink href="/crm?tab=contacts" active={allActive}>
            All contacts
          </SideLink>
          {lists.map((l) => (
            <SideLink key={l.id} href={href({ list: l.id })} active={active.list === l.id}>
              <span className="truncate">{l.name}</span>
              <span className="text-muted-foreground">{l.members}</span>
            </SideLink>
          ))}
        </nav>
        {creating ? (
          <div className="mt-2 flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name"
              className="h-8"
              onKeyDown={(e) => e.key === "Enter" && createList()}
            />
            <Button size="sm" onClick={createList} disabled={busy || !name.trim()}>
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            New list
          </button>
        )}
      </div>

      {industries.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Industry</p>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {industries.map((ind) => (
              <SideLink key={ind} href={href({ industry: ind })} active={active.industry === ind}>
                <span className="truncate">{ind}</span>
              </SideLink>
            ))}
          </nav>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Tags</p>
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {tags.slice(0, 16).map((tag) => (
              <SideLink key={tag} href={href({ tag })} active={active.tag === tag}>
                <span className="truncate">{tag}</span>
              </SideLink>
            ))}
          </nav>
        </div>
      )}
    </aside>
  );
}

function SideLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 rounded-full px-3 py-1.5 text-sm transition-colors lg:w-full",
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
