"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Receipt } from "lucide-react";

interface InvoiceItem {
  description: string;
  amount: string;
}

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  items: InvoiceItem[];
  subtotal: string;
  tax: string;
  total: string;
  projectName: string;
  clientName: string;
}

export function InvoiceCard({ invoice }: { invoice: InvoiceData }) {
  const handleDownload = () => {
    const invoiceContent = `
INVOICE: ${invoice.invoiceNumber}
Date: ${invoice.date}
Client: ${invoice.clientName}
Project: ${invoice.projectName}

${invoice.items.map((i) => `${i.description}: ${i.amount}`).join("\n")}

Subtotal: ${invoice.subtotal}
Tax: ${invoice.tax}
Total: ${invoice.total}

Status: ${invoice.status.toUpperCase()}
    `.trim();

    const blob = new Blob([invoiceContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Receipt className="h-5 w-5 text-orange" />
          Invoice
        </CardTitle>
        <Badge variant={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "destructive" : "warning"}>
          {invoice.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Invoice #</span>
          <span className="font-mono">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Date</span>
          <span>{invoice.date}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Project</span>
          <span>{invoice.projectName}</span>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          {invoice.items.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.description}</span>
              <span>{item.amount}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{invoice.subtotal}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span>{invoice.tax}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="text-orange">{invoice.total}</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleDownload}>
          <Download className="mr-1 h-4 w-4" />
          Download Invoice
        </Button>
      </CardContent>
    </Card>
  );
}
