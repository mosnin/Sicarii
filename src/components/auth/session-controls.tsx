"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

export type SessionControlsProps = {
  activeAccountId: string;
  personalAccountId: string;
  label: string;
  workspaces: Array<{ workspaceId: string; name: string; role: string }>;
  compact?: boolean;
};

export function SessionControls({
  activeAccountId,
  personalAccountId,
  label,
  workspaces,
  compact = false,
}: SessionControlsProps) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchWorkspace(accountId: string) {
    setBusy(true);
    const response = await fetch("/api/auth/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {workspaces.length > 0 && !compact && (
        <select
          aria-label="Active workspace"
          value={activeAccountId}
          disabled={busy}
          onChange={(event) => switchWorkspace(event.target.value)}
          className="h-9 max-w-40 rounded-full border border-border bg-background px-3 text-xs text-foreground"
        >
          <option value={personalAccountId}>Personal</option>
          {workspaces.map((workspace) => (
            <option key={workspace.workspaceId} value={workspace.workspaceId}>
              {workspace.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        title={`Sign out ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted"
      >
        {label.slice(0, 1).toUpperCase() || "S"}
      </button>
    </div>
  );
}
