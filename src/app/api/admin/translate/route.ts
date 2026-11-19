import { handleTranslateRequest } from "../../../../server/i18n/translate-runtime.ts";

export const runtime = "nodejs";
// A whole garmin.com overview in two languages takes a while on a free model.
export const maxDuration = 300;
export async function POST(request: Request) {
  return handleTranslateRequest(request);
}
