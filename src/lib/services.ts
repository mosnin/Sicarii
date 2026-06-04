import {
  Radar,
  Sparkles,
  Bot,
  Plug,
  BookOpen,
  Mails,
  type LucideIcon,
} from "lucide-react";

export interface Service {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  /** Short capability tag (rendered as a badge on marketing pages). */
  startingPrice: string;
}

// Sicarii's capabilities — the things the agents do. Doubles as marketing copy.
export const services: Service[] = [
  {
    id: "discover",
    name: "Discover",
    description:
      "Find the right contacts with built-in tools — enrich by domain, pull leads from a company name, extract emails from a list of sites — and save them straight into your CRM.",
    icon: Radar,
    features: [
      "Enrich companies from a domain",
      "Find emails from a name + company",
      "Extract email, phone & socials from URLs",
      "One click to save into the CRM",
    ],
    startingPrice: "Built in",
  },
  {
    id: "enrich",
    name: "Enrich",
    description:
      "Every contact stays current. Agents fill the gaps — title, company, socials, context — so your database is alive instead of rotting the moment you stop typing.",
    icon: Sparkles,
    features: [
      "Automatic field completion",
      "Provider-shaped enrichment data",
      "Re-enrich on demand",
      "Owned data — it never leaves Sicarii",
    ],
    startingPrice: "Always on",
  },
  {
    id: "agent",
    name: "The built-in agent",
    description:
      "Chat with an agent that actually has hands. It pulls lists, enriches records, and reads and writes the same CRM you do — it operates, it doesn't just summarize.",
    icon: Bot,
    features: [
      "Pull and enrich lists by chat",
      "Read + write access to your data",
      "Acts with full product context",
      "Visible, trustworthy actions",
    ],
    startingPrice: "Core",
  },
  {
    id: "connect",
    name: "Bring your own agent",
    description:
      "Open by connection. Plug OpenClaw, Hermes, or Claude Cowork into the same data over MCP tools and skills. The CRM is the substrate; agents are interchangeable.",
    icon: Plug,
    features: [
      "MCP tools over your CRM",
      "Skills for connected agents",
      "OpenClaw / Hermes / Claude Cowork",
      "One source of truth",
    ],
    startingPrice: "MCP",
  },
  {
    id: "product-context",
    name: "Product context",
    description:
      "A comprehensive, structured store of what you're selling — readable by every agent, so outreach is informed instead of generic spray.",
    icon: BookOpen,
    features: [
      "Agent-consumable knowledge base",
      "Shared by internal & connected agents",
      "Sell with real understanding",
      "Versioned and owned",
    ],
    startingPrice: "Included",
  },
  {
    id: "email",
    name: "Living memory",
    description:
      "Connect your AgentMail account and every exchange lands on the contact's record — saved as context the agent reuses, so each relationship compounds.",
    icon: Mails,
    features: [
      "AgentMail-powered threads",
      "Saved as reusable context",
      "Per-contact conversation history",
      "Relationships that compound",
    ],
    startingPrice: "Connect a key",
  },
];
