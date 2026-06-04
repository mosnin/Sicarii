import { currentUser } from "@clerk/nextjs/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiKeysManager } from "./api-keys";

export default async function SettingsPage() {
  const user = await currentUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Your account, agent access, and connections.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your profile information from Clerk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span>
              {user?.firstName} {user?.lastName}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.emailAddresses[0]?.emailAddress}</span>
          </div>
        </CardContent>
      </Card>

      <ApiKeysManager />

      <Card>
        <CardHeader>
          <CardTitle>AgentMail</CardTitle>
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
    </div>
  );
}
