"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AnalyticsOverview } from "@/components/dashboard/analytics-overview";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

interface Project {
  id: string;
  name: string;
}

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
          if (data.length > 0) setSelectedProjectId(data[0].id);
        }
      })
      .catch(() => {
        setProjects([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Track performance metrics for your launched projects.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No analytics yet"
            description="Analytics will appear here once you have an active project."
          />
        </Card>
      ) : (
        <>
          {projects.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {projects.map((project) => (
                <Button
                  key={project.id}
                  variant={selectedProjectId === project.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  {project.name}
                </Button>
              ))}
            </div>
          )}

          {selectedProjectId && <AnalyticsOverview projectId={selectedProjectId} />}
        </>
      )}
    </div>
  );
}
