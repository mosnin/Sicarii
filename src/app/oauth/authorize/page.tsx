import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/auth-utils";
import { listUserWorkspaces } from "@/lib/workspace";
import {
  DEFAULT_SCOPES,
  SCOPE_DESCRIPTIONS,
  matchRedirectUri,
  narrowScopes,
  parseScopes,
  resolveClient,
  signConsentTicket,
} from "@/lib/oauth-server";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Rebuild this request's URL so /sign-in can send the person straight back to
 *  the same authorization request, query intact. */
function selfUrl(params: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  return `/oauth/authorize?${query.toString()}`;
}

/** A dead end that never redirects: shown when the client or the redirect URI
 *  cannot be trusted, so a bad URI is never handed a code or an error. */
function AuthorizeError({ title, detail }: { title: string; detail: string }) {
  return (
    <Shell>
      <p className="text-xs uppercase tracking-[0.3em] text-primary">Authorization</p>
      <h1 className="font-brand mt-3 text-2xl text-foreground">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing was shared. Close this window and start the connection again from the app that sent
        you here.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <LogoMark className="h-8 w-8" />
        <span className="font-brand text-xl font-bold text-foreground">Scalar</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}

/**
 * The consent screen. Identity is the product's own Clerk session: a signed-out
 * visitor is sent to /sign-in and returns to this exact URL. Nothing is minted
 * here; approving POSTs a signed ticket to /oauth/authorize/decide, which mints
 * the code server side.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const clientId = one(params, "client_id");
  const redirectUri = one(params, "redirect_uri");
  const state = one(params, "state");
  const responseType = one(params, "response_type");
  const codeChallenge = one(params, "code_challenge");
  const challengeMethod = one(params, "code_challenge_method");
  const resource = one(params, "resource");

  // The client and its redirect URI are settled BEFORE anything is redirected
  // anywhere. An unregistered URI renders an error page; it is never used.
  const client = await resolveClient(clientId);
  if (!client) {
    return (
      <AuthorizeError
        title="Unknown application"
        detail="The client_id in this link is not registered with Scalar."
      />
    );
  }
  if (!matchRedirectUri(client.redirectUris, redirectUri)) {
    return (
      <AuthorizeError
        title="Unregistered redirect address"
        detail={`${client.name} asked Scalar to return you to an address it has not registered. Scalar only ever returns an authorization code to a redirect URI that matches a registered one exactly.`}
      />
    );
  }

  // From here the redirect URI is trusted, so protocol errors go back to the
  // client the way the spec asks for.
  const bounce = (error: string, description: string) => {
    const target = new URL(redirectUri as string);
    target.searchParams.set("error", error);
    target.searchParams.set("error_description", description);
    if (state) target.searchParams.set("state", state);
    redirect(target.toString());
  };

  if (responseType !== "code") bounce("unsupported_response_type", "Only response_type=code is supported");
  if (!codeChallenge) bounce("invalid_request", "PKCE is required: send code_challenge");
  if (challengeMethod !== "S256") {
    bounce("invalid_request", "code_challenge_method must be S256; plain is not accepted");
  }

  // A client that asks for nothing gets the standard default set, narrowed to
  // what it registered. A client whose registered set has nothing in common
  // with the default (an MCP client that only ever holds "mcp", say) gets its
  // own set rather than an empty grant it cannot use.
  const requested = parseScopes(one(params, "scope"));
  const defaults = narrowScopes(DEFAULT_SCOPES, client.scopes);
  const scopes = requested.length
    ? narrowScopes(requested, client.scopes)
    : defaults.length
      ? defaults
      : narrowScopes(client.scopes, client.scopes);
  if (scopes.length === 0) bounce("invalid_scope", "None of the requested scopes are available to this client");

  // Identity: the product's own session. Signed out means sign in and come back
  // to the same authorization request.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(selfUrl(params))}`);
  }
  const { actor } = await getAuthContext();

  // Which account the person is about to expose: their own, or a team workspace
  // they belong to. The grant is bound to whichever they pick.
  const workspaces = await listUserWorkspaces(actor.id);
  const accounts = [
    {
      id: actor.id,
      label: [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email || "Personal",
      kind: "Personal account",
    },
    ...workspaces.map((w) => ({ id: w.workspaceId, label: w.name, kind: `Workspace, you are ${w.role}` })),
  ];

  const ticket = signConsentTicket({
    userId: actor.id,
    clientRowId: client.rowId,
    redirectUri: redirectUri as string,
    scopes,
    codeChallenge: codeChallenge as string,
    ...(state ? { state } : {}),
    ...(resource ? { resource } : {}),
  });

  return (
    <Shell>
      <p className="text-xs uppercase tracking-[0.3em] text-primary">Authorize</p>
      <h1 className="font-brand mt-3 text-2xl leading-snug text-foreground">
        {client.name} wants access to your Scalar data
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {actor.email || actor.firstName || "your Scalar account"}.
      </p>

      <form action="/oauth/authorize/decide" method="post" className="mt-6 space-y-6">
        <input type="hidden" name="ticket" value={ticket} />

        <div>
          <p className="text-sm font-medium text-foreground">It will be able to</p>
          <ul className="mt-3 space-y-3">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 h-px w-4 shrink-0 bg-primary/60" />
                <span>
                  {SCOPE_DESCRIPTIONS[scope] ?? scope}
                  <span className="ml-2 font-mono text-xs text-muted-foreground/70">{scope}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">
            {accounts.length > 1 ? "Which account are you sharing?" : "Account"}
          </p>
          {accounts.length > 1 ? (
            <div className="mt-3 space-y-2">
              {accounts.map((account, index) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <input
                    type="radio"
                    name="accountId"
                    value={account.id}
                    defaultChecked={index === 0}
                    className="mt-1 accent-primary"
                    required
                  />
                  <span>
                    <span className="block text-foreground">{account.label}</span>
                    <span className="block text-xs text-muted-foreground">{account.kind}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-border px-3 py-2.5 text-sm">
              <input type="hidden" name="accountId" value={accounts[0].id} />
              <span className="block text-foreground">{accounts[0].label}</span>
              <span className="block text-xs text-muted-foreground">{accounts[0].kind}</span>
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Access lasts until you revoke it. {client.name} never sees your password, your API keys or
          any other account.
        </p>

        <div className="flex gap-3">
          <Button type="submit" name="decision" value="approve" className="flex-1">
            Approve
          </Button>
          <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
            Deny
          </Button>
        </div>
      </form>
    </Shell>
  );
}
