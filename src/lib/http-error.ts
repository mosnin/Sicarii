// Turn an OpError into an HTTP JSON body. Out-of-credits (402) carries the
// sku and the x402 pay URL so an HTTP agent can buy that call and retry,
// matching the MCP insufficient_credits contract.

import { NextResponse } from "next/server";
import { OpError } from "@/lib/op-error";
import { isX402Configured, resourceUrl } from "@/lib/x402";

export function insufficientCreditsPayload(e: OpError) {
  const sku = typeof e.detail?.sku === "string" ? e.detail.sku : undefined;
  const quantity = typeof e.detail?.quantity === "number" ? e.detail.quantity : 1;
  return {
    error: e.message,
    code: e.code ?? "insufficient_credits",
    sku,
    quantity,
    need: e.detail?.need,
    pay: isX402Configured()
      ? {
          endpoint: resourceUrl("/api/x402/pay"),
          topup: resourceUrl("/api/x402/topup"),
          subscribe: resourceUrl("/api/x402/subscribe"),
          suggested: sku ? { sku, quantity } : undefined,
        }
      : null,
  };
}

export function jsonFromOpError(e: OpError): NextResponse {
  if (e.status === 402) {
    return NextResponse.json(insufficientCreditsPayload(e), { status: 402 });
  }
  return NextResponse.json({ error: e.message }, { status: e.status });
}
