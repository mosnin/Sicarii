import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FolderKanban, CreditCard, MessageSquare, TrendingUp } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Agency Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of all clients, projects, and payments.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange/10">
              <Users className="h-6 w-6 text-orange" />
            </div>
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-muted-foreground">Total Clients</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange/10">
              <FolderKanban className="h-6 w-6 text-orange" />
            </div>
            <div>
              <p className="text-2xl font-bold">8</p>
              <p className="text-sm text-muted-foreground">Active Projects</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange/10">
              <CreditCard className="h-6 w-6 text-orange" />
            </div>
            <div>
              <p className="text-2xl font-bold">$24,500</p>
              <p className="text-sm text-muted-foreground">Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange/10">
              <MessageSquare className="h-6 w-6 text-orange" />
            </div>
            <div>
              <p className="text-2xl font-bold">5</p>
              <p className="text-sm text-muted-foreground">Unread Messages</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange" />
            Recent Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium">Service</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { client: "John Doe", project: "E-commerce Platform", service: "Ecommerce Store", status: "in_progress", phase: "Development" },
                  { client: "Jane Smith", project: "Lead Gen Funnel", service: "Funnels", status: "in_progress", phase: "Design" },
                  { client: "Bob Wilson", project: "AI Chatbot", service: "AI Automation", status: "payment_pending", phase: "Discovery" },
                  { client: "Sarah Lee", project: "Company Website", service: "Web Application", status: "completed", phase: "Launch" },
                  { client: "Mike Chen", project: "Open Claw Setup", service: "Open Claw Deployment", status: "in_progress", phase: "Testing" },
                ].map((project, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="py-3">{project.client}</td>
                    <td className="py-3 font-medium">{project.project}</td>
                    <td className="py-3 text-muted-foreground">{project.service}</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          project.status === "completed"
                            ? "success"
                            : project.status === "payment_pending"
                            ? "warning"
                            : "orange"
                        }
                      >
                        {project.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{project.phase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
