import type { CheckoutCommand, Money, QuickCheckoutContact } from "../../src/contracts/commerce.ts";
import type { CommerceServices } from "../../src/server/service-contracts.ts";

const kzt: Money = { amountMinor: "120000", currency: "KZT" };
const quick: QuickCheckoutContact = { name: "Synthetic buyer", phone: "+77000000000" };
// @ts-expect-error USD display is not a payable ledger currency.
const invalidMoney: Money = { amountMinor: "1200", currency: "USD" };
// @ts-expect-error A quick checkout requires a customer name.
const missingName: QuickCheckoutContact = { phone: "+77000000000" };
// @ts-expect-error A quick checkout requires a delivery selection, not only a quote.
const missingDelivery: CheckoutCommand = { quoteId: "quote", cartVersion: 1, contact: quick, paymentMethod: "demo" };

// Kept in the root typecheck; these assignments must never become valid silently.
export type LockedServiceSignatures = Pick<CommerceServices, "createCheckout" | "getOwnOrders" | "quoteCart">;
export const contractExamples = { kzt, quick, invalidMoney, missingName, missingDelivery };
