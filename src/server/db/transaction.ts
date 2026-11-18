import "server-only";
import type { Database } from "./client.ts";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function withTransaction<T>(database: Database, operation: (transaction: Transaction) => Promise<T>): Promise<T> {
  return database.transaction(operation);
}
