import Link from "next/link";
import { Radar, Globe, Mails, Building2, UserSearch, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <Radar className="h-6 w-6 text-primary" />
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.title} className="relative">
              <CardHeader>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary">Coming next</Badge>
                </div>
                <CardTitle className="text-lg">{t.title}</CardTitle>
                <CardDescription>{t.body}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" disabled className="w-full">
                  Run tool
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        The discovery tools wire up next. Until then, add contacts manually or
        ask the agent — and everything you save lives in your{" "}
        <Link href="/crm" className="text-primary underline-offset-4 hover:underline">
          CRM
        </Link>
        .
      </p>
    </div>
  );
}
