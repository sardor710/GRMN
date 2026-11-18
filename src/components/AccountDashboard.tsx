"use client";

// Session-owned customer account (Task 10C). Every record shown here comes from /api/account/*
// for the signed-in session; nothing is seeded, selected by email or faked on failure.
import { useState, useEffect, useMemo, useCallback } from "react";
import { Check, Plus, Trash2, Edit3, X, AlertCircle, Lock, KeyRound, Package, ChevronRight, Phone, Loader2 } from "lucide-react";
import { AccountIcon } from "@/components/icons";
import type { CustomerProfileDTO, OrderDetailDTO, OrderSummaryDTO, SavedAddressDTO, WishlistItemDTO } from "@/contracts/commerce";
import {
  AccountRequestError,
  COUNTRY_OPTIONS,
  countryName,
  createAccountClient,
  deliveryAddressLines,
  formatKzt,
  announceSessionChange,
  type AccountFetcher,
  type AddressFields,
} from "@/lib/account-client";

const TABS = ["Profile", "Orders", "Wishlist", "Devices", "Subscriptions"] as const;
type Tab = (typeof TABS)[number];
type Phase = "loading" | "signed_out" | "unavailable" | "error" | "ready";
const MAX_ADDRESSES = 5;
const EMPTY_ADDRESS: AddressFields = { label: "", recipientName: "", phone: "", countryCode: "KZ", city: "", line1: "", line2: "", region: "", postalCode: "", isPrimary: false };

const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
const statusOf = (error: unknown) => error instanceof AccountRequestError ? error.status : -1;
const cleanPhone = (value: string) => value.replace(/[\s()-]/g, "");
const E164 = /^[+][1-9][0-9]{7,14}$/;
const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const statusTone = (status: string) => status === "delivered" ? "bg-emerald-50 text-emerald-800 border-emerald-300"
  : status === "shipped" ? "bg-sky-50 text-sky-800 border-sky-300"
  : status === "processing" || status === "new" ? "bg-amber-50 text-amber-800 border-amber-300"
  : "bg-neutral-100 text-neutral-800 border-neutral-300";
const inputClass = "mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none disabled:bg-neutral-100";
const labelClass = "block text-[12px] font-semibold uppercase tracking-wider text-neutral-600";
const primaryButton = "bg-black px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400";
const secondaryButton = "border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
const linkButton = "inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#007cc3] hover:underline disabled:cursor-not-allowed disabled:text-neutral-400";

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="border border-neutral-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
        <h2 className="g-heading text-[18px] font-semibold text-black">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function renderError(message: string | null) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
      <span>{message}</span>
    </p>
  );
}

export function AccountDashboard() {
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

  // Profile
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
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
    setIsEditingProfile(false); setProfileForm({ name: "", email: "" }); setProfileError(null);
    setIsAddressModalOpen(false); setEditingAddress(null); setAddressForm(EMPTY_ADDRESS); setAddressError(null);
    setOrdersError(null); setOrderDetailError(null); setWishlist(null); setWishlistError(null);
    setClaim({ orderId: "", receipt: "", code: "" }); setClaimChallenge(null); setClaimError(null);
    setPhoneChange({ newPhone: "", currentCode: "", newCode: "" }); setPhoneChangeError(null);
    setIsPasswordChangeOpen(false); setPasswordForm({ currentPassword: "", newPassword: "" }); setPasswordError(null);
    setSignInNotice(notice); setPhase("signed_out");
  }, []);

  // Loads the whole account for the session. Any failure shows an error state; nothing partial
  // is rendered and no mutation is offered until a full load succeeds.
  const load = useCallback(async () => {
    try {
      const session = await client.session();
      if (!session.user) { signedOut(null); return; }
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
    catch { showNotification(`${success} Your address list could not refresh; reload the page.`, "error"); }
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
    try { await client.signOut(); announceSessionChange(); signedOut("You have been signed out."); }
    catch (error) { showNotification(errorMessage(error), "error"); }
    finally { setBusy(null); }
  };

  // ---------------------------------------------------------------- profile
  const handleStartEditProfile = () => {
    if (!profile) return;
    setProfileForm({ name: profile.name, email: profile.email ?? "" });
    setProfileError(null); setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!profile.phone || !profile.phoneVerified) { setProfileError("Verify a phone number before saving your details."); return; }
    if (!profileForm.name.trim() || !profileForm.email.trim()) { setProfileError("Name and email are required fields."); return; }
    setProfileError(null); setBusy("profile");
    try {
      const saved = await client.saveProfile({ name: profileForm.name.trim(), email: profileForm.email.trim(), phone: profile.phone, expectedVersion: profile.version });
      setProfile(saved); setIsEditingProfile(false);
      showNotification(saved.emailVerified ? "Personal details updated." : "Personal details updated. Your email is not verified yet.");
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
    setAddressForm({ label: address.label, recipientName: address.recipientName, phone: address.phone, countryCode: address.countryCode, city: address.city, line1: address.line1, line2: address.line2 ?? "", region: address.region ?? "", postalCode: address.postalCode ?? "", isPrimary: address.isPrimary });
    setAddressError(null); setIsAddressModalOpen(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressForm.label.trim() || !addressForm.recipientName.trim() || !addressForm.line1.trim() || !addressForm.city.trim() || !addressForm.phone.trim()) {
      setAddressError("Title, recipient, phone, street and city are required."); return;
    }
    setAddressError(null); setBusy("address");
    try {
      await client.saveAddress({ ...addressForm, phone: cleanPhone(addressForm.phone) }, editingAddress ? { id: editingAddress.id, version: editingAddress.version } : undefined);
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
    await refreshAfterWrite(editingAddress ? "Shipping address updated." : "New shipping address saved.");
    setBusy(null);
  };

  const handleDeleteAddress = async (address: SavedAddressDTO) => {
    if (!confirm(`Remove shipping address "${address.label}"?`)) return;
    setBusy("address");
    try { await client.deleteAddress(address); }
    catch (error) { showNotification(errorMessage(error), "error"); try { await reloadAddresses(); } catch { /* keep the error visible */ } setBusy(null); return; }
    await refreshAfterWrite(`Address "${address.label}" removed.`);
    setBusy(null);
  };

  const handleSetPrimary = async (address: SavedAddressDTO) => {
    if (address.isPrimary) return;
    setBusy("address");
    try {
      await client.saveAddress({ label: address.label, recipientName: address.recipientName, phone: address.phone, countryCode: address.countryCode, city: address.city, line1: address.line1, line2: address.line2, region: address.region, postalCode: address.postalCode, isPrimary: true }, address);
    } catch (error) { showNotification(errorMessage(error), "error"); try { await reloadAddresses(); } catch { /* keep the error visible */ } setBusy(null); return; }
    await refreshAfterWrite(`"${address.label}" is now your primary address.`);
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

  const handleOpenOrder = async (id: string) => {
    setSelectedOrderId(id); setOrderDetail(null); setOrderDetailError(null);
    try { setOrderDetail(await client.order(id)); }
    catch (error) { setOrderDetailError(errorMessage(error)); }
  };

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
    if (!claimChallenge) { setClaimError("Send a claim code to your phone first."); return; }
    setClaimError(null); setBusy("claim");
    try {
      await client.claimOrder({ orderId: claim.orderId.trim(), receiptToken: claim.receipt.trim(), challengeId: claimChallenge, code: claim.code.trim() });
      setClaim({ orderId: "", receipt: "", code: "" }); setClaimChallenge(null);
      await reloadOrders();
      showNotification("The order was added to your account.");
    } catch (error) {
      // The server spends the code before matching the receipt; a retry needs a fresh code.
      if (statusOf(error) !== 0) { setClaimChallenge(null); setClaim(current => ({ ...current, code: "" })); setClaimError(`${errorMessage(error)} Send a new claim code to try again.`); }
      else setClaimError(errorMessage(error));
    }
    finally { setBusy(null); }
  };

  // ---------------------------------------------------------------- credentials
  const handleSendPhoneChangeCodes = async () => {
    if (!profile?.phone) return;
    const next = cleanPhone(phoneChange.newPhone);
    if (!E164.test(next)) { setPhoneChangeError("Enter the new number in international format, e.g. +77001234567."); return; }
    if (next === profile.phone) { setPhoneChangeError("Enter a new phone number that differs from your current one."); return; }
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
    if (!profile || !phoneChallenges) { setPhoneChangeError("Send verification codes first."); return; }
    setPhoneChangeError(null); setBusy("phone");
    try {
      const result = await client.changePhone({ phoneNumber: cleanPhone(phoneChange.newPhone), currentChallengeId: phoneChallenges.current, currentCode: phoneChange.currentCode.trim(), challengeId: phoneChallenges.next, code: phoneChange.newCode.trim(), expectedVersion: profile.version });
      setPhoneChange({ newPhone: "", currentCode: "", newCode: "" });
      if (result.signedOut) signedOut("Your phone number was changed and every session was signed out. Sign in with your new number.");
    } catch (error) {
      // The server may already have spent one or both codes; never resubmit them.
      if (statusOf(error) !== 0) { setPhoneChallenges(null); setPhoneChange(current => ({ ...current, currentCode: "", newCode: "" })); setPhoneChangeError(`${errorMessage(error)} Send new codes to try again.`); }
      else setPhoneChangeError(errorMessage(error));
    }
    finally { setBusy(null); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 16 || passwordForm.newPassword.length > 128) { setPasswordError("The new password must be 16 to 128 characters."); return; }
    setPasswordError(null); setBusy("password");
    try {
      await client.changeStaffPassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "" });
      // Every session was revoked; staff must complete password + MFA sign-in again.
      signedOut("Password changed. Every session was signed out; sign in to the staff console again with your new password and MFA.");
      globalThis.location?.assign("/admin/login");
    } catch (error) { setPasswordError(errorMessage(error)); }
    finally { setBusy(null); }
  };

  // ================================================================ render
  const toast = statusMessage && (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 border px-5 py-3 shadow-xl transition-all ${statusMessage.type === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-black bg-black text-white"}`} role="status">
      {statusMessage.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <Check className="h-4 w-4 text-[#007cc3]" />}
      <span className="text-xs font-semibold uppercase tracking-wider">{statusMessage.text}</span>
    </div>
  );

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 font-sans" aria-busy="true">
        <p className="flex items-center justify-center gap-2 text-[14px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading your account…</p>
      </div>
    );
  }

  if (phase === "unavailable" || phase === "error") {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-20 font-sans">
        <div role="alert" className="border border-neutral-200 bg-white p-6 text-center shadow-xs">
          <AlertCircle className="mx-auto h-6 w-6 text-red-600" />
          <h1 className="g-heading mt-3 text-[22px] font-semibold text-black">{phase === "unavailable" ? "Account access is not available" : "We could not load your account"}</h1>
          <p className="mt-2 text-[14px] text-neutral-600">{phase === "unavailable" ? "Account services are offline right now. No changes can be made until they are back." : "Nothing was changed. Please try again."}</p>
          {loadError && <p className="mt-2 font-mono text-[12px] text-neutral-400">{loadError}</p>}
          {phase === "error" && <button type="button" onClick={retry} className={`${primaryButton} mt-5`}>Try again</button>}
        </div>
      </div>
    );
  }

  if (phase === "signed_out") {
    return (
      <div className="mx-auto max-w-[480px] px-4 py-16 font-sans">
        <div className="border border-neutral-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
            <Phone className="h-5 w-5 text-[#007cc3]" />
            <h1 className="g-heading text-[20px] font-semibold text-black">Sign in with your phone</h1>
          </div>
          {signInNotice && <p role="status" className="mt-4 border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">{signInNotice}</p>}
          <p className="mt-4 text-[13px] text-neutral-600">We send a one-time code to your phone. Your orders and addresses are shown only after you prove you own that number.</p>
          <form name="sign-in" onSubmit={handleSendSignInCode} className="mt-4 space-y-3">
            <div>
              <label className={labelClass} htmlFor="signInPhone">Phone number</label>
              <input id="signInPhone" name="signInPhone" type="tel" required autoComplete="tel" placeholder="+77001234567" value={signInPhone} onChange={e => setSignInPhone(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>{signInChallenge ? "Send a new code" : "Send code"}</button>
          </form>
          {signInChallenge && !needsCompletion && (
            <form name="sign-in-verify" onSubmit={handleVerifySignIn} className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
              <div>
                <label className={labelClass} htmlFor="signInCode">6-digit code</label>
                <input id="signInCode" name="signInCode" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" value={signInCode} onChange={e => setSignInCode(e.target.value)} className={inputClass} />
              </div>
              <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>Verify and sign in</button>
            </form>
          )}
          {needsCompletion && (
            <form name="complete-profile" onSubmit={handleCompleteProfile} className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
              <p className="text-[13px] text-neutral-600">Your phone is verified. Tell us who you are to create your account.</p>
              <div>
                <label className={labelClass} htmlFor="completionName">Full name</label>
                <input id="completionName" name="completionName" required value={completion.name} onChange={e => setCompletion({ ...completion, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="completionEmail">Email</label>
                <input id="completionEmail" name="completionEmail" type="email" required value={completion.email} onChange={e => setCompletion({ ...completion, email: e.target.value })} className={inputClass} />
              </div>
              <button type="submit" disabled={busy === "sign-in"} className={primaryButton}>Create account</button>
            </form>
          )}
          <div className="mt-4">{renderError(signInError)}</div>
        </div>
      </div>
    );
  }

  // phase === "ready"
  if (!profile) return null;
  const primaryAddress = addresses.find(address => address.isPrimary) ?? addresses[0];
  const canEditProfile = Boolean(profile.phone && profile.phoneVerified);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 font-sans">
      {toast}

      {/* Header Profile Summary */}
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-6 sm:flex-row sm:items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-100 text-neutral-600">
          <AccountIcon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="g-heading text-[28px] font-semibold uppercase tracking-wide text-black">{profile.name}</h1>
          <p className="font-mono text-[13px] text-neutral-500">
            {[profile.email, profile.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="lg:border-r lg:border-neutral-200" aria-label="Account sections">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:pr-4">
            {TABS.map(t => (
              <li key={t}>
                <button type="button" onClick={() => { setTab(t); if (t === "Wishlist") void loadWishlist(); }} aria-current={tab === t ? "page" : undefined}
                  className={`w-full whitespace-nowrap px-4 py-2.5 text-left text-[14px] transition-colors ${tab === t ? "bg-black font-medium text-white lg:border-l-4 lg:border-[#007cc3]" : "text-neutral-600 hover:bg-neutral-100/60 hover:text-black"}`}>
                  {t}
                  {t === "Orders" && <span className="ml-2 bg-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-800">{orders.length}{nextCursor ? "+" : ""}</span>}
                </button>
              </li>
            ))}
            <li className="pt-2">
              <button type="button" onClick={handleSignOut} disabled={busy === "sign-out"} className="w-full px-4 py-2 text-left text-[13px] text-neutral-400 transition-colors hover:text-black">
                Sign Out
              </button>
            </li>
          </ul>
        </nav>

        <div className="space-y-6">
          {tab === "Profile" && (
            <>
              <Card title="Account Details" action={!isEditingProfile ? (
                <button type="button" onClick={handleStartEditProfile} disabled={!canEditProfile} className={linkButton}>
                  <Edit3 className="h-3.5 w-3.5" /><span>Edit Details</span>
                </button>
              ) : null}>
                {!isEditingProfile ? (
                  <dl className="grid grid-cols-1 gap-4 text-[14px] sm:grid-cols-2">
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Full Name</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.name}</dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Email Address</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-black">
                        <span>{profile.email ?? "Not provided"}</span>
                        {profile.email && !profile.emailVerified && <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Unverified</span>}
                      </dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Phone Number</dt>
                      <dd className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-black">
                        <span>{profile.phone ?? "Not provided"}</span>
                        {profile.phoneVerified && <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check className="h-3 w-3" /> Verified</span>}
                      </dd>
                    </div>
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Profile</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.profileState === "complete" ? "Complete" : "Not completed yet"}</dd>
                    </div>
                  </dl>
                ) : (
                  <form name="profile" onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass} htmlFor="profileName">Full Name *</label>
                        <input id="profileName" name="name" type="text" required maxLength={200} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="profileEmail">Email Address *</label>
                        <input id="profileEmail" name="email" type="email" required maxLength={254} value={profileForm.email} onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} className={inputClass} />
                        <p className="mt-1 text-[11px] text-neutral-400">A changed email is stored as unverified.</p>
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor="profilePhone">Phone Number</label>
                        <input id="profilePhone" type="tel" disabled value={profile.phone ?? ""} className={inputClass} />
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-400"><Lock className="h-3 w-3" /> Change your phone number under Sign-in &amp; Security.</p>
                      </div>
                    </div>
                    {renderError(profileError)}
                    <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                      <button type="button" onClick={() => setIsEditingProfile(false)} className={secondaryButton}>Cancel</button>
                      <button type="submit" disabled={busy === "profile"} className={primaryButton}>Save Details</button>
                    </div>
                  </form>
                )}
                {!canEditProfile && <p className="mt-3 text-[12px] text-neutral-500">Verify a phone number to edit your details.</p>}
              </Card>

              <Card title={`Shipping Addresses (${addresses.length}/${MAX_ADDRESSES})`} action={addresses.length < MAX_ADDRESSES ? (
                <button type="button" onClick={handleOpenAddAddress} disabled={busy === "address"} className="inline-flex items-center gap-1.5 bg-black px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-neutral-800 disabled:bg-neutral-400">
                  <Plus className="h-3.5 w-3.5" /><span>Add Address</span>
                </button>
              ) : <span className="text-[12px] font-medium text-neutral-400">Max {MAX_ADDRESSES} addresses reached</span>}>
                {addresses.length === 0 ? (
                  <p className="text-[14px] text-neutral-500">No saved addresses yet. Add one to speed up checkout.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {addresses.map(address => (
                      <div key={address.id} className={`relative flex flex-col justify-between border p-4 transition-all ${address.isPrimary ? "border-black bg-neutral-50/70 shadow-xs" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-heading text-[14px] font-bold uppercase tracking-wider text-black">{address.label}</span>
                              {address.isPrimary && <span className="inline-flex items-center gap-1 bg-[#007cc3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Primary</span>}
                            </div>
                            <div className="flex items-center gap-1 text-neutral-400">
                              <button type="button" onClick={() => handleOpenEditAddress(address)} disabled={busy === "address"} className="p-1 hover:text-black" title="Edit address" aria-label={`Edit ${address.label}`}><Edit3 className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => handleDeleteAddress(address)} disabled={busy === "address"} className="p-1 hover:text-red-600" title="Delete address" aria-label={`Delete ${address.label}`}><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                          <div className="mt-2 text-[13px] leading-relaxed text-neutral-700">
                            <p className="font-semibold text-black">{address.recipientName}</p>
                            <p>{address.line1}</p>
                            {address.line2 && <p>{address.line2}</p>}
                            <p>{[address.city, address.region, address.postalCode].filter(Boolean).join(", ")}</p>
                            <p>{countryName(address.countryCode)}</p>
                            <p className="pt-0.5 text-[12px] text-neutral-500">Phone: {address.phone}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
                          <button type="button" onClick={() => handleSetPrimary(address)} disabled={address.isPrimary || busy === "address"} className="group flex items-center gap-2 text-left" title={address.isPrimary ? "Current primary address" : "Set as primary shipping address"}>
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${address.isPrimary ? "border-[#007cc3] bg-[#007cc3] text-white" : "border-neutral-300 bg-white group-hover:border-black"}`}>
                              {address.isPrimary ? <Check className="h-3 w-3 stroke-[3]" /> : <span className="h-1.5 w-1.5 rounded-full opacity-0 group-hover:bg-neutral-400 group-hover:opacity-100" />}
                            </span>
                            <span className={`text-[12px] font-medium transition-colors ${address.isPrimary ? "font-semibold text-[#007cc3]" : "text-neutral-600 group-hover:text-black"}`}>
                              {address.isPrimary ? "Primary address" : "Set as Primary"}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Sign-in & Security">
                {isStaff ? (
                  <div className="space-y-3 text-[13px] text-neutral-700">
                    <p className="flex items-start gap-2"><KeyRound className="mt-0.5 h-4 w-4 text-[#007cc3]" /> Staff accounts sign in with a password and MFA. Changing the password signs out every session, including this one.</p>
                    {!isPasswordChangeOpen ? (
                      <button type="button" onClick={() => { setPasswordError(null); setIsPasswordChangeOpen(true); }} className={linkButton}>Change password</button>
                    ) : (
                      <form name="password-change" onSubmit={handleChangePassword} className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass} htmlFor="currentPassword">Current password</label>
                            <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass} htmlFor="newPassword">New password (16–128)</label>
                            <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={16} maxLength={128} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className={inputClass} />
                          </div>
                        </div>
                        {renderError(passwordError)}
                        <div className="flex items-center justify-end gap-3">
                          <button type="button" onClick={() => setIsPasswordChangeOpen(false)} className={secondaryButton}>Cancel</button>
                          <button type="submit" disabled={busy === "password"} className={primaryButton}>Update password</button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 text-[13px] text-neutral-700">
                    <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 text-[#007cc3]" /> You sign in with a one-time code sent to your verified phone. There is no password to reset; if you can receive codes, you can always sign in.</p>
                    {!isPhoneChangeOpen ? (
                      <button type="button" onClick={() => { setPhoneChangeError(null); setPhoneChallenges(null); setIsPhoneChangeOpen(true); }} disabled={!profile.phone || !profile.phoneVerified} className={linkButton}>Change phone number</button>
                    ) : (
                      <div className="space-y-3 border border-neutral-200 p-4">
                        <p className="text-[12px] text-neutral-500">We send one code to your current number and one to the new number. After the change every session is signed out.</p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <label className={labelClass} htmlFor="newPhone">New phone number</label>
                            <input id="newPhone" name="newPhone" type="tel" placeholder="+77001234567" value={phoneChange.newPhone} onChange={e => setPhoneChange({ ...phoneChange, newPhone: e.target.value })} className={inputClass} />
                          </div>
                          <button type="button" onClick={handleSendPhoneChangeCodes} disabled={busy === "phone"} className={secondaryButton}>{phoneChallenges ? "Resend codes" : "Send codes"}</button>
                        </div>
                        {phoneChallenges && (
                          <form name="phone-change" onSubmit={handleChangePhone} className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className={labelClass} htmlFor="currentCode">Code sent to {profile.phone}</label>
                                <input id="currentCode" name="currentCode" inputMode="numeric" required pattern="[0-9]{6}" value={phoneChange.currentCode} onChange={e => setPhoneChange({ ...phoneChange, currentCode: e.target.value })} className={inputClass} />
                              </div>
                              <div>
                                <label className={labelClass} htmlFor="newCode">Code sent to the new number</label>
                                <input id="newCode" name="newCode" inputMode="numeric" required pattern="[0-9]{6}" value={phoneChange.newCode} onChange={e => setPhoneChange({ ...phoneChange, newCode: e.target.value })} className={inputClass} />
                              </div>
                            </div>
                            <div className="flex justify-end"><button type="submit" disabled={busy === "phone"} className={primaryButton}>Confirm new number</button></div>
                          </form>
                        )}
                        {renderError(phoneChangeError)}
                        <button type="button" onClick={() => setIsPhoneChangeOpen(false)} className="text-[12px] text-neutral-500 hover:text-black">Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {orders.length > 0 && (
                <Card title="Recent Order" action={
                  <button type="button" onClick={() => setTab("Orders")} className={linkButton}><span>View All Orders</span><ChevronRight className="h-3.5 w-3.5" /></button>
                }>
                  <button type="button" onClick={() => handleOpenOrder(orders[0].id)} className="group flex w-full flex-col justify-between gap-4 border border-neutral-200 bg-white p-4 text-left transition-all hover:border-black sm:flex-row sm:items-center">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-neutral-200 bg-neutral-50"><Package className="h-6 w-6 text-neutral-500" /></div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-black px-2 py-0.5 font-mono text-xs font-bold text-white">{orders[0].orderNumber}</span>
                          <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusTone(orders[0].fulfillmentStatus)}`}>{orders[0].fulfillmentStatus}</span>
                        </div>
                        <p className="mt-0.5 font-mono text-[12px] text-neutral-500">
                          Placed {formatDate(orders[0].createdAt)} · {orders[0].itemsCount} item(s){primaryAddress ? ` · Primary address: ${primaryAddress.label}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="g-heading text-lg font-bold text-black">{formatKzt(orders[0].total)}</span>
                  </button>
                </Card>
              )}
            </>
          )}

          {tab === "Orders" && (
            <>
              <Card title={`Order History (${orders.length}${nextCursor ? "+" : ""})`}>
                {orders.length === 0 ? (
                  <p className="text-[14px] text-neutral-500">No orders yet. Orders you place while signed in appear here.</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <button key={order.id} type="button" onClick={() => handleOpenOrder(order.id)} className="group block w-full border border-neutral-200 bg-white p-4 text-left transition-all hover:border-black hover:shadow-md">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="bg-black px-2.5 py-1 font-mono text-xs font-bold tracking-wider text-white">{order.orderNumber}</span>
                            <span className="font-mono text-xs text-neutral-500">Placed on {formatDate(order.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusTone(order.fulfillmentStatus)}`}>{order.fulfillmentStatus}</span>
                            <span className="border border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-neutral-700">{order.paymentStatus}</span>
                            <ChevronRight className="h-4 w-4 text-[#007cc3]" />
                          </div>
                        </div>
                        <div className="flex flex-col justify-between gap-2 pt-3 sm:flex-row sm:items-center">
                          <span className="text-[13px] text-neutral-600">{order.itemsCount} item(s)</span>
                          <span><span className="mr-2 font-mono text-xs text-neutral-400">Order Total</span><span className="g-heading text-lg font-bold text-black">{formatKzt(order.total)}</span></span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {renderError(ordersError)}
                {nextCursor && (
                  <div className="mt-4 flex justify-center">
                    <button type="button" onClick={handleLoadMoreOrders} disabled={busy === "orders"} className={secondaryButton}>Load more orders</button>
                  </div>
                )}
              </Card>

              <Card title="Claim a Previous Order">
                <p className="text-[13px] text-neutral-600">If our team gave you a claim receipt for an order placed before you had an account, enter it here. We confirm it with a code sent to {profile.phone ?? "your verified phone"}.</p>
                <form name="claim" onSubmit={handleClaim} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor="claimOrderId">Order reference</label>
                      <input id="claimOrderId" name="claimOrderId" required value={claim.orderId} onChange={e => setClaim({ ...claim, orderId: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="claimReceipt">Claim receipt</label>
                      <input id="claimReceipt" name="claimReceipt" required autoComplete="off" value={claim.receipt} onChange={e => setClaim({ ...claim, receipt: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <button type="button" onClick={handleSendClaimCode} disabled={!profile.phone || !profile.phoneVerified || busy === "claim"} className={secondaryButton}>{claimChallenge ? "Resend claim code" : "Send claim code"}</button>
                    {claimChallenge && (
                      <div className="flex-1">
                        <label className={labelClass} htmlFor="claimCode">6-digit code</label>
                        <input id="claimCode" name="claimCode" inputMode="numeric" required pattern="[0-9]{6}" value={claim.code} onChange={e => setClaim({ ...claim, code: e.target.value })} className={inputClass} />
                      </div>
                    )}
                  </div>
                  {renderError(claimError)}
                  <div className="flex justify-end"><button type="submit" disabled={!claimChallenge || busy === "claim"} className={primaryButton}>Claim order</button></div>
                </form>
              </Card>
            </>
          )}

          {tab === "Wishlist" && (
            <Card title="Wishlist">
              {renderError(wishlistError)}
              {wishlist === null && !wishlistError && <p className="flex items-center gap-2 text-[13px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading wishlist…</p>}
              {wishlist !== null && wishlist.length === 0 && <p className="text-[14px] text-neutral-500">Your wishlist is empty. Save products from their product page.</p>}
              {wishlist !== null && wishlist.length > 0 && (
                <ul className="divide-y divide-neutral-100 border border-neutral-200">
                  {wishlist.map(item => (
                    <li key={item.productKey} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        {item.archived ? <p className="font-semibold text-black">{item.name}</p> : <a href={`/p/${encodeURIComponent(item.productKey)}`} className="font-semibold text-black hover:text-[#007cc3]">{item.name}</a>}
                        <p className="text-[12px] text-neutral-500">
                          {item.availability === "available" ? formatKzt(item.price) : item.availability === "out_of_stock" ? `${formatKzt(item.price)} · Out of stock` : "This product is no longer available"}
                        </p>
                      </div>
                      <button type="button" onClick={() => removeFromWishlist(item.productKey)} aria-label={`Remove ${item.name} from wishlist`} className="text-neutral-400 hover:text-black"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "Devices" && (
            <Card title="Registered Devices">
              <p className="text-[14px] text-neutral-500">Device registration is not available yet.</p>
            </Card>
          )}

          {tab === "Subscriptions" && (
            <Card title="Subscriptions & Plans">
              <p className="text-[14px] text-neutral-500">You have no subscriptions. Subscription management is not available yet.</p>
            </Card>
          )}
        </div>
      </div>

      {selectedOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={() => setSelectedOrderId(null)}>
          <div role="dialog" aria-modal="true" aria-label="Order details" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-neutral-300 bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="g-heading text-lg font-bold uppercase tracking-wider text-black">{orderDetail ? orderDetail.orderNumber : "Order details"}</h3>
              <button type="button" onClick={() => setSelectedOrderId(null)} className="text-neutral-400 hover:text-black" aria-label="Close order details"><X className="h-5 w-5" /></button>
            </div>
            {!orderDetail && !orderDetailError && <p className="mt-4 flex items-center gap-2 text-[13px] text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading order…</p>}
            <div className="mt-4">{renderError(orderDetailError)}</div>
            {orderDetail && (
              <div className="space-y-5 text-[13px] text-neutral-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-neutral-500">Placed on {formatDate(orderDetail.createdAt)}</span>
                  <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusTone(orderDetail.fulfillmentStatus)}`}>{orderDetail.fulfillmentStatus}</span>
                  <span className="border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700">{orderDetail.paymentStatus}</span>
                </div>
                {orderDetail.dataQuality !== "complete" && <p className="border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">This order was imported from an earlier system. Some details were not recorded and are shown as “—”.</p>}
                <ul className="divide-y divide-neutral-100 border border-neutral-200">
                  {orderDetail.items.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="font-semibold text-black">{item.name}</p>
                        <p className="font-mono text-[11px] text-neutral-500">Qty {item.quantity} · {formatKzt(item.unitPrice)} each{Object.entries(item.options).map(([key, value]) => ` · ${key}: ${value}`).join("")}</p>
                      </div>
                      <span className="font-semibold text-black">{formatKzt(item.total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="contents"><dt>Subtotal</dt><dd className="text-right">{formatKzt(orderDetail.subtotal)}</dd></div>
                  <div className="contents"><dt>Discount</dt><dd className="text-right">{formatKzt(orderDetail.discount)}</dd></div>
                  <div className="contents"><dt>Shipping</dt><dd className="text-right">{formatKzt(orderDetail.shipping)}</dd></div>
                  <div className="contents"><dt>Tax</dt><dd className="text-right">{formatKzt(orderDetail.tax)}</dd></div>
                  <div className="contents font-semibold text-black"><dt>Total</dt><dd className="text-right">{formatKzt(orderDetail.total)}</dd></div>
                </dl>
                <div>
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Delivery address</h4>
                  {deliveryAddressLines(orderDetail.deliveryAddress).length ? (
                    <div className="mt-1 leading-relaxed">{deliveryAddressLines(orderDetail.deliveryAddress).map((line, index) => <p key={index}>{line}</p>)}</div>
                  ) : <p className="mt-1 text-neutral-500">No delivery address on record.</p>}
                </div>
                {orderDetail.events.length > 0 && (
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Order updates</h4>
                    <ol className="mt-1 space-y-1">
                      {orderDetail.events.map(event => <li key={event.id} className="flex justify-between gap-3"><span>{event.label}</span><span className="font-mono text-[11px] text-neutral-500">{formatDate(event.occurredAt)}</span></li>)}
                    </ol>
                  </div>
                )}
                {(orderDetail.shipments?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Shipments</h4>
                    <ul className="mt-1 space-y-1">
                      {orderDetail.shipments.map(shipment => (
                        <li key={shipment.id} className="flex justify-between gap-3">
                          <span>{shipment.items.map(line => `${line.quantity}× ${orderDetail.items.find(item => item.id === line.orderItemId)?.name ?? "item"}`).join(", ")}</span>
                          <span className="font-mono text-[11px] text-neutral-500">{shipment.status === "delivered" ? `Delivered ${formatDate(shipment.deliveredAt ?? shipment.dispatchedAt)}` : `Shipped ${formatDate(shipment.dispatchedAt)}`}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isAddressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onClick={() => setIsAddressModalOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={editingAddress ? "Edit shipping address" : "Add shipping address"} className="w-full max-w-lg border border-neutral-300 bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="g-heading text-lg font-bold uppercase tracking-wider text-black">{editingAddress ? "Edit Shipping Address" : "Add New Shipping Address"}</h3>
              <button type="button" onClick={() => setIsAddressModalOpen(false)} className="text-neutral-400 hover:text-black" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <form name="address" onSubmit={handleSaveAddress} className="mt-4 space-y-3">
              <div>
                <label className={labelClass} htmlFor="addressLabel">Address Title (e.g. Home, Office) *</label>
                <input id="addressLabel" name="label" required maxLength={60} value={addressForm.label} onChange={e => setAddressForm({ ...addressForm, label: e.target.value })} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="addressRecipient">Recipient Name *</label>
                  <input id="addressRecipient" name="recipientName" required maxLength={200} value={addressForm.recipientName} onChange={e => setAddressForm({ ...addressForm, recipientName: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="addressPhone">Contact Phone *</label>
                  <input id="addressPhone" name="phone" type="tel" required placeholder="+77001234567" value={addressForm.phone} onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="addressLine1">Street Address *</label>
                <input id="addressLine1" name="line1" required maxLength={200} value={addressForm.line1} onChange={e => setAddressForm({ ...addressForm, line1: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="addressLine2">Apartment, suite (optional)</label>
                <input id="addressLine2" name="line2" maxLength={200} value={addressForm.line2 ?? ""} onChange={e => setAddressForm({ ...addressForm, line2: e.target.value })} className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass} htmlFor="addressCity">City *</label>
                  <input id="addressCity" name="city" required maxLength={120} value={addressForm.city} onChange={e => setAddressForm({ ...addressForm, city: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="addressRegion">Region</label>
                  <input id="addressRegion" name="region" maxLength={120} value={addressForm.region ?? ""} onChange={e => setAddressForm({ ...addressForm, region: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="addressPostal">Postal Code</label>
                  <input id="addressPostal" name="postalCode" maxLength={20} value={addressForm.postalCode ?? ""} onChange={e => setAddressForm({ ...addressForm, postalCode: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="addressCountry">Country *</label>
                <select id="addressCountry" name="countryCode" value={addressForm.countryCode} onChange={e => setAddressForm({ ...addressForm, countryCode: e.target.value })} className={inputClass}>
                  {COUNTRY_OPTIONS.map(option => <option key={option.code} value={option.code}>{option.name}</option>)}
                </select>
              </div>
              {!(editingAddress?.isPrimary) && (
                <label className="flex cursor-pointer items-center gap-2 pt-2">
                  <input type="checkbox" name="isPrimary" checked={addressForm.isPrimary} onChange={e => setAddressForm({ ...addressForm, isPrimary: e.target.checked })} className="h-4 w-4 accent-black" />
                  <span className="text-xs font-medium text-neutral-700">Set as Primary Shipping Address</span>
                </label>
              )}
              {renderError(addressError)}
              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-4">
                <button type="button" onClick={() => setIsAddressModalOpen(false)} className={secondaryButton}>Cancel</button>
                <button type="submit" disabled={busy === "address"} className={primaryButton}>{editingAddress ? "Save Changes" : "Add Address"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
