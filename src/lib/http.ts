// Shared fetch with a hard timeout. A hung upstream provider must never pin a
// serverless instance to the platform wall-clock limit (the dominant
// scale-failure mode: one degraded provider exhausts concurrency and cascades
// 504s across the whole app). On timeout the underlying fetch rejects with a
// TimeoutError, which the provider clients' existing throw/catch surfaces as a
// clean failure rather than a 504. Default 30s sits safely under the 60s route
// ceiling while tolerating slow scrape/waterfall calls.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
