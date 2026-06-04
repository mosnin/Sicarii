import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  projects,
  projectPhases,
  files as filesTable,
  invoices,
  payments,
  users,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ProjectDetailClient } from "./client";

const serviceLabels: Record<string, string> = {
  web_application: "Web Application",
  ecommerce_store: "E-Commerce Store",
  funnels: "Funnels",
  ai_automation: "AI Automation",
  open_claw_deployment: "Open Claw Deployment",
};

const statusLabels: Record<string, string> = {
  onboarding: "Onboarding",
  payment_pending: "Payment Pending",
  in_progress: "In Progress",
  revision: "Revision",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return null;

  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, userId));
  if (!dbUser) return null;

  // Fetch project
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!project) notFound();

  // Verify ownership (unless admin)
  if (dbUser.role !== "admin" && project.userId !== dbUser.id) notFound();

  // Fetch related data in parallel
  const [phases, projectFiles, projectInvoices] = await Promise.all([
    db
      .select()
      .from(projectPhases)
      .where(eq(projectPhases.projectId, id)),
    db
      .select()
      .from(filesTable)
      .where(eq(filesTable.projectId, id)),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, id)),
  ]);

  const sortedPhases = phases
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      status: p.status,
      order: p.order,
    }));

  const fileData = projectFiles.map((f) => ({
    name: f.name,
    url: f.url,
    size: f.size ? formatBytes(f.size) : "Unknown",
    type: f.type || "application/octet-stream",
  }));

  // Format invoice for display
  const invoice = projectInvoices[0];
  const invoiceData = invoice
    ? {
        invoiceNumber: invoice.invoiceNumber,
        date: new Date(invoice.issuedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        status: invoice.status as "paid" | "pending" | "overdue",
        projectName: project.name,
        clientName: `${dbUser.firstName || ""} ${dbUser.lastName || ""}`.trim() || dbUser.email,
        items: (invoice.items as Array<{ description: string; amount: string }>) || [],
        subtotal: formatCurrency(invoice.subtotal),
        tax: formatCurrency(invoice.tax),
        total: formatCurrency(invoice.total),
      }
    : null;

  const showSurvey =
    project.status === "completed" || project.status === "revision";

  return (
    <ProjectDetailClient
      project={{
        id: project.id,
        name: project.name,
        serviceType: serviceLabels[project.serviceType] || project.serviceType,
        status: statusLabels[project.status] || project.status,
        createdAt: new Date(project.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      }}
      phases={sortedPhases}
      files={fileData}
      invoice={invoiceData}
      showSurvey={showSurvey}
    />
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
