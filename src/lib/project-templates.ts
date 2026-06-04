import type { ServiceType } from "./services";

export interface ProjectTemplate {
  serviceType: ServiceType;
  name: string;
  description: string;
  suggestedFields: {
    businessName: string;
    industry: string;
    description: string;
    targetAudience: string;
    timeline: string;
    budget: string;
    features: string[];
  };
}

export const projectTemplates: ProjectTemplate[] = [
  {
    serviceType: "web_application",
    name: "SaaS Platform",
    description: "Multi-tenant SaaS app with user auth, dashboards, and billing",
    suggestedFields: {
      businessName: "",
      industry: "Technology / SaaS",
      description: "A cloud-based SaaS platform with user authentication, role-based access, dashboards with analytics, and subscription billing via Stripe.",
      targetAudience: "Small to medium businesses looking for [your niche] solutions",
      timeline: "4-6 weeks",
      budget: "$3,000 - $5,000",
      features: ["User authentication", "Dashboard", "Analytics", "Billing", "Admin panel", "API"],
    },
  },
  {
    serviceType: "web_application",
    name: "Marketplace Platform",
    description: "Two-sided marketplace with listings, search, and payments",
    suggestedFields: {
      businessName: "",
      industry: "Marketplace",
      description: "A two-sided marketplace platform where sellers can list products/services and buyers can browse, search, filter, and purchase. Includes seller dashboards, order management, and payment processing.",
      targetAudience: "Buyers and sellers in [your niche] market",
      timeline: "6-8 weeks",
      budget: "$4,000 - $7,000",
      features: ["Listings", "Search & filter", "User profiles", "Payments", "Reviews", "Messaging"],
    },
  },
  {
    serviceType: "ecommerce_store",
    name: "Fashion / Apparel Store",
    description: "Online clothing store with size guides, filters, and checkout",
    suggestedFields: {
      businessName: "",
      industry: "Fashion / Retail",
      description: "An online fashion store with product catalog, size guides, color variants, filtering by category/size/price, cart management, and secure checkout with order tracking.",
      targetAudience: "Fashion-conscious consumers aged 18-45",
      timeline: "3-5 weeks",
      budget: "$2,000 - $3,500",
      features: ["Product catalog", "Size guides", "Filters", "Cart", "Checkout", "Order tracking"],
    },
  },
  {
    serviceType: "ecommerce_store",
    name: "Digital Products Store",
    description: "Sell digital downloads with instant delivery",
    suggestedFields: {
      businessName: "",
      industry: "Digital Products",
      description: "A digital storefront for selling downloadable products (ebooks, templates, courses, software). Includes instant delivery, license key management, and customer download portal.",
      targetAudience: "Creators and professionals looking for digital tools",
      timeline: "2-4 weeks",
      budget: "$1,800 - $3,000",
      features: ["Digital downloads", "Instant delivery", "License keys", "Customer portal", "Payment processing"],
    },
  },
  {
    serviceType: "funnels",
    name: "Lead Generation Funnel",
    description: "Capture leads with a multi-step form and email sequences",
    suggestedFields: {
      businessName: "",
      industry: "Marketing / B2B",
      description: "A high-converting lead generation funnel with a landing page, multi-step qualification form, lead magnet delivery, and automated email follow-up sequences.",
      targetAudience: "Business owners and decision makers in [your niche]",
      timeline: "2-3 weeks",
      budget: "$1,200 - $2,000",
      features: ["Landing page", "Multi-step form", "Lead magnet", "Email sequences", "CRM integration", "Analytics"],
    },
  },
  {
    serviceType: "funnels",
    name: "Webinar Registration Funnel",
    description: "Drive webinar signups with countdown and reminders",
    suggestedFields: {
      businessName: "",
      industry: "Education / Coaching",
      description: "A webinar registration funnel with a compelling landing page, countdown timer, registration form, confirmation page, and automated reminder email sequences.",
      targetAudience: "Professionals interested in [your webinar topic]",
      timeline: "1-2 weeks",
      budget: "$1,200 - $1,800",
      features: ["Landing page", "Countdown timer", "Registration form", "Confirmation page", "Email reminders"],
    },
  },
  {
    serviceType: "ai_automation",
    name: "Customer Support Bot",
    description: "AI chatbot for handling customer inquiries 24/7",
    suggestedFields: {
      businessName: "",
      industry: "Customer Service",
      description: "An AI-powered customer support chatbot that handles common inquiries, routes complex issues to human agents, and learns from past interactions to improve over time.",
      targetAudience: "Existing customers needing support",
      timeline: "3-5 weeks",
      budget: "$3,000 - $5,000",
      features: ["AI chatbot", "Knowledge base", "Human handoff", "Ticket creation", "Analytics", "Multi-channel"],
    },
  },
  {
    serviceType: "ai_automation",
    name: "Content Generation Pipeline",
    description: "Automate content creation with AI workflows",
    suggestedFields: {
      businessName: "",
      industry: "Content / Marketing",
      description: "An AI-powered content generation pipeline that creates blog posts, social media content, and marketing copy. Includes content calendar, approval workflow, and multi-platform publishing.",
      targetAudience: "Marketing teams and content creators",
      timeline: "4-6 weeks",
      budget: "$3,500 - $5,500",
      features: ["AI content generation", "Content calendar", "Approval workflow", "Multi-platform publishing", "SEO optimization"],
    },
  },
  {
    serviceType: "open_claw_deployment",
    name: "Standard Deployment",
    description: "Basic Open Claw setup with monitoring",
    suggestedFields: {
      businessName: "",
      industry: "Technology / Infrastructure",
      description: "Standard Open Claw deployment with custom configuration, basic monitoring, health checks, and alerting. Includes initial setup, documentation, and 30-day support.",
      targetAudience: "Development teams needing Open Claw infrastructure",
      timeline: "2-3 weeks",
      budget: "$2,000 - $3,000",
      features: ["Instance setup", "Configuration", "Monitoring", "Health checks", "Alerting", "Documentation"],
    },
  },
];

export function getTemplatesForService(serviceType: ServiceType): ProjectTemplate[] {
  return projectTemplates.filter((t) => t.serviceType === serviceType);
}
