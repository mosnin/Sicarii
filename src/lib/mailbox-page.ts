// Cursor pagination for mailbox fan-out lists. Two inboxes and two thousand
// inboxes use the same path: one page (default 200 ids), then the next cron
// or queued list job continues from nextCursor. Never an unbounded collect.

export const FANOUT_PAGE_SIZE = 200;
export const MAX_FANOUT_PAGE_SIZE = 200;

export type IdPage = {
  ids: string[];
  nextCursor: string | null;
  pageSize: number;
};

export function clampFanoutLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return FANOUT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_FANOUT_PAGE_SIZE);
}

export function encodeIdCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export function decodeIdCursor(cursor?: string | null): string | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8").trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Slice a sorted id list into a page. `rows` must already be ordered by id asc
 *  and include at most take+1 items (the extra row signals another page). */
export function pageFromIds(rows: { id: string }[], take: number): IdPage {
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  return {
    ids: page.map((row) => row.id),
    nextCursor: hasMore && last ? encodeIdCursor(last.id) : null,
    pageSize: take,
  };
}

export function emptyIdPage(take = FANOUT_PAGE_SIZE): IdPage {
  return { ids: [], nextCursor: null, pageSize: take };
}
