import { headers } from "next/headers";
import { FloatIn } from "@/components/ui/float-in";
import { ApiKeysManager } from "./api-keys";
import { AgentMailKeyForm } from "@/components/dashboard/agentmail-key-form";
import { AgentPhoneKeyForm } from "@/components/dashboard/agentphone-key-form";
import { VoiceSettingsForm } from "@/components/dashboard/voice-settings-form";
import { AutoRadarToggle } from "@/components/dashboard/auto-radar-toggle";
import { TaskWebhookForm } from "@/components/dashboard/task-webhook-form";
import { WebhookUrl } from "@/components/dashboard/webhook-url";
import { BillingUpgrade } from "@/components/dashboard/billing-upgrade";
import { getDbUser } from "@/lib/server-user";
import { getBilling } from "@/lib/credits";

export const dynamic = "force-dynamic";

const PAID_PLANS = ["starter", "pro", "business"];

/** Twenty settings section: a heading and a muted description over a bordered
 *  panel. Purely presentational. */
function SettingsSection({
  title,
  description,
  children,
  flush = false,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div
        className={
          flush
            ? "mt-3 rounded-[8px] border border-border bg-card"
            : "mt-3 rounded-[8px] border border-border bg-card p-3"
        }
      >
        {children}
      </div>
    </section>
  );
}

/** One label/value row inside a settings panel. */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-2 px-3 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-foreground">{children}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getDbUser();
  const agentMailLast4 = user?.agentMailApiKey ? user.agentMailApiKey.slice(-4) : null;
  const agentPhoneLast4 = user?.agentPhoneApiKey ? user.agentPhoneApiKey.slice(-4) : null;
  const billing = user ? await getBilling(user.id) : null;
  const planLabel = billing
    ? billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)
    : null;

  const h = await headers();
  const host = h.get("host") ?? "www.tryscalar.xyz";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const mcpUrl = `${proto}://${host}/api/mcp/mcp`;
  const voiceWebhookBase = `${proto}://${host}/api/webhooks/agentphone`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      {/* Header */}
      <FloatIn delay={0}>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account, agent access, and connections.
        </p>
      </FloatIn>

      {/* Account */}
      <FloatIn delay={0.04}>
        <SettingsSection title="Account" description="Your profile information from Clerk." flush>
          <div className="divide-y divide-border">
            <FieldRow label="Name">
              {user?.firstName} {user?.lastName}
            </FieldRow>
            <FieldRow label="Email">{user?.email}</FieldRow>
          </div>
        </SettingsSection>
      </FloatIn>

      {/* Billing */}
      <FloatIn delay={0.06}>
        <SettingsSection
          title="Billing"
          description="Your plan and credit meter. Credits are spent only when an agent pulls real data from the outside world; CRM reads and writes are free, and a miss is never charged."
          flush
        >
          <div className="divide-y divide-border">
            <FieldRow label="Plan">{planLabel ?? "Free"}</FieldRow>
            <FieldRow label="Credits remaining">
              <span className="font-medium tabular-nums text-primary">
                {billing ? billing.creditsRemaining.toLocaleString() : "0"}
              </span>
            </FieldRow>
            <FieldRow label="Resets">
              {billing?.creditsResetAt
                ? new Date(billing.creditsResetAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "On your first metered action"}
            </FieldRow>
          </div>
          {billing && !PAID_PLANS.includes(billing.plan) && (
            <div className="border-t border-border p-3">
              <p className="mb-3 text-sm text-muted-foreground">
                Upgrade for a bigger monthly allotment and scheduled monitors.
              </p>
              <BillingUpgrade />
            </div>
          )}
        </SettingsSection>
      </FloatIn>

      {/* Automation preferences */}
      <FloatIn delay={0.08}>
        <SettingsSection
          title="Automation"
          description={<>What your agent does on its own while you&apos;re away.</>}
        >
          <AutoRadarToggle initialOn={user?.autoRadar ?? true} />
        </SettingsSection>
      </FloatIn>

      {/* API keys */}
      <FloatIn delay={0.1}>
        <ApiKeysManager />
      </FloatIn>

      {/* MCP connector */}
      <FloatIn delay={0.12}>
        <SettingsSection
          title="Connect your agent (MCP)"
          description="Add Scalar as a remote MCP connector in Claude or any MCP client. Use this URL. It authorizes over OAuth (you sign in to approve), or your agent can pass an API key above as a Bearer token."
        >
          <WebhookUrl url={mcpUrl} />
        </SettingsSection>
      </FloatIn>

      {/* AgentMail */}
      <FloatIn delay={0.14}>
        <SettingsSection
          title="AgentMail"
          description="Connect your AgentMail account to send and sync email onto contacts."
        >
          <AgentMailKeyForm initialLast4={agentMailLast4} />
        </SettingsSection>
      </FloatIn>

      {/* AgentPhone */}
      <FloatIn delay={0.16}>
        <SettingsSection
          title="AgentPhone"
          description="Connect your AgentPhone account so agents can call leads and track every call on the contact."
        >
          <AgentPhoneKeyForm initialLast4={agentPhoneLast4} />
        </SettingsSection>
      </FloatIn>

      {/* Voice-native CRM - call your AgentPhone number and ask out loud */}
      <FloatIn delay={0.18}>
        <SettingsSection
          title="Voice"
          description="Call in and ask Scalar what needs your attention. Requires AgentPhone."
        >
          <VoiceSettingsForm
            initialEnabled={user?.voiceEnabled ?? false}
            connected={Boolean(user?.agentPhoneApiKey)}
            initialSecret={user?.voiceInboundSecret ?? null}
            webhookBase={voiceWebhookBase}
          />
        </SettingsSection>
      </FloatIn>

      {/* Outbound webhook - notify your agent when a scheduled task completes */}
      <FloatIn delay={0.2}>
        <SettingsSection
          title="Agent notifications webhook"
          description="When a scheduled task finishes (intent monitor or background research), Scalar POSTs the new results to this URL so your agent (e.g. openclaw or Hermes) can wake up and act on them."
        >
          <TaskWebhookForm initialUrl={user?.taskWebhookUrl ?? null} />
        </SettingsSection>
      </FloatIn>
    </div>
  );
}
