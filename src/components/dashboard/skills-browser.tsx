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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.05, 0.3) }}
      className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex-1">
        <p className="font-brand text-base text-foreground">{skill.name}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{skill.description}</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          .md
        </Button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide" : "Preview"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">
          {skill.content}
        </pre>
      )}
    </motion.div>
  );
}

export function SkillsBrowser({ skills }: { skills: Skill[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {skills.map((s, i) => (
        <SkillCard key={s.slug} skill={s} index={i} />
      ))}
    </div>
  );
}
