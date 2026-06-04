"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Eye, MousePointer } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface AnalyticsEvent {
  id: string;
  event: string;
  value: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AnalyticsOverviewProps {
  projectId: string;
}

export function AnalyticsOverview({ projectId }: AnalyticsOverviewProps) {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/analytics?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {
        setEvents([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="Loading analytics..."
          description=""
        />
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Once your project is live and tracking events, metrics will appear here."
        />
      </Card>
    );
  }

  // Aggregate events by type
  const eventCounts = events.reduce<Record<string, { count: number; totalValue: number }>>((acc, e) => {
    if (!acc[e.event]) acc[e.event] = { count: 0, totalValue: 0 };
    acc[e.event].count++;
    acc[e.event].totalValue += e.value || 0;
    return acc;
  }, {});

  const sortedEvents = Object.entries(eventCounts)
    .sort(([, a], [, b]) => b.count - a.count);

  const maxCount = sortedEvents[0]?.[1].count || 1;

  // Recent events (last 10)
  const recentEvents = [...events]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{sortedEvents.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Event Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">
              {events.reduce((sum, e) => sum + (e.value || 0), 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Value</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Event breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-orange" />
              Event Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedEvents.slice(0, 8).map(([event, data]) => (
              <div key={event}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-mono text-muted-foreground truncate">{event}</span>
                  <span className="font-medium">{data.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange transition-all"
                    style={{ width: `${(data.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MousePointer className="h-4 w-4 text-orange" />
              Recent Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between py-2.5 border-b border-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{event.event}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {event.value !== null && (
                    <Badge variant="secondary">{event.value}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
