import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { headers } from "next/headers";
import { FloatIn } from "@/components/ui/float-in";
import { ApiKeysManager } from "./api-keys";
import { AgentMailKeyForm } from "@/components/dashboard/agentmail-key-form";
import { TaskWebhookForm } from "@/components/dashboard/task-webhook-form";
import { WebhookUrl } from "@/components/dashboard/webhook-url";
import { BillingUpgrade } from "@/components/dashboard/billing-upgrade";
import { getDbUser } from "@/lib/server-user";
import { getBilling } from "@/lib/credits";

export const dynamic = "force-dynamic";

const PAID_PLANS = ["starter", "pro", "business"];

export default async function SettingsPage() {
  const user = await getDbUser();
  const agentMailLast4 = user?.agentMailApiKey ? user.agentMailApiKey.slice(-4) : null;
  const billing = user ? await getBilling(user.id) : null;
  const planLabel = billing
    ? billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)
    : null;

  const h = await headers();
  const host = h.get("host") ?? "www.tryscalar.xyz";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const mcpUrl = `${proto}://${host}/api/mcp/mcp`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <FloatIn delay={0}>
        <h1 className="font-brand text-2xl sm:text-3xl text-foreground">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Your account, agent access, and connections.
        </p>
      </FloatIn>

      {/* Account card */}
      <FloatIn delay={0.08}>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your profile information from Clerk.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{user?.email}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </FloatIn>

      {/* Billing */}
      <FloatIn delay={0.11}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing</CardTitle>
            <CardDescription>
              Your plan and credit meter. Credits are spent only when an agent
              pulls real data from the outside world; CRM reads and writes are
              free, and a miss is never charged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{planLabel ?? "Free"}</span>
              </div>
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-muted-foreground">Credits remaining</span>
                <span className="font-medium text-primary">
                  {billing ? billing.creditsRemaining.toLocaleString() : "0"}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 text-sm">
                <span className="text-muted-foreground">Resets</span>
                <span className="font-medium">
                  {billing?.creditsResetAt
                    ? new Date(billing.creditsResetAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "On your first metered action"}
                </span>
              </div>
            </div>
            {billing && !PAID_PLANS.includes(billing.plan) && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Upgrade for a bigger monthly allotment and scheduled monitors.
                </p>
                <BillingUpgrade />
              </div>
            )}
          </CardContent>
        </Card>
      </FloatIn>

      {/* API keys */}
      <FloatIn delay={0.14}>
        <ApiKeysManager />
      </FloatIn>

      {/* MCP connector */}
      <FloatIn delay={0.17}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect your agent (MCP)</CardTitle>
            <CardDescription>
              Add Scalar as a remote MCP connector in Claude or any MCP client.
              Use this URL. It authorizes over OAuth (you sign in to approve), or
              your agent can pass an API key above as a Bearer token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhookUrl url={mcpUrl} />
          </CardContent>
        </Card>
      </FloatIn>

      {/* AgentMail */}
      <FloatIn delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AgentMail</CardTitle>
            <CardDescription>
              Connect your AgentMail account to send and sync email onto contacts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentMailKeyForm initialLast4={agentMailLast4} />
          </CardContent>
        </Card>
      </FloatIn>

      {/* Outbound webhook - notify your agent when a scheduled task completes */}
      <FloatIn delay={0.26}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent notifications webhook</CardTitle>
            <CardDescription>
              When a scheduled task finishes (intent monitor or background
              research), Scalar POSTs the new results to this URL so your agent
              (e.g. openclaw or Hermes) can wake up and act on them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaskWebhookForm initialUrl={user?.taskWebhookUrl ?? null} />
          </CardContent>
        </Card>
      </FloatIn>
    </div>
  );
}
