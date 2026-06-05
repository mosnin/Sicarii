import { currentUser } from "@clerk/nextjs/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FloatIn } from "@/components/ui/float-in";
import { ApiKeysManager } from "./api-keys";
import { Settings } from "lucide-react";

export default async function SettingsPage() {
  const user = await currentUser();

  return (
    <div className="space-y-8">
      {/* Header */}
      <FloatIn delay={0}>
        <h1 className="font-brand flex items-center gap-2 text-2xl sm:text-3xl text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </span>
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
                <span className="font-medium">{user?.emailAddresses[0]?.emailAddress}</span>
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">Coming next</Badge>
              Email connection lands in an upcoming cycle.
            </div>
          </CardContent>
        </Card>
      </FloatIn>
    </div>
  );
}
