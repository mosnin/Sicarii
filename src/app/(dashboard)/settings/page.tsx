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
import { WebhookUrl } from "@/components/dashboard/webhook-url";
import { getDbUser, getOrCreateWebhookToken } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getDbUser();
  const agentMailLast4 = user?.agentMailApiKey ? user.agentMailApiKey.slice(-4) : null;

  // Per-user inbound webhook URL for Synthoz async results.
  let webhookUrl: string | null = null;
  if (user) {
    const token = await getOrCreateWebhookToken(user.id);
    const h = await headers();
    const host = h.get("host") ?? "www.tryscalar.xyz";
    const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
    webhookUrl = `${proto}://${host}/api/webhooks/synthoz/${token}`;
  }

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

      {/* API keys */}
      <FloatIn delay={0.14}>
        <ApiKeysManager />
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

      {/* Synthoz async results webhook */}
      {webhookUrl && (
        <FloatIn delay={0.26}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discovery results webhook</CardTitle>
              <CardDescription>
                Some Synthoz tools (like email finding) return results asynchronously.
                Paste this URL as the <span className="font-medium">outgoing webhook</span> in
                your Synthoz dashboard and results will flow straight into your CRM.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WebhookUrl url={webhookUrl} />
            </CardContent>
          </Card>
        </FloatIn>
      )}
    </div>
  );
}
