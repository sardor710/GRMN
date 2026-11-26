// Browser client for the session-owned account API (Task 10C). Identity always comes from the
// session cookie; no call accepts an email, phone or user ID as a selector.
import type { CustomerProfileDTO, GeoPrecision, Money, OrderDetailDTO, OrderSummaryDTO, SavedAddressDTO, WishlistItemDTO } from "../contracts/commerce.ts";
import type { Page } from "../contracts/pagination.ts";
import { formatKzt as formatKztAmount } from "./money.ts";
import { kzRegionLabel } from "./kz-regions.ts";
// Sign-in and sign-out in the account page tell the cart to re-sync (and merge a guest cart).
export { announceSessionChange } from "./cart-client.ts";

/** Owner 2026-11-26: test mode (AUTH_TEST_OTP_CODE) = fixed code for every customer and direct signup without SMS. */
export interface AuthMode { testCode: boolean; signUp: boolean; code?: string }
export type PhonePurpose = "sign_in" | "phone_change_current" | "phone_change_new" | "order_claim";
export interface AccountSession { user: { id: string; name: string } | null; staff: boolean }
/** Saved-address form fields. Country is always KZ for new saves; region is a kz-regions code; the pin is optional. */
export interface AddressFields { label: string; recipientName: string; phone: string; countryCode: string; city: string; line1: string; line2?: string; region?: string; postalCode?: string; lat?: number | null; lng?: number | null; geoPrecision?: GeoPrecision | null; isPrimary: boolean }

interface FetchResult { ok: boolean; status: number; json(): Promise<unknown> }
export type AccountFetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; cache?: "no-store" }) => Promise<FetchResult>;

export class AccountRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
    this.code = code;
  }
}

export const ORDER_PAGE_SIZE = 20;
// New addresses are Kazakhstan only (M8); these names still label older saved addresses and orders.
export const COUNTRY_OPTIONS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "KZ", name: "Kazakhstan" }, { code: "UZ", name: "Uzbekistan" }, { code: "KG", name: "Kyrgyzstan" },
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "DE", name: "Germany" },
  { code: "FR", name: "France" }, { code: "CA", name: "Canada" }, { code: "AE", name: "United Arab Emirates" }, { code: "TR", name: "Turkey" },
];
export const countryName = (code: string) => COUNTRY_OPTIONS.find(option => option.code === code)?.name ?? code;

export function formatKzt(money: Money | null | undefined, locale = "en-US"): string {
  return money ? formatKztAmount({ minor: money.amountMinor }, locale) : "—";
}

export function deliveryAddressLines(delivery: OrderDetailDTO["deliveryAddress"]): string[] {
  if (!delivery) return [];
  if (delivery.kind === "legacy_unstructured") return [delivery.raw];
  const value = delivery.address;
  return [value.recipientName, value.line1, value.line2, [value.city, kzRegionLabel(value.region), value.postalCode].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(" "), value.countryCode ? countryName(value.countryCode) : "", value.phone]
    .filter((line): line is string => Boolean(line && line.trim()));
}

function addressBody(fields: AddressFields) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") { const trimmed = value.trim(); if (trimmed) body[key] = trimmed; else if (key === "line2" || key === "region" || key === "postalCode") continue; else body[key] = trimmed; }
    else body[key] = value;
  }
  return body;
}

export function createAccountClient(fetcher: AccountFetcher) {
  async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
    let response: FetchResult;
    try {
      response = await fetcher(url, method === "GET" ? { cache: "no-store" } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}), cache: "no-store" });
    } catch {
      throw new AccountRequestError(0, "NETWORK", "The account service could not be reached. Check your connection and try again.");
    }
    let data: unknown = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      const error = (data as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      throw new AccountRequestError(response.status, typeof error?.code === "string" ? error.code : "REQUEST_FAILED", typeof error?.message === "string" && error.message ? error.message : `The request failed (${response.status}).`);
    }
    return data as T;
  }
  return {
    session: () => call<AccountSession>("/api/auth/get-session"),
    profile: () => call<CustomerProfileDTO>("/api/account/profile"),
    saveProfile: (command: { name: string; email: string; phone: string; birthDate?: string | null; expectedVersion: number }) => call<CustomerProfileDTO>("/api/account/profile", "PUT", command),
    addresses: () => call<Page<SavedAddressDTO>>("/api/account/addresses"),
    saveAddress: (fields: AddressFields, existing?: { id: string; version: number }) => existing
      ? call<SavedAddressDTO>(`/api/account/addresses/${encodeURIComponent(existing.id)}`, "PUT", { ...addressBody(fields), expectedVersion: existing.version })
      : call<SavedAddressDTO>("/api/account/addresses", "POST", addressBody(fields)),
    deleteAddress: (address: { id: string; version: number }) => call<{ id: string; deleted: true }>(`/api/account/addresses/${encodeURIComponent(address.id)}`, "DELETE", { expectedVersion: address.version }),
    orders: (cursor?: string) => call<Page<OrderSummaryDTO>>(`/api/account/orders?limit=${ORDER_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    order: (id: string) => call<OrderDetailDTO>(`/api/account/orders/${encodeURIComponent(id)}`),
    authMode: () => call<AuthMode>("/api/auth/grmn/mode"),
    signUp: (command: { name: string; email: string; phoneNumber: string }) => call<{ state: "authenticated" }>("/api/auth/grmn/signup", "POST", command),
    sendCode: (phoneNumber: string, purpose: PhonePurpose) => call<{ challengeId: string; testCode?: true }>("/api/auth/grmn/phone/send", "POST", { phoneNumber, purpose }),
    verifySignIn: (command: { phoneNumber: string; challengeId: string; code: string }) => call<{ state: "authenticated" | "complete_profile" }>("/api/auth/grmn/phone/verify", "POST", command),
    completeProfile: (command: { name: string; email: string; phoneNumber: string }) => call<unknown>("/api/auth/grmn/phone/complete", "POST", command),
    changePhone: (command: { phoneNumber: string; currentChallengeId: string; currentCode: string; challengeId: string; code: string; expectedVersion: number }) => call<{ phone: string; version: number; signedOut: true }>("/api/account/phone", "POST", command),
    claimOrder: (command: { orderId: string; receiptToken: string; challengeId: string; code: string }) => call<unknown>("/api/account/claims", "POST", command),
    changeStaffPassword: (command: { currentPassword: string; newPassword: string }) => call<{ success: true; mfaRequired: true }>("/api/auth/change-password", "POST", { ...command, revokeOtherSessions: true }),
    signOut: () => call<{ success: true }>("/api/auth/sign-out", "POST", {}),
    wishlist: () => call<{ items: WishlistItemDTO[] }>("/api/account/wishlist"),
    removeFromWishlist: (productKey: string) => call<{ items: WishlistItemDTO[] }>(`/api/account/wishlist/${encodeURIComponent(productKey)}`, "DELETE", {}),
  };
}
export type AccountClient = ReturnType<typeof createAccountClient>;
