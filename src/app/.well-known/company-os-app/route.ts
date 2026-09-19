import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Scalar",
    kind: "company-os",
    overview: "/api/company-os/overview",
    wardenPacks: ["pii-review", "quote-accuracy", "crm-schema", "outbound-tone", "permission-scope"],
    decisions: "/api/jev/decide",
    evaluate: "/api/jev/evaluate",
  });
}
