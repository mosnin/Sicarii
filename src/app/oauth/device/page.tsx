import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { getOptionalAuthContext } from "@/lib/auth-utils";
import { getDeviceApproval, SCOPE_DESCRIPTIONS, signDeviceTicket } from "@/lib/oauth-server";
import { listUserWorkspaces } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <LogoMark className="h-8 w-8" />
        <span className="font-brand text-xl font-bold text-foreground">Scalar</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}

export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = (await searchParams).code ?? "";
  const approval = await getDeviceApproval(code);
  if (!approval) {
    return (
      <Shell>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Scalar for Mac</p>
        <h1 className="font-brand mt-3 text-2xl text-foreground">This connection code is not active</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Return to the Mac app and start sign-in again. Connection codes expire after ten minutes and work once.
        </p>
      </Shell>
    );
  }

  const auth = await getOptionalAuthContext();
  if (!auth) redirect(`/sign-in?redirectTo=${encodeURIComponent(`/oauth/device?code=${code}`)}`);
  const { actor } = auth;
  const workspaces = await listUserWorkspaces(actor.id);
  const accounts = [
    {
      id: actor.id,
      label: [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email || "Personal",
      kind: "Personal account",
    },
    ...workspaces.map((workspace) => ({
      id: workspace.workspaceId,
      label: workspace.name,
      kind: `Workspace, you are ${workspace.role}`,
    })),
  ];
  const ticket = signDeviceTicket(approval.id, actor.id);

  return (
    <Shell>
      <p className="text-xs uppercase tracking-[0.3em] text-primary">Scalar for Mac</p>
      <h1 className="font-brand mt-3 text-2xl leading-snug text-foreground">Connect this Mac to Scalar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {actor.email || actor.firstName || "your Scalar account"}. Confirm code{" "}
        <span className="font-mono text-foreground">{code}</span> matches the app.
      </p>
      <form action="/oauth/device/decide" method="post" className="mt-6 space-y-6">
        <input type="hidden" name="ticket" value={ticket} />
        <div>
          <p className="text-sm font-medium text-foreground">Scalar for Mac will be able to</p>
          <ul className="mt-3 space-y-3">
            {approval.scopes.map((scope) => (
              <li key={scope} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 h-px w-4 shrink-0 bg-primary/60" />
                <span>{SCOPE_DESCRIPTIONS[scope] ?? scope}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Account</p>
          <div className="mt-3 space-y-2">
            {accounts.map((account, index) => (
              <label key={account.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-accent">
                <input type="radio" name="accountId" value={account.id} defaultChecked={index === 0} className="mt-1 accent-primary" required />
                <span>
                  <span className="block text-foreground">{account.label}</span>
                  <span className="block text-xs text-muted-foreground">{account.kind}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The app receives a revocable, scoped token. It never receives your password or browser session.
        </p>
        <div className="flex gap-3">
          <Button type="submit" name="decision" value="approve" className="flex-1">Connect Mac</Button>
          <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">Deny</Button>
        </div>
      </form>
    </Shell>
  );
}
