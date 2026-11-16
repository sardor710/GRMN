/** A denied or failed collection is unknown, never an empty business result. */
export async function readDashboardCollection<T>(response: Response, resource: string): Promise<T[]> {
  if (response.status === 403) {
    throw new Error("Some dashboard data is restricted for your account. Open the sections available in the navigation.");
  }
  if (!response.ok) throw new Error("Dashboard data is currently unavailable. Retry when access is restored.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !(resource in body)) {
    throw new Error("Dashboard data is currently unavailable.");
  }
  const collection = (body as Record<string, unknown>)[resource];
  if (!Array.isArray(collection)) throw new Error("Dashboard data is currently unavailable.");
  if ((body as Record<string,unknown>).nextCursor != null) throw new Error("Full-store reporting is unavailable for a partial collection. Open the individual sections.");
  return collection as T[];
}
