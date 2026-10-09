"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Copy, Check, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Skill } from "@/lib/skills";

function SkillCard({ skill, index }: { skill: Skill; index: number }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(skill.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  }

  function download() {
    const blob = new Blob([skill.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${skill.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.2) }}
      className="flex flex-col rounded-[8px] border border-border bg-card p-3"
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{skill.name}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{skill.description}</p>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-success" strokeWidth={1.6} /> : <Copy className="h-4 w-4" strokeWidth={1.6} />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="h-4 w-4" strokeWidth={1.6} />
          .md
        </Button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-[4px] px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {open ? "Hide" : "Preview"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} strokeWidth={1.6} />
        </button>
      </div>

      {open && (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[4px] border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {skill.content}
        </pre>
      )}
    </motion.div>
  );
}

export function SkillsBrowser({ skills }: { skills: Skill[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {skills.map((s, i) => (
        <SkillCard key={s.slug} skill={s} index={i} />
      ))}
    </div>
  );
}
