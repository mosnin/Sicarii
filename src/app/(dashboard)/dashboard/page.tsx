import Link from "next/link";
import { Radar, Users, Bot, BookOpen, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDbUser } from "@/lib/server-user";
import { prisma } from "@/lib/prisma";

const quickLinks = [
  {
    href: "/discover",
    icon: Radar,
    title: "Discover",
    body: "Find and save contacts with built-in tools.",
  },
  {
    href: "/crm",
    icon: Users,
    title: "CRM",
    body: "Every contact your agents own and operate.",
  },
  {
    href: "/agent",
    icon: Bot,
    title: "Agent",
    body: "Chat to pull lists and enrich the database.",
  },
  {
    href: "/product-context",
    icon: BookOpen,
    title: "Context",
    body: "What you're selling — so agents sell with understanding.",
  },
];

export default async function DashboardPage() {
  const user = await getDbUser();

  const [total, active, won] = user
    ? await Promise.all([
        prisma.contact.count({ where: { userId: user.id } }),
        prisma.contact.count({
          where: {
            userId: user.id,
            status: { in: ["CONTACTED", "REPLIED", "QUALIFIED"] },
          },
        }),
        prisma.contact.count({ where: { userId: user.id, status: "WON" } }),
      ])
    : [0, 0, 0];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">
            Your agents are on it. Here&apos;s the state of your pipeline.
          </p>
        </div>
        <Button variant="glow" asChild>
          <Link href="/discover">
            <Radar className="mr-1 h-4 w-4" />
            Discover contacts
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Contacts", value: total },
          { label: "In conversation", value: active },
          { label: "Won", value: won },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-6">
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="group">
              <Card className="h-full transition-all hover:border-primary/50">
                <CardContent className="flex items-start gap-4 p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 font-semibold">
                      {q.title}
                      <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {q.body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
