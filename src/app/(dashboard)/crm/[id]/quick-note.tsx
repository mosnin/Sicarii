"use client";

/**
 * QuickNote - a MorphSurface (see DESIGN.md, Motion Surfaces) that lives on
 * the contact page. Collapsed it is a one-line dock; tapped, it morphs into a
 * note field that logs straight to the contact's activity trail. No dialog,
 * no page, no context switch: capture the thought and get back to work.
 */

import { useRouter } from "next/navigation";
import { MorphSurface } from "@/components/ui/morph-surface";

export function QuickNote({ contactId }: { contactId: string }) {
  const router = useRouter();

  async function submit(data: FormData) {
    const body = String(data.get("message") ?? "").trim();
    if (!body) return;
    const res = await fetch(`/api/contacts/${contactId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, kind: "note" }),
    });
    if (!res.ok) throw new Error("Failed to save note");
    // Refresh the server-rendered activity trail behind the surface.
    router.refresh();
  }

  return (
    <MorphSurface
      surfaceTitle="Quick note"
      triggerLabel="Add note"
      placeholder="Log a note about this contact..."
      collapsedWidth={230}
      expandedWidth={360}
      expandedHeight={190}
      onSubmit={submit}
      className="!items-start !justify-start"
    />
  );
}
