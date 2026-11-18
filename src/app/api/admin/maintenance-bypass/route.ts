import { handleMaintenanceBypass } from "../../../../server/operations/maintenance-runtime.ts";

// Task 23 G1: staff take (POST) or drop (DELETE) the signed maintenance bypass while the store is frozen.
export const runtime = "nodejs";
export async function POST(request: Request) { return handleMaintenanceBypass(request); }
export async function DELETE(request: Request) { return handleMaintenanceBypass(request); }
