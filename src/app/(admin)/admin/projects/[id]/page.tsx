"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PhaseTracker, type Phase } from "@/components/dashboard/phase-tracker";
import {
  ArrowLeft,
  Check,
  FileText,
  MessageSquare,
  Send,
  SkipForward,
} from "lucide-react";
import Link from "next/link";

const initialPhases: Phase[] = [
  { id: "1", name: "Discovery", description: "Understanding requirements", status: "completed", order: 0 },
  { id: "2", name: "Design", description: "Wireframes and visual design", status: "completed", order: 1 },
  { id: "3", name: "Development", description: "Building the application", status: "in_progress", order: 2 },
  { id: "4", name: "Testing", description: "QA and bug fixes", status: "pending", order: 3 },
  { id: "5", name: "Review", description: "Client review and feedback", status: "pending", order: 4 },
  { id: "6", name: "Launch", description: "Deployment", status: "pending", order: 5 },
];

export default function AdminProjectDetailPage() {
  const [phases, setPhases] = useState(initialPhases);
  const [message, setMessage] = useState("");

  const advancePhase = () => {
    setPhases((prev) => {
      const currentIndex = prev.findIndex((p) => p.status === "in_progress");
      if (currentIndex === -1) return prev;

      return prev.map((phase, i) => {
        if (i === currentIndex) return { ...phase, status: "completed" as const };
        if (i === currentIndex + 1) return { ...phase, status: "in_progress" as const };
        return phase;
      });
    });
  };

  const currentPhase = phases.find((p) => p.status === "in_progress");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/projects">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">E-commerce Platform</h1>
          <p className="text-muted-foreground">
            Client: John Doe &middot; Ecommerce Store
          </p>
        </div>
        <Badge variant="orange" className="text-sm px-3 py-1">
          In Progress
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left: Phase management */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Phase Management</CardTitle>
              <Button onClick={advancePhase} disabled={!currentPhase} size="sm">
                <SkipForward className="mr-1 h-4 w-4" />
                Advance Phase
              </Button>
            </CardHeader>
            <CardContent>
              <PhaseTracker phases={phases} />
            </CardContent>
          </Card>

          {/* Admin message to client */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-orange" />
                Message Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Send a message to the client..."
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button disabled={!message.trim()}>
                <Send className="mr-1 h-4 w-4" />
                Send Message
              </Button>
            </CardContent>
          </Card>

          {/* Revision requests */}
          <Card>
            <CardHeader>
              <CardTitle>Revision Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Homepage hero section needs larger CTA button
                  </span>
                  <Badge variant="warning">Pending</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Requested Mar 18, 2026
                </p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline">
                    <Check className="mr-1 h-3 w-3" />
                    Mark Complete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Client info & files */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>John Doe</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>john@example.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span>Ecommerce Store</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <Badge variant="success" className="text-xs">Paid - $2,500</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timeline</span>
                <span>4-6 weeks</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Onboarding Data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Business</span>
                <span>Doe Commerce LLC</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Industry</span>
                <span>Retail / Fashion</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Description</span>
                <p className="text-muted-foreground">
                  Online fashion store targeting Gen Z consumers with sustainable clothing brands.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange" />
                Client Files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {["brand-guide.pdf", "logo-assets.zip", "product-photos.zip"].map(
                (file) => (
                  <div
                    key={file}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-orange" />
                    <span className="text-sm truncate">{file}</span>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
