import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProductContextPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <BookOpen className="h-6 w-6 text-primary" />
          Product Context
        </h1>
        <p className="text-muted-foreground mt-1">
          A comprehensive, structured store of what you&apos;re selling — readable
          by every agent, so outreach is informed instead of generic.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={BookOpen}
          title="Build your product context next"
          description="This becomes an agent-consumable knowledge base your internal and connected agents read before they act. Coming in an upcoming cycle."
        />
      </Card>
    </div>
  );
}
