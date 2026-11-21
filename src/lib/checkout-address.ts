// Checkout delivery step (M8.5): pure rules shared by CheckoutPanel and its tests. Delivery is
// Kazakhstan only. A signed-in customer picks a saved address (sent as {kind:"saved"}) or types a
// new one with AddressForm (sent as {kind:"inline"}); a guest always types one.
import type { DeliveryAddressSelection, SavedAddressDTO } from "../contracts/commerce.ts";
import { findKzCityAnywhere, resolveKzRegion } from "./kz-regions.ts";

export const CHECKOUT_COUNTRY = "KZ";
export const NEW_ADDRESS = "new";
export const E164_PHONE = /^[+][1-9][0-9]{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CheckoutContact { name: string; phone: string; email: string }
/** The typed address (an AddressForm value; extra fields are ignored). */
export interface CheckoutAddressInput { region?: string; city: string; line1: string; line2?: string; postalCode?: string }
/** A saved address id, or NEW_ADDRESS for the typed one. */
export type DeliveryChoice = string;

/** Phone as the server expects it: spaces, dashes, dots and brackets are dropped ("+7 701 123-45-67" → "+77011234567"). */
export const normalizePhone = (value: string) => value.replace(/[\s().-]/g, "");

/** Only Kazakhstan addresses can be chosen; older saved addresses elsewhere must be edited in the account first. */
export const isDeliverable = (address: Pick<SavedAddressDTO, "countryCode">) => address.countryCode.trim().toUpperCase() === CHECKOUT_COUNTRY;

/** The preselected choice: the primary address if it ships, else the first one that ships, else a new address. */
export function defaultDeliveryChoice(addresses: readonly SavedAddressDTO[]): DeliveryChoice {
  const deliverable = addresses.filter(isDeliverable);
  return (deliverable.find(address => address.isPrimary) ?? deliverable[0])?.id ?? NEW_ADDRESS;
}

/** The kz-regions code of a typed address: its region, else the region of a listed city. */
export function checkoutRegionCode(address: CheckoutAddressInput): string {
  const region = address.region?.trim() ?? "";
  if (region) return resolveKzRegion(region)?.code ?? "";
  return findKzCityAnywhere(address.city)?.region.code ?? "";
}

const chosenSaved = (choice: DeliveryChoice, addresses: readonly SavedAddressDTO[]) => choice === NEW_ADDRESS ? undefined : addresses.find(address => address.id === choice);

/** Problems that keep the delivery step from being reviewed, in form order (empty when it is complete). */
export function checkoutProblems(contact: CheckoutContact, choice: DeliveryChoice, addresses: readonly SavedAddressDTO[], address: CheckoutAddressInput): string[] {
  const problems: string[] = [];
  const email = contact.email.trim();
  if (choice !== NEW_ADDRESS) {
    const saved = chosenSaved(choice, addresses);
    if (!saved) problems.push("Choose a delivery address");
    else if (!isDeliverable(saved)) problems.push("This saved address is outside Kazakhstan. Edit it in your account to ship in Kazakhstan, or add a new address");
  } else {
    if (!contact.name.trim()) problems.push("Enter the recipient's full name");
    const phone = normalizePhone(contact.phone);
    if (!phone) problems.push("Enter a phone number");
    else if (!E164_PHONE.test(phone)) problems.push("Enter the phone in international format, e.g. +77011234567");
    if (!checkoutRegionCode(address)) problems.push(address.region?.trim() ? "Choose a region of Kazakhstan from the list" : "Choose a region");
    if (!address.city.trim()) problems.push("Enter the city or settlement");
    if (!address.line1.trim()) problems.push("Enter the street and house");
  }
  if (email && !EMAIL.test(email)) problems.push("Enter a valid email or leave it empty");
  return problems;
}

/** The delivery part of POST /api/cart/quote. Call only when checkoutProblems() is empty. */
export function deliveryPayload(contact: CheckoutContact, choice: DeliveryChoice, addresses: readonly SavedAddressDTO[], address: CheckoutAddressInput): DeliveryAddressSelection {
  const saved = chosenSaved(choice, addresses);
  if (saved) return { kind: "saved", addressId: saved.id, version: saved.version };
  const line2 = address.line2?.trim() ?? "", postalCode = address.postalCode?.trim() ?? "", region = checkoutRegionCode(address);
  return {
    kind: "inline",
    address: {
      recipientName: contact.name.trim(), phone: normalizePhone(contact.phone), countryCode: CHECKOUT_COUNTRY,
      ...(region ? { region } : {}), city: address.city.trim(), line1: address.line1.trim(),
      ...(line2 ? { line2 } : {}), ...(postalCode ? { postalCode } : {}),
    },
  };
}
