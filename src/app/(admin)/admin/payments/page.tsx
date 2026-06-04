import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";

const demoPayments = [
  { client: "John Doe", project: "E-commerce Platform", amount: "$2,500", status: "paid", date: "Mar 1, 2026" },
  { client: "Jane Smith", project: "Lead Gen Funnel", amount: "$1,200", status: "paid", date: "Feb 28, 2026" },
  { client: "Bob Wilson", project: "AI Chatbot", amount: "$3,000", status: "pending", date: "Mar 10, 2026" },
  { client: "Sarah Lee", project: "Company Website", amount: "$2,500", status: "paid", date: "Jan 20, 2026" },
  { client: "Mike Chen", project: "Open Claw Setup", amount: "$2,000", status: "paid", date: "Mar 8, 2026" },
];

export default function AdminPaymentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Payments</h1>
        <p className="text-muted-foreground mt-1">Track all payments and revenue.</p>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-3xl font-bold mt-1">$11,200</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-3xl font-bold text-success mt-1">$8,200</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-3xl font-bold text-warning mt-1">$3,000</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-orange" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {demoPayments.map((payment, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="py-3 font-medium">{payment.client}</td>
                    <td className="py-3 text-muted-foreground">{payment.project}</td>
                    <td className="py-3 font-semibold">{payment.amount}</td>
                    <td className="py-3">
                      <Badge variant={payment.status === "paid" ? "success" : "warning"}>
                        {payment.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted-foreground">{payment.date}</td>
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
