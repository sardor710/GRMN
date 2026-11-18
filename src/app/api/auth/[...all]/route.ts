import { handleRuntimeAuth } from "@/server/auth/runtime";

export const runtime = "nodejs";
export const GET = handleRuntimeAuth;
export const POST = handleRuntimeAuth;
