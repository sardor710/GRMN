import { handlePaymentReturn } from "../../../../server/payments/runtime.ts";

// Task 14B: the browser return from a payment page. It never marks an order paid; it only sends the
// shopper back to the cart, which polls the server status.
export const runtime = "nodejs";
export const GET = handlePaymentReturn;
