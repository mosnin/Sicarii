import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

// Enums
export const serviceTypeEnum = pgEnum("service_type", [
  "web_application",
  "ecommerce_store",
  "funnels",
  "ai_automation",
  "open_claw_deployment",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "onboarding",
  "payment_pending",
  "in_progress",
  "revision",
  "completed",
  "cancelled",
]);

export const phaseStatusEnum = pgEnum("phase_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const messageRoleEnum = pgEnum("message_role", ["client", "admin"]);

export const revisionStatusEnum = pgEnum("revision_status", [
  "pending",
  "in_progress",
  "completed",
  "rejected",
]);

// Users - synced with Clerk
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  imageUrl: text("image_url"),
  role: varchar("role", { length: 50 }).notNull().default("client"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Projects
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  status: projectStatusEnum("status").notNull().default("onboarding"),
  currentPhase: integer("current_phase").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_projects_user_id").on(table.userId),
]);

// Onboarding submissions
export const onboardingSubmissions = pgTable("onboarding_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }),
  website: varchar("website", { length: 500 }),
  description: text("description"),
  targetAudience: text("target_audience"),
  timeline: varchar("timeline", { length: 100 }),
  budget: varchar("budget", { length: 100 }),
  additionalNotes: text("additional_notes"),
  brandColors: text("brand_colors"),
  features: jsonb("features"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_onboarding_project_id").on(table.projectId),
]);

// Project phases
export const projectPhases = pgTable("project_phases", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  order: integer("order").notNull(),
  status: phaseStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_phases_project_id").on(table.projectId),
]);

// Payments
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  creemPaymentId: varchar("creem_payment_id", { length: 255 }).unique(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("usd"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_payments_project_id").on(table.projectId),
  index("idx_payments_user_id").on(table.userId),
]);

// Messages
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  senderId: uuid("sender_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_project_id").on(table.projectId),
]);

// Files
export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  uploadedBy: uuid("uploaded_by")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  url: text("url").notNull(),
  size: integer("size"),
  type: varchar("type", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_files_project_id").on(table.projectId),
]);

// Revision requests
export const revisionRequests = pgTable("revision_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  description: text("description").notNull(),
  status: revisionStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_revisions_project_id").on(table.projectId),
]);

// Notifications
export const notificationTypeEnum = pgEnum("notification_type", [
  "phase_update",
  "message_received",
  "revision_response",
  "payment_confirmed",
  "project_completed",
  "file_uploaded",
  "comment_added",
  "survey_request",
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  read: boolean("read").notNull().default(false),
  actionUrl: varchar("action_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
]);

// Project comments (thread-based)
export const projectComments = pgTable("project_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  parentId: uuid("parent_id"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_comments_project_id").on(table.projectId),
]);

// Client satisfaction surveys
export const satisfactionSurveys = pgTable("satisfaction_surveys", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  score: integer("score").notNull(), // 1-10 NPS
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_surveys_project_id").on(table.projectId),
]);

// Invoices
export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id")
    .references(() => payments.id, { onDelete: "cascade" })
    .notNull(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  items: jsonb("items").notNull(),
  subtotal: integer("subtotal").notNull(),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("paid"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
}, (table) => [
  index("idx_invoices_user_id").on(table.userId),
  index("idx_invoices_project_id").on(table.projectId),
]);

// Analytics events (client-facing)
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  event: varchar("event", { length: 100 }).notNull(),
  value: integer("value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_analytics_project_id").on(table.projectId),
]);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectPhase = typeof projectPhases.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type File = typeof files.$inferSelect;
export type RevisionRequest = typeof revisionRequests.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type OnboardingSubmission = typeof onboardingSubmissions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ProjectComment = typeof projectComments.$inferSelect;
export type SatisfactionSurvey = typeof satisfactionSurveys.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
