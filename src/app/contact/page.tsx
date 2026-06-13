"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { AsciiField } from "@/components/dashboard/ascii-field";
import { motion, useReducedMotion } from "motion/react";
import { Send, Loader2 } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

const topics = [
  { value: "", label: "What's this about?" },
  { value: "general", label: "General question" },
  { value: "bringing_agent", label: "Bringing my own agent (MCP)" },
  { value: "sales", label: "Plans and pricing" },
  { value: "billing", label: "Billing or account" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Something else" },
];

export default function ContactPage() {
  const reduce = useReducedMotion();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    topic: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <>
      <Header />
      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <AsciiField
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10] dark:opacity-[0.20]"
            cell={14}
            speed={0.06}
            gradient
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(90,176,232,0.12),transparent_55%)]" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Contact</p>
            <h1 className="font-brand mt-4 text-4xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Talk to <span className="text-gradient-orange">the team</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Questions about Scalar, connecting your agent, or what it can do for
              your team? Send a note and we will get back to you within a day.
            </p>
          </div>
        </section>

        {/* Form + info */}
        <section className="pb-24 sm:pb-32">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
              {/* Form */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="lg:col-span-3"
              >
                <Card>
                  <CardContent className="p-6 sm:p-8">
                    {submitted ? (
                      <motion.div
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="py-12 text-center"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success" />
                          Sent
                        </span>
                        <h3 className="font-brand mt-4 text-xl text-foreground">Message sent</h3>
                        <p className="mt-2 text-muted-foreground">
                          Thanks for reaching out. We will reply within a day.
                        </p>
                        <Button
                          variant="outline"
                          className="mt-6"
                          onClick={() => {
                            setSubmitted(false);
                            setForm({ name: "", email: "", company: "", topic: "", message: "" });
                          }}
                        >
                          Send another message
                        </Button>
                      </motion.div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium">
                              Name <span className="text-destructive">*</span>
                            </label>
                            <Input
                              required
                              placeholder="Your name"
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium">
                              Email <span className="text-destructive">*</span>
                            </label>
                            <Input
                              required
                              type="email"
                              placeholder="you@company.com"
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-sm font-medium">Company</label>
                            <Input
                              placeholder="Where you work"
                              value={form.company}
                              onChange={(e) => setForm({ ...form, company: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium">Topic</label>
                            <select
                              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              value={form.topic}
                              onChange={(e) => setForm({ ...form, topic: e.target.value })}
                            >
                              {topics.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium">
                            Message <span className="text-destructive">*</span>
                          </label>
                          <Textarea
                            required
                            placeholder="Tell us what you are working on and how we can help."
                            rows={5}
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                          />
                        </div>
                        <Button
                          type="submit"
                          variant="glow"
                          size="lg"
                          className="w-full"
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Send message
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                          No spam. We reply within a day on business days.
                        </p>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Info: clean text rows, no icon-in-box badges */}
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
                className="space-y-8 lg:col-span-2"
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">Email</p>
                  <a
                    href="mailto:hello@tryscalar.xyz"
                    className="mt-2 block font-brand text-lg text-foreground transition-colors hover:text-primary"
                  >
                    hello@tryscalar.xyz
                  </a>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">Response time</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We typically reply within a day during business days.
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-primary">Where</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Remote first. Scalar works wherever your agents do.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-brand text-base text-foreground">Prefer to skip the form?</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Create your account and let your agent start building the CRM.
                  </p>
                  <Button className="mt-4 w-full rounded-full" asChild>
                    <Link href="/sign-up">Get started</Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
