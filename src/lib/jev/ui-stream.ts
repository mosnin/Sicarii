// UI message stream for Jev fast-path replies. Same SSE shape as
// streamText().toUIMessageStreamResponse() so useChat does not care
// that no language model ran.

import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export function fastPathResponse(text: string): Response {
  const id = "jev-fast";
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
