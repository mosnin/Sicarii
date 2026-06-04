import { Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function AgentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Bot className="h-6 w-6 text-primary" />
          Agent
        </h1>
        <p className="text-muted-foreground mt-1">
          Chat with an agent that has hands — it pulls lists, enriches records,
          and reads and writes your CRM directly.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={Bot}
          title="The agent is coming next"
          description="The built-in chat agent — with read+write CRM access and full product context — is the next cycle. It'll also be reachable by your own agents (OpenClaw, Hermes, Claude Cowork) over MCP."
        />
      </Card>
    </div>
  );
}
