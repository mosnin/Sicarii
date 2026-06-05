import Link from "next/link";
import { Radar, Globe, Mails, Building2, UserSearch, Plus, AlertCircle } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatIn } from "@/components/ui/float-in";
import { SpotlightCard } from "@/components/ui/spotlight-card";

const tools = [
  {
    icon: Building2,
    title: "Enrich by domain",
    body: "Give a company domain, get a fully enriched company + contacts.",
  },
  {
    icon: UserSearch,
    title: "Find emails",
    body: "First name + last name + company → a verified email address.",
  },
  {
    icon: Globe,
    title: "Extract from URLs",
    body: "Paste a list of websites, pull emails, phones, and socials.",
  },
  {
    icon: Mails,
    title: "Company name → leads",
    body: "Turn a company name into enriched lead records.",
  },
];

export default function DiscoverPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <FloatIn delay={0} className="flex items-center justify-between">
        <div>
          <h1 className="font-brand flex items-center gap-2 text-2xl sm:text-3xl text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Radar className="h-5 w-5 text-primary" />
            </span>
            Discover
          </h1>
          <p className="text-muted-foreground mt-1">
            Find contacts with built-in tools and save them straight into your CRM.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/crm/new">
            <Plus className="mr-1 h-4 w-4" />
            Add manually
          </Link>
        </Button>
      </FloatIn>

      {/* Coming-soon notice */}
      <FloatIn delay={0.06}>
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Discovery tools wire up next. Until then, add contacts manually or ask the{" "}
            <Link href="/agent" className="font-medium underline underline-offset-4 hover:opacity-80">
              agent
            </Link>
            — everything you save lives in your{" "}
            <Link href="/crm" className="font-medium underline underline-offset-4 hover:opacity-80">
              CRM
            </Link>
            .
          </p>
        </div>
      </FloatIn>

      {/* Tool cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t, i) => {
          const Icon = t.icon;
          return (
            <FloatIn key={t.title} delay={0.1 + i * 0.06}>
              <SpotlightCard className="border-border bg-card h-full">
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant="secondary">Coming next</Badge>
                  </div>
                  <CardTitle className="text-base font-semibold text-foreground">{t.title}</CardTitle>
                  <CardDescription className="text-muted-foreground">{t.body}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" disabled className="w-full">
                    Run tool
                  </Button>
                </CardContent>
              </SpotlightCard>
            </FloatIn>
          );
        })}
      </div>
    </div>
  );
}
