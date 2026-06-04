import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

const demoClients = [
  { name: "John Doe", email: "john@example.com", projects: 2, joined: "Feb 10, 2026" },
  { name: "Jane Smith", email: "jane@example.com", projects: 1, joined: "Feb 22, 2026" },
  { name: "Bob Wilson", email: "bob@example.com", projects: 1, joined: "Mar 1, 2026" },
  { name: "Sarah Lee", email: "sarah@example.com", projects: 3, joined: "Jan 15, 2026" },
  { name: "Mike Chen", email: "mike@example.com", projects: 1, joined: "Mar 5, 2026" },
];

export default function AdminClientsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Clients</h1>
        <p className="text-muted-foreground mt-1">Manage all registered clients.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-orange" />
            All Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Projects</th>
                  <th className="pb-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {demoClients.map((client, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="py-3 font-medium">{client.name}</td>
                    <td className="py-3 text-muted-foreground">{client.email}</td>
                    <td className="py-3">
                      <Badge variant="secondary">{client.projects}</Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{client.joined}</td>
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
