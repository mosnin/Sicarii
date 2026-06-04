"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PhaseTracker, type Phase } from "@/components/dashboard/phase-tracker";
import { FilePreviewCard } from "@/components/dashboard/file-preview";
import { ProjectComments } from "@/components/dashboard/project-comments";
import { NPSSurvey } from "@/components/dashboard/nps-survey";
import { InvoiceCard } from "@/components/dashboard/invoice-card";
import { AnalyticsOverview } from "@/components/dashboard/analytics-overview";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Upload,
  Send,
  MessageSquare,
  RotateCcw,
  BarChart3,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  items: { description: string; amount: string }[];
  subtotal: string;
  tax: string;
  total: string;
  projectName: string;
  clientName: string;
}

interface ProjectDetailClientProps {
  project: {
    id: string;
    name: string;
    serviceType: string;
    status: string;
    createdAt: string;
  };
  phases: Phase[];
  files: { name: string; url: string; size: string; type: string }[];
  invoice: InvoiceData | null;
  showSurvey: boolean;
}

const tabItems = [
  { value: "progress", label: "Progress", icon: RotateCcw },
  { value: "comments", label: "Comments", icon: MessageCircle },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
];

export function ProjectDetailClient({
  project,
  phases,
  files,
  invoice,
  showSurvey: initialShowSurvey,
}: ProjectDetailClientProps) {
  const [revisionText, setRevisionText] = useState("");
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [showSurvey, setShowSurvey] = useState(initialShowSurvey);

  const handleSubmitRevision = async () => {
    if (!revisionText.trim()) return;
    setSubmittingRevision(true);
    try {
      const res = await fetch("/api/revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          description: revisionText,
        }),
      });
      if (res.ok) {
        setRevisionText("");
      }
    } finally {
      setSubmittingRevision(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{project.name}</h1>
          <p className="text-muted-foreground mt-1">{project.serviceType}</p>
        </div>
        <Badge variant="orange" className="text-sm px-3 py-1">
          {project.status}
        </Badge>
      </div>

      {/* NPS Survey */}
      {showSurvey && (
        <NPSSurvey
          projectId={project.id}
          projectName={project.name}
          onDismiss={() => setShowSurvey(false)}
        />
      )}

      {/* Tabbed content */}
      <Tabs.Root defaultValue="progress">
        <Tabs.List className="flex gap-1 border-b border-border mb-6">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            return (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 border-transparent cursor-pointer",
                  "data-[state=active]:border-orange data-[state=active]:text-orange",
                  "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* Progress tab */}
        <Tabs.Content value="progress">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-orange" />
                    Build Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {phases.length > 0 ? (
                    <PhaseTracker phases={phases} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Phases will appear here once your project kicks off.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Revision Request */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-orange" />
                    Request a Revision
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe what you'd like changed..."
                    rows={3}
                    value={revisionText}
                    onChange={(e) => setRevisionText(e.target.value)}
                  />
                  <Button
                    disabled={!revisionText.trim() || submittingRevision}
                    onClick={handleSubmitRevision}
                  >
                    <Send className="mr-1 h-4 w-4" />
                    {submittingRevision ? "Submitting..." : "Submit Revision Request"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              {/* Files */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-orange" />
                    Files
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop or click to upload
                    </p>
                    <Button variant="outline" size="sm" className="mt-3">
                      Choose Files
                    </Button>
                  </div>

                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <FilePreviewCard
                          key={file.name}
                          name={file.name}
                          url={file.url}
                          type={file.type}
                          size={file.size}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center">
                      No files uploaded yet.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Invoice */}
              {invoice && <InvoiceCard invoice={invoice} />}

              {/* Project Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Project Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service</span>
                    <span>{project.serviceType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="orange" className="text-xs">
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{project.createdAt}</span>
                  </div>
                  {invoice && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment</span>
                      <Badge
                        variant={invoice.status === "paid" ? "success" : "warning"}
                        className="text-xs"
                      >
                        {invoice.status === "paid" ? "Paid" : "Pending"}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </Tabs.Content>

        {/* Comments tab */}
        <Tabs.Content value="comments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-orange" />
                Project Comments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectComments projectId={project.id} />
            </CardContent>
          </Card>
        </Tabs.Content>

        {/* Analytics tab */}
        <Tabs.Content value="analytics">
          <AnalyticsOverview projectId={project.id} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
