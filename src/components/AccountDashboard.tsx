"use client";

// Session-owned customer account (Task 10C). Every record shown here comes from /api/account/*
// for the signed-in session; nothing is seeded, selected by email or faked on failure.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { OrderTracker } from "@/components/account/OrderTracker";
import { Check, Plus, Trash2, Edit3, X, AlertCircle, Lock, KeyRound, ChevronRight, ChevronLeft, Phone, Loader2, Watch, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { AccountIcon } from "@/components/icons";
import { DemoDot } from "@/components/DemoDot";
import { Link } from "@/i18n/navigation";
import { productPath } from "@/lib/catalog/product-url";
import { INTL_LOCALE } from "@/i18n/config";
import { formatDate as formatLocaleDate } from "@/i18n/format";
import { useAppLocale } from "@/i18n/useAppLocale";
import type { CustomerGender, CustomerProfileDTO, DeviceDTO, OrderDetailDTO, OrderStage, OrderSummaryDTO, SavedAddressDTO, WishlistItemDTO } from "@/contracts/commerce";
import { pickupMapUrl, pickupText } from "@/lib/pickup";
import { AddressForm } from "@/components/address/AddressForm";
import { findKzCityAnywhere, kzRegionLabel } from "@/lib/kz-regions";
import {
  AccountRequestError,
  countryName,
  createAccountClient,
  deliveryAddressLines,
  formatKzt,
  announceSessionChange,
  type AccountFetcher,
  type AuthMode,
  type AddressFields,
} from "@/lib/account-client";

/** Tab ids; labels are `AccountPortal.tabs.<id>` messages. */
const TABS = ["Profile", "Orders", "Wishlist", "Devices", "Subscriptions"] as const;
type Tab = (typeof TABS)[number];
type Phase = "loading" | "signed_out" | "unavailable" | "error" | "ready";
const MAX_ADDRESSES = 5;
const EMPTY_ADDRESS: AddressFields = { label: "", recipientName: "", phone: "", countryCode: "KZ", city: "", line1: "", line2: "", region: "", postalCode: "", lat: null, lng: null, geoPrecision: null, isPrimary: false };
const EMPTY_PROFILE_FORM = { name: "", email: "", birthDate: "", gender: "" as CustomerGender | "" };
const GENDERS: readonly CustomerGender[] = ["male", "female", "unspecified"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 0033 (owner 2026-11-26, design pass): one small dot per stage; candy blue stays reserved for "no payment taken".
const STATUS_DOT: Record<OrderStage, string> = { ordered: "bg-garmin-checkbox", packed: "bg-garmin-badge-gold", shipped: "bg-garmin-blue", delivered: "bg-emerald-600", cancelled: "bg-garmin-badge-red" };
const ORDER_COLUMNS = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_64px_minmax(0,1fr)_20px] items-center gap-4";
const DAY = 86400000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const todayISO = () => new Date().toISOString().slice(0, 10);
const yearsAgoISO = (years: number) => { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - years); return date.toISOString().slice(0, 10); };
const formatBirthday = (iso: string, locale: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const pinOf = (address: SavedAddressDTO) => ({ lat: address.lat ?? null, lng: address.lng ?? null, geoPrecision: address.geoPrecision ?? null });
/** Demo and sandbox orders took no payment; customers see a candy-blue dot and the neutral line, never "demo". */
const isNoPayment = (mode: string) => mode === "demo" || mode === "sandbox";

/** Stands in for "no server message"; shown as the localized generic error (see `shown`). */
const GENERIC_ERROR = "\u0000generic";
const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : GENERIC_ERROR;
const statusOf = (error: unknown) => error instanceof AccountRequestError ? error.status : -1;
const cleanPhone = (value: string) => value.replace(/[\s()-]/g, "");
const E164 = /^[+][1-9][0-9]{7,14}$/;
// garmin.com form and button primitives (Forms.spec.md, Buttons.spec.md; Task 5a.2 .g-* classes).
const inputClass = "g-input disabled:bg-muted";
const labelClass = "g-label text-black";
const primaryButton = "g-btn g-btn--black";
const secondaryButton = "g-btn g-btn--secondary";
const linkButton = "inline-flex items-center gap-1.5 text-[14px] font-medium text-garmin-blue hover:text-garmin-blue-hover hover:underline disabled:cursor-not-allowed disabled:opacity-50";

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border border-garmin-control bg-white p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-garmin-control pb-4">
        <h2 className="g-heading g-h4 m-0 text-black">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function renderError(message: string | null, shown: (text: string) => string) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      <span>{shown(message)}</span>
    </p>
  );
}

export function AccountDashboard() {
  const t = useTranslations("AccountPortal");
  const locale = useAppLocale();
  const intlLocale = INTL_LOCALE[locale];
  const shown = (text: string) => (text === GENERIC_ERROR ? t("genericError") : text);
  const showError = (message: string | null) => renderError(message, shown);
  const formatDate = (iso: string) => formatLocaleDate(iso, locale, "short");
  const formatKztLocal = (value: Parameters<typeof formatKzt>[0]) => formatKzt(value, intlLocale);
  const regionName = (code: string) => {
    try { return new Intl.DisplayNames([intlLocale], { type: "region" }).of(code) ?? countryName(code); } catch { return countryName(code); }
  };
  /** Order/payment status values are API enums; known ones have a message, others show as sent. */
  const statusLabel = (value: string) => (t.has(`status.${value}`) ? t(`status.${value}`) : value);
  // Owner 2026-11-25: the order tracker and translated order updates (event type a.b → key events.a_b).
  const trackerLabels = { ordered: t("tracker.ordered"), packed: t("tracker.packed"), shipped: t("tracker.shipped"), delivered: t("tracker.delivered"), cancelled: t("tracker.cancelled"), cancelledNote: t("tracker.cancelledNote"), progress: t("tracker.progress") };
  const eventLabel = (event: { type: string; label: string }) => { const key = `events.${event.type.replace(/\./g, "_")}`; return t.has(key) ? t(key) : event.label; };
  const client = useMemo(() => { const fetcher: AccountFetcher = (url, init) => fetch(url, init); return createAccountClient(fetcher); }, []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Profile");
  const [isStaff, setIsStaff] = useState(false);
  const [profile, setProfile] = useState<CustomerProfileDTO | null>(null);
  const [addresses, setAddresses] = useState<SavedAddressDTO[]>([]);
  const [orders, setOrders] = useState<OrderSummaryDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Sign in (phone possession)
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [signInPhone, setSignInPhone] = useState("");
  const [signInChallenge, setSignInChallenge] = useState<string | null>(null);
  const [signInCode, setSignInCode] = useState("");
  const [needsCompletion, setNeedsCompletion] = useState(false);
  const [completion, setCompletion] = useState({ name: "", email: "" });
  const [signInError, setSignInError] = useState<string | null>(null);
  // Owner 2026-11-26: Sign in | Sign up; the Sign up tab opens the one-page sign-up (/account/sign-up). The fixed code
  // (while SMS is not connected) is reported by the server at runtime.
  const [authMode, setAuthMode] = useState<AuthMode>({ testCode: false, signUp: false });

  // Profile
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE_FORM);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Addresses
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddressDTO | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFields>(EMPTY_ADDRESS);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Orders
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetailDTO | null>(null);
  const [orderDetailError, setOrderDetailError] = useState<string | null>(null);

  // Wishlist (Task 13A): loaded from the session-owned API when the tab opens.
  const [wishlist, setWishlist] = useState<WishlistItemDTO[] | null>(null);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const loadWishlist = async () => {
    setWishlistError(null);
    try { setWishlist((await client.wishlist()).items); } catch (error) { setWishlistError(errorMessage(error)); }
  };
  const removeFromWishlist = async (productKey: string) => {
    setWishlistError(null);
    try { setWishlist((await client.removeFromWishlist(productKey)).items); } catch (error) { setWishlistError(errorMessage(error)); }
  };

  // 0033 (owner 2026-11-26): My devices, loaded when the tab opens.
  const [devices, setDevices] = useState<DeviceDTO[] | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const loadDevices = async () => {
    setDevicesError(null);
    try { setDevices((await client.devices()).items); } catch (error) { setDevicesError(errorMessage(error)); }
  };

  // Legacy order claim
  const [claim, setClaim] = useState({ orderId: "", receipt: "", code: "" });
  const [claimChallenge, setClaimChallenge] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Credentials: phone change (customers) or password change (staff)
  const [isPhoneChangeOpen, setIsPhoneChangeOpen] = useState(false);
  const [phoneChange, setPhoneChange] = useState({ newPhone: "", currentCode: "", newCode: "" });
  const [phoneChallenges, setPhoneChallenges] = useState<{ current: string; next: string } | null>(null);
  const [phoneChangeError, setPhoneChangeError] = useState<string | null>(null);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const signedOut = useCallback((notice: string | null) => {
    setProfile(null); setAddresses([]); setOrders([]); setNextCursor(null); setIsStaff(false);
    setSelectedOrderId(null); setOrderDetail(null); setIsPhoneChangeOpen(false); setPhoneChallenges(null);
    setSignInChallenge(null); setSignInCode(""); setNeedsCompletion(false); setCompletion({ name: "", email: "" }); setSignInError(null);
    // Nothing typed by this person may survive for the next person on the device.
    setTab("Profile"); setBusy(null); setStatusMessage(null);
    setIsEditingProfile(false); setProfileForm(EMPTY_PROFILE_FORM); setProfileError(null);
    setIsAddressModalOpen(false); setEditingAddress(null); setAddressForm(EMPTY_ADDRESS); setAddressError(null);
    setOrdersError(null); setOrderDetailError(null); setWishlist(null); setWishlistError(null); setDevices(null); setDevicesError(null);
    setClaim({ orderId: "", receipt: "", code: "" }); setClaimChallenge(null); setClaimError(null);
    setPhoneChange({ newPhone: "", currentCode: "", newCode: "" }); setPhoneChangeError(null);
    setIsPasswordChangeOpen(false); setPasswordForm({ currentPassword: "", newPassword: "" }); setPasswordError(null);
    // The next person on this device must not land on the previous person's order link.
    if (typeof window !== "undefined" && window.location?.search) window.history?.replaceState(null, "", window.location.pathname);
    setSignInNotice(notice); setPhase("signed_out");
  }, []);

  // Loads the whole account for the session. Any failure shows an error state; nothing partial
  // is rendered and no mutation is offered until a full load succeeds.
  const load = useCallback(async () => {
    try {
      const session = await client.session();
      if (!session.user) { signedOut(null); client.authMode().then(setAuthMode, () => {}); return; }
      const [nextProfile, addressPage, orderPage] = await Promise.all([client.profile(), client.addresses(), client.orders()]);
      setIsStaff(Boolean(session.staff));
      setProfile(nextProfile); setAddresses(addressPage.items); setOrders(orderPage.items); setNextCursor(orderPage.nextCursor);
      setLoadError(null); setPhase("ready");
    } catch (error) {
      const status = statusOf(error);
      if (status === 401) { signedOut(null); return; }
      setLoadError(errorMessage(error));
      setPhase(status === 503 ? "unavailable" : "error");
    }
  }, [client, signedOut]);

  useEffect(() => { void load(); }, [load]);

  const retry = async () => { setPhase("loading"); await load(); };

  const reloadAddresses = async () => { const page = await client.addresses(); setAddresses(page.items); return page.items; };
  // After a write has succeeded, a failed list refresh must not look like a failed write.
  const refreshAfterWrite = async (success: string) => {
    try { await reloadAddresses(); showNotification(success); }
    catch { showNotification(t("notify.refreshFailed", { success }), "error"); }
  };
  const reloadOrders = async () => { const page = await client.orders(); setOrders(page.items); setNextCursor(page.nextCursor); };

  // ---------------------------------------------------------------- sign in / sign out
  const handleSendSignInCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null); setBusy("sign-in");
    try {
      const result = await client.sendCode(cleanPhone(signInPhone), "sign_in");
      setSignInChallenge(result.challengeId); setSignInCode("");
    } catch (error) { setSignInError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  const handleVerifySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInChallenge) return;
    setSignInError(null); setBusy("sign-in");
    try {
      const result = await client.verifySignIn({ phoneNumber: cleanPhone(signInPhone), challengeId: signInChallenge, code: signInCode.trim() });
      if (result.state === "complete_profile") { setNeedsCompletion(true); return; }
      announceSessionChange(); setSignInNotice(null); setPhase("loading"); await load();
    } catch (error) { setSignInError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null); setBusy("sign-in");
    try {
      await client.completeProfile({ name: completion.name.trim(), email: completion.email.trim(), phoneNumber: cleanPhone(signInPhone) });
      announceSessionChange(); setNeedsCompletion(false); setSignInNotice(null); setPhase("loading"); await load();
    } catch (error) { setSignInError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  const handleSignOut = async () => {
    setBusy("sign-out");
    try { await client.signOut(); announceSessionChange(); signedOut(t("notify.signedOut")); }
    catch (error) { showNotification(errorMessage(error), "error"); }
    finally { setBusy(null); }
  };

  // ---------------------------------------------------------------- profile
  const handleStartEditProfile = () => {
    if (!profile) return;
    setProfileForm({ name: profile.name, email: profile.email ?? "", birthDate: profile.birthDate ?? "", gender: profile.gender ?? "" });
    setProfileError(null); setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!profile.phone || !profile.phoneVerified) { setProfileError(t("notify.verifyPhoneFirst")); return; }
    if (!profileForm.name.trim() || !profileForm.email.trim()) { setProfileError(t("notify.nameEmailRequired")); return; }
    if (!EMAIL.test(profileForm.email.trim())) { setProfileError(t("notify.emailInvalid")); return; }
    const birthDate = profileForm.birthDate.trim();
    if (birthDate && (birthDate > todayISO() || birthDate > yearsAgoISO(10) || birthDate < yearsAgoISO(120))) { setProfileError(t("notify.birthDateRange")); return; }
    setProfileError(null); setBusy("profile");
    try {
      const saved = await client.saveProfile({ name: profileForm.name.trim(), email: profileForm.email.trim(), phone: profile.phone, birthDate: birthDate || null, gender: profileForm.gender || null, expectedVersion: profile.version });
      setProfile(saved); setIsEditingProfile(false);
      showNotification(saved.emailVerified ? t("notify.profileSaved") : t("notify.profileSavedUnverified"));
    } catch (error) {
      setProfileError(errorMessage(error));
      if (statusOf(error) === 409) { try { setProfile(await client.profile()); } catch { /* keep the error visible */ } }
    } finally { setBusy(null); }
  };

  // ---------------------------------------------------------------- addresses
  const handleOpenAddAddress = () => {
    if (!profile || addresses.length >= MAX_ADDRESSES) return;
    setEditingAddress(null);
    setAddressForm({ ...EMPTY_ADDRESS, recipientName: profile.name, phone: profile.phone ?? "", isPrimary: addresses.length === 0 });
    setAddressError(null); setIsAddressModalOpen(true);
  };

  const handleOpenEditAddress = (address: SavedAddressDTO) => {
    setEditingAddress(address);
    // Saving always stores Kazakhstan; an older non-KZ address is shown with a note and moves on save.
    setAddressForm({ label: address.label, recipientName: address.recipientName, phone: address.phone, countryCode: "KZ", city: address.city, line1: address.line1, line2: address.line2 ?? "", region: address.region ?? "", postalCode: address.postalCode ?? "", ...pinOf(address), isPrimary: address.isPrimary });
    setAddressError(null); setIsAddressModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressForm.label.trim() || !addressForm.recipientName.trim() || !addressForm.line1.trim() || !addressForm.city.trim() || !addressForm.phone.trim() || !(addressForm.region?.trim() || findKzCityAnywhere(addressForm.city))) {
      setAddressError(t("notify.addressRequired")); return;
    }
    setAddressError(null); setBusy("address");
    try {
      await client.saveAddress({ ...addressForm, countryCode: "KZ", phone: cleanPhone(addressForm.phone) }, editingAddress ? { id: editingAddress.id, version: editingAddress.version } : undefined);
    } catch (error) {
      setAddressError(errorMessage(error));
      if (statusOf(error) === 409) {
        try {
          // Resubmitting needs the fresh version; a deleted address closes the editor.
          const items = await reloadAddresses();
          if (editingAddress) { const fresh = items.find(item => item.id === editingAddress.id); if (fresh) setEditingAddress(fresh); else setIsAddressModalOpen(false); }
        } catch { /* keep the error visible */ }
      }
      setBusy(null);
      return;
    }
    setIsAddressModalOpen(false);
    await refreshAfterWrite(editingAddress ? t("notify.addressUpdated") : t("notify.addressSaved"));
    setBusy(null);
  };

  const handleDeleteAddress = async (address: SavedAddressDTO) => {
    if (!confirm(t("notify.confirmRemove", { label: address.label }))) return;
    setBusy("address");
    try { await client.deleteAddress(address); }
    catch (error) { showNotification(errorMessage(error), "error"); try { await reloadAddresses(); } catch { /* keep the error visible */ } setBusy(null); return; }
    await refreshAfterWrite(t("notify.addressRemoved", { label: address.label }));
    setBusy(null);
  };

  const handleSetPrimary = async (address: SavedAddressDTO) => {
    if (address.isPrimary) return;
    setBusy("address");
    try {
      await client.saveAddress({ label: address.label, recipientName: address.recipientName, phone: address.phone, countryCode: address.countryCode, city: address.city, line1: address.line1, line2: address.line2, region: address.region, postalCode: address.postalCode, ...pinOf(address), isPrimary: true }, address);
    } catch (error) { showNotification(errorMessage(error), "error"); try { await reloadAddresses(); } catch { /* keep the error visible */ } setBusy(null); return; }
    await refreshAfterWrite(t("notify.primarySet", { label: address.label }));
    setBusy(null);
  };

  // ---------------------------------------------------------------- orders
  const handleLoadMoreOrders = async () => {
    if (!nextCursor) return;
    setOrdersError(null); setBusy("orders");
    try { const page = await client.orders(nextCursor); setOrders(current => [...current, ...page.items]); setNextCursor(page.nextCursor); }
    catch (error) { setOrdersError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  // Only the latest opened order may fill the page (a slower earlier response is dropped).
  const openedOrder = useRef<string | null>(null);
  const loadOrder = useCallback(async (id: string) => {
    openedOrder.current = id;
    setSelectedOrderId(id); setOrderDetail(null); setOrderDetailError(null);
    try { const detail = await client.order(id); if (openedOrder.current === id) setOrderDetail(detail); }
    catch (error) { if (openedOrder.current === id) setOrderDetailError(errorMessage(error)); }
  }, [client]);
  // 0033: an opened order has its own address (/account?order=<id>), so Back and refresh work.
  const handleOpenOrder = async (id: string) => {
    setTab("Orders");
    if (typeof window !== "undefined") window.history.pushState(null, "", `?order=${encodeURIComponent(id)}`);
    if (typeof window !== "undefined") window.scrollTo?.({ top: 0 });
    await loadOrder(id);
  };
  const closeOrder = () => {
    if (typeof window !== "undefined" && window.location?.search) window.history?.pushState(null, "", window.location.pathname);
    openedOrder.current = null;
    setSelectedOrderId(null); setOrderDetail(null); setOrderDetailError(null);
  };
  useEffect(() => {
    if (phase !== "ready" || typeof window === "undefined") return;
    const sync = () => {
      const id = new URLSearchParams(window.location.search).get("order");
      if (id && UUID.test(id)) { setTab("Orders"); void loadOrder(id); }
      else { setSelectedOrderId(null); setOrderDetail(null); setOrderDetailError(null); }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [phase, loadOrder]);

  const handleSendClaimCode = async () => {
    if (!profile?.phone) return;
    setClaimError(null); setBusy("claim");
    // A new code for this number consumes any open phone-change code for it (and vice versa).
    try { const result = await client.sendCode(profile.phone, "order_claim"); setClaimChallenge(result.challengeId); setPhoneChallenges(null); }
    catch (error) { setClaimError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimChallenge) { setClaimError(t("notify.claimCodeFirst")); return; }
    setClaimError(null); setBusy("claim");
    try {
      await client.claimOrder({ orderId: claim.orderId.trim(), receiptToken: claim.receipt.trim(), challengeId: claimChallenge, code: claim.code.trim() });
      setClaim({ orderId: "", receipt: "", code: "" }); setClaimChallenge(null);
      await reloadOrders();
      showNotification(t("notify.orderClaimed"));
    } catch (error) {
      // The server spends the code before matching the receipt; a retry needs a fresh code.
      if (statusOf(error) !== 0) { setClaimChallenge(null); setClaim(current => ({ ...current, code: "" })); setClaimError(t("notify.claimRetry", { error: shown(errorMessage(error)) })); }
      else setClaimError(errorMessage(error));
    }
    finally { setBusy(null); }
  };

  // ---------------------------------------------------------------- credentials
  const handleSendPhoneChangeCodes = async () => {
    if (!profile?.phone) return;
    const next = cleanPhone(phoneChange.newPhone);
    if (!E164.test(next)) { setPhoneChangeError(t("notify.phoneFormat")); return; }
    if (next === profile.phone) { setPhoneChangeError(t("notify.phoneSame")); return; }
    setPhoneChangeError(null); setPhoneChallenges(null); setBusy("phone");
    try {
      // The new number is texted first so a rejected number never spends a code on the current one.
      const fresh = await client.sendCode(next, "phone_change_new");
      const current = await client.sendCode(profile.phone, "phone_change_current");
      setPhoneChallenges({ current: current.challengeId, next: fresh.challengeId }); setClaimChallenge(null);
    } catch (error) { setPhoneChangeError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  const handleChangePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !phoneChallenges) { setPhoneChangeError(t("notify.codesFirst")); return; }
    setPhoneChangeError(null); setBusy("phone");
    try {
      const result = await client.changePhone({ phoneNumber: cleanPhone(phoneChange.newPhone), currentChallengeId: phoneChallenges.current, currentCode: phoneChange.currentCode.trim(), challengeId: phoneChallenges.next, code: phoneChange.newCode.trim(), expectedVersion: profile.version });
      setPhoneChange({ newPhone: "", currentCode: "", newCode: "" });
      if (result.signedOut) signedOut(t("notify.phoneChanged"));
    } catch (error) {
      // The server may already have spent one or both codes; never resubmit them.
      if (statusOf(error) !== 0) { setPhoneChallenges(null); setPhoneChange(current => ({ ...current, currentCode: "", newCode: "" })); setPhoneChangeError(t("notify.codesRetry", { error: shown(errorMessage(error)) })); }
      else setPhoneChangeError(errorMessage(error));
    }
    finally { setBusy(null); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 16 || passwordForm.newPassword.length > 128) { setPasswordError(t("notify.passwordLength")); return; }
    setPasswordError(null); setBusy("password");
    try {
      await client.changeStaffPassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      // Every session was revoked; staff must complete password + MFA sign-in again.
      signedOut(t("notify.passwordChanged"));
      globalThis.location?.assign("/admin/login");
    } catch (error) { setPasswordError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  // ================================================================ render
  const toast = statusMessage && (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 border px-5 py-3 shadow-xl transition-all ${statusMessage.type === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-black bg-black text-white"}`} role="status">
      {statusMessage.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <Check className="h-4 w-4 text-garmin-blue" />}
      <span className="text-[14px] font-medium">{shown(statusMessage.text)}</span>
    </div>
  );

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 font-sans" aria-busy="true">
        <p className="flex items-center justify-center gap-2 text-[14px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}</p>
      </div>
    );
  }

  if (phase === "unavailable" || phase === "error") {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 font-sans">
        <div role="alert" className="border border-neutral-200 bg-white p-6 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
          <h1 className="g-heading mt-3 text-[22px] font-semibold text-black">{phase === "unavailable" ? t("unavailableTitle") : t("errorTitle")}</h1>
          <p className="mt-2 text-[14px] text-neutral-600">{phase === "unavailable" ? t("unavailableBody") : t("errorBody")}</p>
          {loadError && <p className="mt-2 text-[12px] text-garmin-text-muted">{shown(loadError)}</p>}
          {phase === "error" && <button type="button" onClick={retry} className={`${primaryButton} mt-5`}>{t("tryAgain")}</button>}
        </div>
      </div>
    );
  }

  if (phase === "signed_out") {
    const authTabClass = (active: boolean) => `flex-1 border-b-2 pb-2.5 text-center text-[15px] font-semibold transition-colors ${active ? "border-black text-black" : "border-transparent text-neutral-500 hover:text-black"}`;
    return (
      <div className="mx-auto max-w-[480px] px-4 py-16 font-sans">
        <div className="border border-neutral-200 bg-white p-6">
          <nav aria-label={t("auth.tabsLabel")} className="flex gap-4 border-b border-neutral-100">
            <span aria-current="page" className={authTabClass(true)}>{t("auth.signInTab")}</span>
            <Link href="/account/sign-up" className={authTabClass(false)}>{t("auth.signUpTab")}</Link>
          </nav>
          <div>
          <div className="mt-5 flex items-center gap-3">
            <Phone className="h-5 w-5 text-garmin-blue" />
            <h1 className="g-heading text-[20px] font-semibold text-black">{t("signIn.title")}</h1>
          </div>
          {signInNotice && <p role="status" className="mt-4 border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">{signInNotice}</p>}
          {authMode.testCode && (
            <p data-test-mode className="mt-4 border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">{authMode.code ? t("auth.testModeCode", { code: authMode.code }) : t("auth.testMode")}</p>
          )}
          {!authMode.testCode && <p className="mt-4 text-[13px] text-neutral-600">{t("signIn.intro")}</p>}
          <form name="sign-in" onSubmit={handleSendSignInCode} className="mt-4 space-y-3">
            <div>
              <label className={labelClass} htmlFor="signInPhone">{t("signIn.phone")}</label>
              <input id="signInPhone" name="signInPhone" type="tel" required autoComplete="tel" placeholder="+77001234567" value={signInPhone} onChange={e => setSignInPhone(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>{signInChallenge ? t("signIn.resend") : t("signIn.send")}</button>
          </form>
          {signInChallenge && !needsCompletion && (
            <form name="sign-in-verify" onSubmit={handleVerifySignIn} className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
              <div>
                <label className={labelClass} htmlFor="signInCode">{t("code")}</label>
                <input id="signInCode" name="signInCode" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{4,6}" value={signInCode} onChange={e => setSignInCode(e.target.value)} className={inputClass} />
              </div>
              <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>{t("signIn.verify")}</button>
            </form>
          )}
          {needsCompletion && (
            <form name="complete-profile" onSubmit={handleCompleteProfile} className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
              <p className="text-[13px] text-neutral-600">{t("signIn.completeIntro")}</p>
              <div>
                <label className={labelClass} htmlFor="completionName">{t("signIn.fullName")}</label>
                <input id="completionName" name="completionName" required value={completion.name} onChange={e => setCompletion({ ...completion, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="completionEmail">{t("signIn.email")}</label>
                <input id="completionEmail" name="completionEmail" type="email" required value={completion.email} onChange={e => setCompletion({ ...completion, email: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>{t("signIn.create")}</button>
            </form>
          )}
          <div className="mt-4">{showError(signInError)}</div>
          <p className="mt-2 border-t border-neutral-100 pt-4 text-[14px] text-black">{t("signIn.noAccount")} <Link href="/account/sign-up" className="font-medium text-garmin-blue hover:underline">{t("signUpPage.create")}</Link></p>
          </div>
        </div>
      </div>
    );
  }

  // phase === "ready"
  if (!profile) return null;
  const canEditProfile = Boolean(profile.phone && profile.phoneVerified);

  // ---------------------------------------------------------------- orders and devices (0033 design pass)
  const isPickup = (order: { fulfillmentMethod?: string }) => order.fulfillmentMethod === "pickup";
  const stageWord = (stage: OrderStage, pickup: boolean) => pickup && stage === "packed" ? t("pickup.ready") : pickup && stage === "delivered" ? t("pickup.pickedUp") : t(`tracker.${stage}`);
  const statusDot = (order: Pick<OrderSummaryDTO, "stage" | "paymentStatus"> & { fulfillmentMethod?: string }) => order.stage ? (
    <span className="inline-flex items-center gap-2 text-black">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[order.stage]}`} />
      <span className={order.stage === "cancelled" ? "text-garmin-text-muted" : ""}>{stageWord(order.stage, isPickup(order))}</span>
    </span>
  ) : <span className="text-black">{statusLabel(order.paymentStatus)}</span>;
  const noPaymentDot = (mode: string) => isNoPayment(mode) ? <DemoDot label={t("demoBadge")} /> : null;
  const productHref = (code: string | null, sku: string | null) => code ? productPath(code, sku) : null;
  const thumb = (image: string | null, name: string) => image
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={image} alt={name} loading="lazy" className="h-16 w-16 shrink-0 bg-neutral-50 object-contain p-1 sm:h-20 sm:w-20" />
    : <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center bg-neutral-50 sm:h-20 sm:w-20"><Watch className="h-6 w-6 text-neutral-300" /></span>;
  const orderLink = (order: OrderSummaryDTO, children: React.ReactNode, className: string) => (
    <a href={`?order=${order.id}`} aria-label={t("orders.open", { number: order.orderNumber })} className={className}
      onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); void handleOpenOrder(order.id); }}>{children}</a>
  );
  const orderRow = (order: OrderSummaryDTO) => (
    <li key={order.id}>
      {orderLink(order, (
        <>
          <span className={`hidden ${ORDER_COLUMNS} md:grid`}>
            <span className="flex items-center gap-2 font-bold text-black group-hover:text-garmin-blue">{order.orderNumber}{noPaymentDot(order.paymentMode)}</span>
            <span className="text-garmin-text-muted">{formatDate(order.createdAt)}</span>
            {statusDot(order)}
            <span className="text-right tabular-nums">{order.itemsCount}</span>
            <span className="text-right font-bold tabular-nums text-black">{formatKztLocal(order.total)}</span>
            <ChevronRight aria-hidden className="h-4 w-4 text-garmin-text-muted group-hover:text-black" />
          </span>
          <span className="grid grid-cols-[1fr_auto_16px] items-center gap-x-3 gap-y-1 md:hidden">
            <span className="flex items-center gap-2 font-bold text-black">{order.orderNumber}{noPaymentDot(order.paymentMode)}</span>
            <span className="text-right font-bold tabular-nums text-black">{formatKztLocal(order.total)}</span>
            <ChevronRight aria-hidden className="h-4 w-4 text-garmin-text-muted" />
            <span className="col-span-2 flex flex-wrap items-center gap-x-2 text-[13px] text-garmin-text-muted">{formatDate(order.createdAt)} · {t("items", { count: order.itemsCount })} · {statusDot(order)}</span>
          </span>
        </>
      ), "group -mx-2 block px-2 py-4 text-[14px] transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-garmin-blue")}
    </li>
  );
  const ordersHeader = (
    <div className={`hidden ${ORDER_COLUMNS} border-b border-black px-0 pb-3 text-[12px] font-bold text-garmin-text-muted md:grid`}>
      <span>{t("orders.columns.order")}</span><span>{t("orders.columns.date")}</span><span>{t("orders.columns.status")}</span>
      <span className="text-right">{t("orders.columns.items")}</span><span className="text-right">{t("orders.columns.total")}</span><span />
    </div>
  );
  const pickupTrackerLabels = { ...trackerLabels, packed: t("pickup.ready"), delivered: t("pickup.pickedUp") };
  const eventText = (event: { type: string; label: string }, pickup: boolean) => pickup && event.type === "fulfillment.packed" ? t("pickup.ready") : eventLabel(event);
  const money = (value: OrderDetailDTO["subtotal"]) => value ? formatKztLocal(value) : "—";
  const warrantyInfo = (device: DeviceDTO) => {
    const end = new Date(device.warrantyEndsAt).getTime(), start = new Date(device.receivedAt).getTime(), now = Date.now();
    const left = end - now, total = Math.max(end - start, DAY);
    return { ended: left <= 0, months: Math.floor(left / (30.4375 * DAY)), share: Math.min(1, Math.max(0, left / total)) };
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 font-sans">
      {toast}

      {/* Header Profile Summary */}
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-100 text-neutral-600">
          <AccountIcon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="g-heading g-h1 m-0 text-black">{profile.name}</h1>
          <p className="font-mono text-[13px] text-neutral-500">
            {[profile.email, profile.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="lg:border-r lg:border-neutral-200" aria-label={t("sections")}>
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:pr-4">
            {TABS.map(id => (
              <li key={id}>
                <button type="button" onClick={() => { if (selectedOrderId) closeOrder(); setTab(id); if (id === "Wishlist") void loadWishlist(); if (id === "Devices") void loadDevices(); }} aria-current={tab === id ? "page" : undefined}
                  className={`w-full whitespace-nowrap px-4 py-2.5 text-left text-[14px] transition-colors ${tab === id ? "bg-black font-medium text-white" : "text-black hover:bg-muted hover:underline"}`}>
                  {t(`tabs.${id}`)}
                  {id === "Orders" && <span className="ml-2 bg-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-800">{orders.length}{nextCursor ? "+" : ""}</span>}
                </button>
              </li>
            ))}
            <li className="pt-2">
              <button type="button" onClick={handleSignOut} disabled={busy === "sign-out"} className="w-full px-4 py-2 text-left text-[13px] text-garmin-text-muted transition-colors hover:text-black">
                {t("signOut")}
              </button>
            </li>
          </ul>
        </nav>

        <div className="space-y-6">
          {tab === "Profile" && (
            <>
              <Card title={t("details.title")} action={!isEditingProfile ? (
                <button type="button" onClick={handleStartEditProfile} disabled={!canEditProfile} className={linkButton}>
                  <Edit3 className="h-3.5 w-3.5" /><span>{t("details.edit")}</span>
                </button>
              ) : null}>
                {!isEditingProfile ? (
                  <dl className="grid grid-cols-1 gap-4 text-[14px] sm:grid-cols-2">
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.fullName")}</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.name}</dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.email")}</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-black">
                        <span>{profile.email ?? t("details.notProvided")}</span>
                        {profile.email && !profile.emailVerified && <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">{t("details.unverified")}</span>}
                      </dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.phone")}</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-black">
                        <span>{profile.phone ?? t("details.notProvided")}</span>
                        {profile.phoneVerified && <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check className="h-3 w-3" /> {t("details.verified")}</span>}
                      </dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.birthday")}</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.birthDate ? formatBirthday(profile.birthDate, intlLocale) : <span className="font-normal text-neutral-500">{t("details.notProvided")}</span>}</dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.gender")}</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.gender ? t(`genders.${profile.gender}`) : <span className="font-normal text-neutral-500">{t("details.notProvided")}</span>}</dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[14px] font-bold text-black">{t("details.profile")}</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.profileState === "complete" ? t("details.complete") : t("details.incomplete")}</dd>
                    </div>
                  </dl>
                ) : (
                  <form name="profile" onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="profileName">{t("form.fullName")}</label>
                        <input id="profileName" name="name" type="text" required maxLength={200} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="profileEmail">{t("form.email")}</label>
                        <input id="profileEmail" name="email" type="email" required maxLength={254} value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} className={inputClass} />
                        <p className="mt-1 text-[11px] text-garmin-text-muted">{t("form.emailNote")}</p>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="profileBirthDate">{t("details.birthdayOptional")}</label>
                        <input id="profileBirthDate" name="birthDate" type="date" min={yearsAgoISO(120)} max={yearsAgoISO(10)} value={profileForm.birthDate} onChange={e => setProfileForm({ ...profileForm, birthDate: e.target.value })} className={inputClass} aria-describedby="profileBirthDateHint" />
                        <p id="profileBirthDateHint" className="mt-1 text-[11px] text-neutral-400">{t("details.birthdayHint")}</p>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="profileGender">{t("details.genderOptional")}</label>
                        <select id="profileGender" name="gender" value={profileForm.gender} onChange={e => setProfileForm({ ...profileForm, gender: e.target.value as CustomerGender | "" })} className="g-select">
                          <option value="">{t("details.notProvided")}</option>
                          {GENDERS.map(gender => <option key={gender} value={gender}>{t(`genders.${gender}`)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="profilePhone">{t("details.phone")}</label>
                        <input id="profilePhone" type="tel" disabled value={profile.phone ?? ""} className={inputClass} />
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-garmin-text-muted"><Lock className="h-3 w-3" /> {t("form.phoneNote")}</p>
                      </div>
                    </div>
                    {showError(profileError)}
                    <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                      <button type="button" onClick={() => setIsEditingProfile(false)} className={secondaryButton}>{t("cancel")}</button>
                      <button type="submit" disabled={busy === "profile"} className={primaryButton}>{t("form.save")}</button>
                    </div>
                  </form>
                )}
                {!canEditProfile && <p className="mt-3 text-[12px] text-neutral-500">{t("details.verifyToEdit")}</p>}
              </Card>

              <Card title={t("addresses.title", { count: addresses.length, max: MAX_ADDRESSES })} action={addresses.length < MAX_ADDRESSES ? (
                <button type="button" onClick={handleOpenAddAddress} disabled={busy === "address"} className="g-btn g-btn--sm g-btn--black">
                  <Plus className="h-3.5 w-3.5" /><span>{t("addresses.add")}</span>
                </button>
              ) : <span className="text-[12px] font-medium text-garmin-text-muted">{t("addresses.maxReached", { max: MAX_ADDRESSES })}</span>}>
                {addresses.length === 0 ? (
                  <p className="text-[14px] text-neutral-500">{t("addresses.empty")}</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {addresses.map(address => (
                      <div key={address.id} className={`relative flex flex-col justify-between border p-4 transition-all ${address.isPrimary ? "border-black bg-neutral-50/70" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold text-black">{address.label}</span>
                              {address.isPrimary && <span className="inline-flex items-center gap-1 bg-garmin-blue px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{t("addresses.primary")}</span>}
                            </div>
                            <div className="flex items-center gap-1 text-garmin-text-muted">
                              <button type="button" onClick={() => handleOpenEditAddress(address)} disabled={busy === "address"} className="p-1 hover:text-black" title={t("addresses.edit")} aria-label={t("addresses.editLabel", { label: address.label })}><Edit3 className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => handleDeleteAddress(address)} disabled={busy === "address"} className="p-1 hover:text-red-600" title={t("addresses.delete")} aria-label={t("addresses.deleteLabel", { label: address.label })}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                          <div className="mt-2 text-[13px] leading-relaxed text-neutral-700">
                            <p className="font-semibold text-black">{address.recipientName}</p>
                            <p>{address.line1}</p>
                            {address.line2 && <p>{address.line2}</p>}
                            <p>{[address.city, kzRegionLabel(address.region), address.postalCode].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(", ")}</p>
                            <p>
                              {regionName(address.countryCode)}
                              {address.countryCode !== "KZ" && <span className="ml-2 border border-garmin-control bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">{t("addresses.editToShip")}</span>}
                            </p>
                            {typeof address.lat === "number" && <p className="text-[12px] text-neutral-500">{t("addresses.pinned")}</p>}
                            <p className="pt-0.5 text-[12px] text-neutral-500">{t("addresses.phone", { phone: address.phone })}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
                          <button type="button" onClick={() => handleSetPrimary(address)} disabled={address.isPrimary || busy === "address"} className="group flex items-center gap-2 text-left" title={address.isPrimary ? t("addresses.currentPrimary") : t("addresses.setPrimaryTitle")}>
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${address.isPrimary ? "border-garmin-blue bg-garmin-blue text-white" : "border-neutral-300 bg-white group-hover:border-black"}`}>
                              {address.isPrimary ? <Check className="h-3 w-3 stroke-[3]" /> : <span className="h-1.5 w-1.5 rounded-full opacity-0 group-hover:bg-neutral-400 group-hover:opacity-100" />}
                            </span>
                            <span className={`text-[12px] font-medium transition-colors ${address.isPrimary ? "font-semibold text-garmin-blue" : "text-neutral-600 group-hover:text-black"}`}>
                              {address.isPrimary ? t("addresses.primaryAddress") : t("addresses.setPrimary")}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title={t("security.title")}>
                {isStaff ? (
                  <div className="space-y-3 text-[13px] text-neutral-700">
                    <p className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 text-garmin-blue" /> {t("security.staffIntro")}</p>
                    {!isPasswordChangeOpen ? (
                      <button type="button" onClick={() => { setPasswordError(null); setIsPasswordChangeOpen(true); }} className={linkButton}>{t("security.changePassword")}</button>
                    ) : (
                      <form name="password-change" onSubmit={handleChangePassword} className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass} htmlFor="currentPassword">{t("security.currentPassword")}</label>
                            <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass} htmlFor="newPassword">{t("security.newPassword")}</label>
                            <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={16} maxLength={128} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className={inputClass} />
                          </div>
                        </div>
                        {showError(passwordError)}
                        <div className="flex items-center justify-end gap-3">
                          <button type="button" onClick={() => setIsPasswordChangeOpen(false)} className={secondaryButton}>{t("cancel")}</button>
                          <button type="submit" disabled={busy === "password"} className={primaryButton}>{t("security.updatePassword")}</button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 text-[13px] text-neutral-700">
                    <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 text-garmin-blue" /> {t("security.customerIntro")}</p>
                    {!isPhoneChangeOpen ? (
                      <button type="button" onClick={() => { setPhoneChangeError(null); setPhoneChallenges(null); setIsPhoneChangeOpen(true); }} disabled={!profile.phone || !profile.phoneVerified} className={linkButton}>{t("security.changePhone")}</button>
                    ) : (
                      <div className="space-y-3 border border-neutral-200 p-4">
                        <p className="text-[12px] text-neutral-500">{t("security.phoneChangeIntro")}</p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label className={labelClass} htmlFor="newPhone">{t("security.newPhone")}</label>
                            <input id="newPhone" name="newPhone" type="tel" placeholder="+77001234567" value={phoneChange.newPhone} onChange={e => setPhoneChange({ ...phoneChange, newPhone: e.target.value })} className={inputClass} />
                          </div>
                          <button type="button" onClick={handleSendPhoneChangeCodes} disabled={busy === "phone"} className={secondaryButton}>{phoneChallenges ? t("security.resendCodes") : t("security.sendCodes")}</button>
                        </div>
                        {phoneChallenges && (
                          <form name="phone-change" onSubmit={handleChangePhone} className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className={labelClass} htmlFor="currentCode">{t("security.currentCode", { phone: profile.phone ?? "" })}</label>
                                <input id="currentCode" name="currentCode" inputMode="numeric" required pattern="[0-9]{4,6}" value={phoneChange.currentCode} onChange={e => setPhoneChange({ ...phoneChange, currentCode: e.target.value })} className={inputClass} />
                              </div>
                              <div>
                                <label className={labelClass} htmlFor="newCode">{t("security.newCode")}</label>
                                <input id="newCode" name="newCode" inputMode="numeric" required pattern="[0-9]{4,6}" value={phoneChange.newCode} onChange={e => setPhoneChange({ ...phoneChange, newCode: e.target.value })} className={inputClass} />
                              </div>
                            </div>
                            <div className="flex justify-end"><button type="submit" disabled={busy === "phone"} className={primaryButton}>{t("security.confirmPhone")}</button></div>
                          </form>
                        )}
                        {showError(phoneChangeError)}
                        <button type="button" onClick={() => setIsPhoneChangeOpen(false)} className="text-[12px] text-neutral-500 hover:text-black">{t("cancel")}</button>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {orders.length > 0 && (
                <Card title={t("recent.title")} action={
                  <button type="button" onClick={() => { closeOrder(); setTab("Orders"); }} className={linkButton}><span>{t("recent.viewAll")}</span><ChevronRight className="h-3.5 w-3.5" /></button>
                }>
                  <ul className="divide-y divide-garmin-control">{orderRow(orders[0])}</ul>
                </Card>
              )}
            </>
          )}

          {tab === "Orders" && selectedOrderId && (
            <Card title={orderDetail ? t("order.title", { number: orderDetail.orderNumber }) : t("order.details")} action={
              <a href="?" onClick={event => { event.preventDefault(); closeOrder(); }} className={linkButton}><ChevronLeft className="h-3.5 w-3.5" /><span>{t("order.back")}</span></a>
            }>
              {!orderDetail && !orderDetailError && <p className="flex items-center gap-2 text-[14px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> {t("order.loading")}</p>}
              {showError(orderDetailError)}
              {orderDetail && (() => {
                const detail = orderDetail, pickup = isPickup(detail);
                const addressLines = deliveryAddressLines(detail.deliveryAddress);
                return (
                  <div className="text-[14px] text-black" data-order-detail>
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-garmin-control pb-6">
                      <div>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-garmin-text-muted">{t("order.placed", { date: formatDate(detail.createdAt) })} · {statusDot(detail)}</p>
                        <p className="mt-1 flex items-center gap-2">
                          {isNoPayment(detail.paymentMode)
                            ? <><DemoDot label={t("demoBadge")} /><span className="text-garmin-text-muted">{t("demoNote")}</span></>
                            : <span>{t("order.payment", { status: statusLabel(detail.paymentStatus) })}</span>}
                        </p>
                        <p className="mt-1 text-garmin-text-muted">{pickup ? t("pickup.method") : t("order.deliveryMethod")}</p>
                      </div>
                      <span className="g-heading text-[24px] font-bold tabular-nums">{formatKztLocal(detail.total)}</span>
                    </div>
                    {detail.stage && (
                      <div className="border-b border-garmin-control py-8">
                        <OrderTracker stage={detail.stage} pickup={pickup} dates={detail.stageDates} labels={pickup ? pickupTrackerLabels : trackerLabels} formatDate={formatDate} />
                      </div>
                    )}
                    {detail.dataQuality !== "complete" && <p className="mt-6 border-l-2 border-garmin-badge-gold pl-3 text-[13px] text-garmin-text-muted">{t("order.legacy")}</p>}
                    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div>
                        <h3 className="mb-2 text-[16px] font-bold">{t("order.itemsTitle")}</h3>
                        <ul className="divide-y divide-garmin-control border-y border-garmin-control">
                          {detail.items.map(item => {
                            const href = productHref(item.productCode, item.variantSku);
                            const options = Object.values(item.options).filter(value => value && value !== "Base");
                            return (
                              <li key={item.id} className="flex gap-4 py-5">
                                {href ? <Link href={href} tabIndex={-1} aria-hidden>{thumb(item.image, item.name)}</Link> : thumb(item.image, item.name)}
                                <div className="min-w-0 flex-1">
                                  {href ? <Link href={href} className="font-bold text-black hover:text-garmin-blue hover:underline">{item.name}</Link> : <p className="font-bold">{item.name}</p>}
                                  {options.length > 0 && <p className="text-garmin-text-muted">{options.join(" · ")}</p>}
                                  <p className="mt-1 tabular-nums">{item.quantity} × {formatKztLocal(item.unitPrice)}</p>
                                  {(item.serials?.length ?? 0) > 0 && <p className="mt-1 text-[13px]">{t("order.serialLabel")} <span className="font-mono">{item.serials.join(", ")}</span></p>}
                                  <p className="mt-1 text-right font-bold tabular-nums sm:hidden">{formatKztLocal(item.total)}</p>
                                </div>
                                <span className="hidden shrink-0 text-right font-bold tabular-nums sm:block">{formatKztLocal(item.total)}</span>
                              </li>
                            );
                          })}
                        </ul>
                        <dl className="ml-auto mt-4 grid max-w-[320px] grid-cols-[1fr_auto] gap-y-2">
                          <dt>{t("order.subtotal")}</dt><dd className="text-right tabular-nums">{money(detail.subtotal)}</dd>
                          {detail.discount && detail.discount.amountMinor !== "0" && <><dt>{t("order.discount")}</dt><dd className="text-right tabular-nums">−{money(detail.discount)}</dd></>}
                          <dt>{t("order.shipping")}</dt><dd className="text-right tabular-nums">{detail.shipping && detail.shipping.amountMinor === "0" ? t("order.free") : money(detail.shipping)}</dd>
                          {(!detail.tax || detail.tax.amountMinor !== "0") && <><dt>{t("order.tax")}</dt><dd className="text-right tabular-nums">{money(detail.tax)}</dd></>}
                          <dt className="mt-1 border-t border-black pt-3 text-[16px] font-bold">{t("order.total")}</dt><dd className="mt-1 border-t border-black pt-3 text-right text-[16px] font-bold tabular-nums">{formatKztLocal(detail.total)}</dd>
                        </dl>
                      </div>
                      <aside className="space-y-8 border-t border-garmin-control pt-6 lg:border-t-0 lg:pt-0">
                        {pickup && detail.pickup ? (
                          <section>
                            <h3 className="mb-2 text-[16px] font-bold">{t("pickup.title")}</h3>
                            <p className="font-bold">{pickupText(detail.pickup.name, locale)}</p>
                            <p className="leading-6">{pickupText(detail.pickup.address, locale)}</p>
                            <p className="text-garmin-text-muted">{pickupText(detail.pickup.hours, locale)}</p>
                            {detail.pickup.phone && <a href={`tel:${detail.pickup.phone.replace(/[^+0-9]/g, "")}`} className="text-garmin-blue hover:underline">{detail.pickup.phone}</a>}
                            <a href={pickupMapUrl(detail.pickup)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-garmin-blue hover:underline">{t("pickup.map")}<ExternalLink aria-hidden className="h-3.5 w-3.5" /></a>
                            <p className="mt-3 text-garmin-text-muted">{t("pickup.collector", { name: detail.contact.name })}</p>
                          </section>
                        ) : (
                          <section>
                            <h3 className="mb-2 text-[16px] font-bold">{t("order.deliveryAddress")}</h3>
                            {addressLines.length ? <div className="leading-6">{addressLines.map((line, index) => <p key={index}>{line}</p>)}</div> : <p className="text-garmin-text-muted">{t("order.noAddress")}</p>}
                          </section>
                        )}
                        {detail.events.length > 0 && (
                          <section>
                            <h3 className="mb-2 text-[16px] font-bold">{t("order.updates")}</h3>
                            <ol className="space-y-3">
                              {[...detail.events].reverse().map(event => (
                                <li key={event.id} className="grid grid-cols-[auto_1fr] gap-x-3"><span className="w-[92px] text-[13px] tabular-nums text-garmin-text-muted">{formatDate(event.occurredAt)}</span><span>{eventText(event, pickup)}</span></li>
                              ))}
                            </ol>
                          </section>
                        )}
                      </aside>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}

          {tab === "Orders" && !selectedOrderId && (
            <>
              <Card title={t("orders.title", { count: `${orders.length}${nextCursor ? "+" : ""}` })}>
                {orders.length === 0 ? (
                  <div className="py-6 text-[14px]">
                    <p className="text-garmin-text-muted">{t("orders.empty")}</p>
                    <Link href="/c/wearables-smartwatches" className={`${linkButton} mt-2`}>{t("orders.shop")}</Link>
                  </div>
                ) : (
                  <div>
                    {ordersHeader}
                    <ul className="divide-y divide-garmin-control">{orders.map(orderRow)}</ul>
                  </div>
                )}
                {showError(ordersError)}
                {nextCursor && (
                  <div className="mt-6 flex justify-center">
                    <button type="button" onClick={handleLoadMoreOrders} disabled={busy === "orders"} className={secondaryButton}>{t("orders.loadMore")}</button>
                  </div>
                )}
              </Card>

              <Card title={t("claim.title")}>
                <p className="text-[13px] text-neutral-600">{t("claim.intro", { phone: profile.phone ?? t("claim.verifiedPhone") })}</p>
                <form name="claim" onSubmit={handleClaim} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="claimOrderId">{t("claim.orderId")}</label>
                      <input id="claimOrderId" name="claimOrderId" required value={claim.orderId} onChange={e => setClaim({ ...claim, orderId: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="claimReceipt">{t("claim.receipt")}</label>
                      <input id="claimReceipt" name="claimReceipt" required autoComplete="off" value={claim.receipt} onChange={e => setClaim({ ...claim, receipt: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <button type="button" onClick={handleSendClaimCode} disabled={!profile.phone || !profile.phoneVerified || busy === "claim"} className={secondaryButton}>{claimChallenge ? t("claim.resendCode") : t("claim.sendCode")}</button>
                    {claimChallenge && (
                      <div className="flex-1">
                        <label className={labelClass} htmlFor="claimCode">{t("code")}</label>
                        <input id="claimCode" name="claimCode" inputMode="numeric" required pattern="[0-9]{4,6}" value={claim.code} onChange={e => setClaim({ ...claim, code: e.target.value })} className={inputClass} />
                      </div>
                    )}
                  </div>
                  {showError(claimError)}
                  <div className="flex justify-end"><button type="submit" disabled={!claimChallenge || busy === "claim"} className={primaryButton}>{t("claim.submit")}</button></div>
                </form>
              </Card>
            </>
          )}

          {tab === "Wishlist" && (
            <Card title={t("wishlist.title")}>
              {showError(wishlistError)}
              {wishlist === null && !wishlistError && <p className="flex items-center gap-2 text-[13px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> {t("wishlist.loading")}</p>}
              {wishlist !== null && wishlist.length === 0 && <p className="text-[14px] text-neutral-500">{t("wishlist.empty")}</p>}
              {wishlist !== null && wishlist.length > 0 && (
                <ul className="divide-y divide-neutral-100 border border-neutral-200">
                  {wishlist.map(item => (
                    <li key={item.productKey} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        {item.archived ? <p className="font-semibold text-black">{item.name}</p> : <Link href={productPath(item.productCode || item.productKey)} className="font-semibold text-black hover:text-garmin-blue">{item.name}</Link>}
                        <p className="text-[12px] text-neutral-500">
                          {item.availability === "available" ? formatKztLocal(item.price) : item.availability === "out_of_stock" ? `${formatKztLocal(item.price)} · ${t("wishlist.outOfStock")}` : t("wishlist.unavailable")}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeFromWishlist(item.productKey)} aria-label={t("wishlist.remove", { name: item.name })} className="text-garmin-text-muted hover:text-black"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "Devices" && (
            <Card title={t("devices.title")}>
              {showError(devicesError)}
              {devices === null && !devicesError && <p className="flex items-center gap-2 text-[14px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> {t("devices.loading")}</p>}
              {devices !== null && devices.length === 0 && (
                <div className="py-6 text-[14px]"><p className="text-black">{t("devices.empty")}</p><p className="mt-1 text-garmin-text-muted">{t("devices.emptyHint")}</p></div>
              )}
              {devices !== null && devices.length > 0 && (
                <ul className="divide-y divide-garmin-control border-y border-garmin-control" data-devices>
                  {devices.map(device => {
                    const href = productHref(device.productCode, device.sku), warranty = warrantyInfo(device);
                    return (
                      <li key={device.id} className="grid grid-cols-[64px_1fr] items-start gap-4 py-5 text-[14px] sm:grid-cols-[80px_1fr] md:grid-cols-[80px_1fr_220px] md:gap-6">
                        {thumb(device.image, device.productName)}
                        <div className="min-w-0 space-y-1">
                          <p>{href ? <Link href={href} className="font-bold text-black hover:text-garmin-blue hover:underline">{device.productName}</Link> : <span className="font-bold">{device.productName}</span>}{device.variantName && <span className="text-garmin-text-muted"> · {device.variantName}</span>}</p>
                          <p>{t("order.serialLabel")} <span className="font-mono">{device.serial}</span></p>
                          <p className="text-garmin-text-muted">{t("devices.purchased", { date: formatDate(device.purchasedAt) })} · {t("devices.order")}{" "}
                            <a href={`?order=${device.orderId}`} onClick={event => { event.preventDefault(); void handleOpenOrder(device.orderId); }} className="text-garmin-blue hover:underline">{device.orderNumber}</a>
                          </p>
                        </div>
                        <div className="col-span-2 md:col-span-1">
                          <p className="text-[12px] font-bold text-garmin-text-muted">{t("devices.warranty", { months: device.warrantyMonths })}</p>
                          {warranty.ended
                            ? <p className="font-bold text-garmin-text-muted">{t("devices.ended")}</p>
                            : <p className="font-bold">{warranty.months >= 1 ? t("devices.monthsLeft", { count: warranty.months }) : t("devices.underMonth")}</p>}
                          <div className="mt-2 h-1 w-full bg-neutral-200" role="presentation"><div className={`h-1 ${warranty.ended ? "" : "bg-garmin-blue"}`} style={{ width: `${Math.round(warranty.share * 100)}%` }} /></div>
                          <p className="mt-1 text-[13px] text-garmin-text-muted">{warranty.ended ? t("devices.endedOn", { date: formatDate(device.warrantyEndsAt) }) : t("devices.until", { date: formatDate(device.warrantyEndsAt) })}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === "Subscriptions" && (
            <Card title={t("subscriptions.title")}>
              <p className="text-[14px] text-neutral-500">{t("subscriptions.none")}</p>
            </Card>
          )}
        </div>
      </div>

      {isAddressModalOpen && (
        // Above the sticky site header (z-index 1000): the taller map modal must not slide under it.
        <div className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-xs sm:items-center sm:p-4" onClick={() => setIsAddressModalOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={editingAddress ? t("addressForm.editLabel") : t("addressForm.addLabel")} className="my-2 w-full max-w-2xl border border-neutral-300 bg-white p-4 shadow-2xl sm:my-0 sm:max-h-[94vh] sm:overflow-y-auto sm:p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="g-heading g-h4 m-0 text-black">{editingAddress ? t("addressForm.editTitle") : t("addressForm.addTitle")}</h3>
              <button type="button" onClick={() => setIsAddressModalOpen(false)} className="text-garmin-text-muted hover:text-black" aria-label={t("close")}><X className="h-5 w-5" /></button>
            </div>
            <form name="address" onSubmit={handleSaveAddress} className="mt-4 space-y-3">
              <AddressForm idPrefix="account-address" value={addressForm} onChange={setAddressForm} legacyCountry={editingAddress?.countryCode} disabled={busy === "address"} />
              {!(editingAddress?.isPrimary) && (
                <label className="flex cursor-pointer items-center gap-2 pt-2">
                  <input type="checkbox" name="isPrimary" checked={addressForm.isPrimary} onChange={e => setAddressForm({ ...addressForm, isPrimary: e.target.checked })} className="h-4 w-4 accent-black" />
                  <span className="text-xs font-medium text-neutral-700">{t("addressForm.primary")}</span>
                </label>
              )}
              {showError(addressError)}
              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button type="button" onClick={() => setIsAddressModalOpen(false)} className={secondaryButton}>{t("cancel")}</button>
                <button type="submit" disabled={busy === "address"} className={primaryButton}>{editingAddress ? t("addressForm.saveChanges") : t("addresses.add")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
