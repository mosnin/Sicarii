import {
  Globe,
  ShoppingCart,
  TrendingUp,
  Bot,
  Server,
  type LucideIcon,
} from "lucide-react";

export type ServiceType =
  | "web_application"
  | "ecommerce_store"
  | "funnels"
  | "ai_automation"
  | "open_claw_deployment";

export interface Service {
  id: ServiceType;
  name: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  startingPrice: string;
}

export const services: Service[] = [
  {
    id: "web_application",
    name: "Web Application",
    description:
      "Custom web applications built to scale. From SaaS platforms to internal tools, we bring your vision to life.",
    icon: Globe,
    features: [
      "Custom UI/UX design",
      "Responsive & mobile-first",
      "Database & API integration",
      "User authentication",
      "Deployment & hosting",
    ],
    startingPrice: "Starting at $2,500",
  },
  {
    id: "ecommerce_store",
    name: "Ecommerce Store",
    description:
      "High-converting online stores with seamless checkout, inventory management, and analytics.",
    icon: ShoppingCart,
    features: [
      "Product catalog setup",
      "Payment processing",
      "Inventory management",
      "Order tracking",
      "SEO optimization",
    ],
    startingPrice: "Starting at $1,800",
  },
  {
    id: "funnels",
    name: "Funnels",
    description:
      "High-performance sales funnels designed to convert visitors into customers at every stage.",
    icon: TrendingUp,
    features: [
      "Landing page design",
      "A/B testing ready",
      "Email capture & sequences",
      "Analytics & tracking",
      "CRM integration",
    ],
    startingPrice: "Starting at $1,200",
  },
  {
    id: "ai_automation",
    name: "AI Automation",
    description:
      "Leverage AI to automate workflows, generate content, and streamline your business operations.",
    icon: Bot,
    features: [
      "Custom AI workflows",
      "Chatbot integration",
      "Content generation",
      "Data processing pipelines",
      "API integrations",
    ],
    startingPrice: "Starting at $3,000",
  },
  {
    id: "open_claw_deployment",
    name: "Open Claw Deployment",
    description:
      "Deploy and manage Open Claw instances with full configuration, monitoring, and support.",
    icon: Server,
    features: [
      "Instance setup & config",
      "Custom deployment pipeline",
      "Monitoring & alerts",
      "Scaling infrastructure",
      "Ongoing support",
    ],
    startingPrice: "Starting at $2,000",
  },
];

export const projectPhaseNames = [
  "Discovery",
  "Design",
  "Development",
  "Testing",
  "Review",
  "Launch",
];
