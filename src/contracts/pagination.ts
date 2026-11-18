export interface PageInput {
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type PageScope = "catalog" | "account" | "admin";

export function normalizePageInput(input: PageInput, scope: PageScope): PageInput & { limit: number } {
  const limit = input.limit ?? (scope === "catalog" ? 24 : 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Page limit must be an integer between 1 and 100");
  }
  if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length < 1 || input.cursor.length > 2048)) {
    throw new RangeError("Page cursor must contain between 1 and 2048 characters");
  }
  return input.cursor === undefined ? { limit } : { limit, cursor: input.cursor };
}
