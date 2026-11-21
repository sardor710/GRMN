import { handleGeocodeRequest } from "../../../../server/geo/runtime.ts";

// Kazakhstan-only address search for the address form (forward text and reverse pin).
// The Yandex geocoder key stays on the server.
export const runtime = "nodejs";
export const POST = handleGeocodeRequest;
