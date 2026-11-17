"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Check,
  Plus,
  Trash2,
  Edit3,
  X,
  AlertCircle,
  Lock,
  KeyRound,
  Package,
  Truck,
  Eye,
  Calendar,
  MapPin,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { AccountIcon } from "@/components/icons";
import type { Order } from "@/lib/cms/types";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import { formatOrderDate } from "@/lib/cms/order-lifecycle";
import {
  type ShippingAddress,
  type UserProfile,
  MAX_SHIPPING_ADDRESSES,
  DEFAULT_COUNTRY,
  DEFAULT_CITY,
  KAZAKHSTAN_CITIES,
  AVAILABLE_COUNTRIES,
  setPrimaryAddress,
  addShippingAddress,
  updateShippingAddress,
  deleteShippingAddress,
  updateProfileDetails,
} from "@/lib/account-addresses";

const TABS = ["Profile", "Orders", "Devices", "Subscriptions"] as const;
type Tab = (typeof TABS)[number];

const initialProfile: UserProfile = {
  name: "Alex Rivera",
  email: "alex.rivera@example.com",
  phone: "+7 (727) 355-1234",
  country: DEFAULT_COUNTRY,
  city: DEFAULT_CITY,
  birthDate: "1994-05-18",
};

const initialAddresses: ShippingAddress[] = [
  {
    id: "addr-1",
    title: "Home",
    name: "Alex Rivera",
    street: "Dostyk Ave 105, Apt 42",
    city: "Almaty",
    state: "Almaty",
    zip: "050000",
    country: "Kazakhstan",
    phone: "+7 (727) 355-1234",
    isPrimary: true,
  },
  {
    id: "addr-2",
    title: "Office",
    name: "Alex Rivera",
    street: "Mangilik El Ave 55, Business Center",
    city: "Astana",
    state: "Astana",
    zip: "010000",
    country: "Kazakhstan",
    phone: "+7 (7172) 79-5555",
    isPrimary: false,
  },
];

const initialAccountOrders: Order[] = [
  {
    id: "ord-alex-103490",
    orderNumber: "GRM-103490",
    clientName: "Alex Rivera",
    clientEmail: "alex.rivera@example.com",
    clientPhone: "+7 (727) 355-1234",
    total: 149.99,
    itemsCount: 2,
    items: [
      {
        productId: "hrm-pro-plus",
        name: "HRM-Pro™ Plus Heart Rate Strap",
        price: 129.99,
        quantity: 1,
        image: "/images/products/1316397.jpg",
      },
      {
        productId: "quickfit-22",
        name: "QuickFit® 22 Silicone Band",
        price: 20.0,
        quantity: 1,
        image: "/images/products/1228429.jpg",
      },
    ],
    paymentStatus: "paid",
    fulfillmentStatus: "shipped",
    shippingAddress: "Dostyk Ave 105, Apt 42, Almaty, 050000, Kazakhstan",
    comments: "Please call 30 minutes before arrival.",
    trackingNumber: "DHL-KZ-992014",
    carrier: "DHL Air Express",
    createdAt: "2026-11-08T09:15:00.000Z",
  },
  {
    id: "ord-alex-100482",
    orderNumber: "GRM-100482",
    clientName: "Alex Rivera",
    clientEmail: "alex.rivera@example.com",
    clientPhone: "+7 (727) 355-1234",
    total: 1099.99,
    itemsCount: 1,
    items: [
      {
        productId: "fenix8-47",
        name: "fēnix® 8 – 47 mm, AMOLED",
        price: 1099.99,
        quantity: 1,
        image: "/images/products/fenix8-cf.jpg",
      },
    ],
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    shippingAddress: "Dostyk Ave 105, Apt 42, Almaty, 050000, Kazakhstan",
    comments: "Please leave at reception desk if unavailable.",
    trackingNumber: "KAZPOST-ALM-849201",
    carrier: "KazPost Express Courier",
    createdAt: "2026-07-03T10:14:00.000Z",
  },
  {
    id: "ord-alex-098211",
    orderNumber: "GRM-098211",
    clientName: "Alex Rivera",
    clientEmail: "alex.rivera@example.com",
    clientPhone: "+7 (727) 355-1234",
    total: 249.99,
    itemsCount: 1,
    items: [
      {
        productId: "instinct-3",
        name: "Instinct® 3 - Rugged GPS",
        price: 249.99,
        quantity: 1,
        image: "/images/products/1316397.jpg",
      },
    ],
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    shippingAddress: "Mangilik El Ave 55, Business Center, Astana, 010000, Kazakhstan",
    comments: "Office building delivery. Access card required.",
    trackingNumber: "DHL-KZ-918237",
    carrier: "DHL Express Worldwide",
    createdAt: "2026-05-18T14:30:00.000Z",
  },
  {
    id: "ord-alex-091775",
    orderNumber: "GRM-091775",
    clientName: "Alex Rivera",
    clientEmail: "alex.rivera@example.com",
    clientPhone: "+7 (727) 355-1234",
    total: 299.99,
    itemsCount: 1,
    items: [
      {
        productId: "vivoactive-6",
        name: "vívoactive® 6 - Health Smartwatch",
        price: 299.99,
        quantity: 1,
        image: "/images/products/1228429.jpg",
      },
    ],
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    shippingAddress: "Dostyk Ave 105, Apt 42, Almaty, 050000, Kazakhstan",
    comments: "Call recipient on mobile upon arrival.",
    trackingNumber: "KAZPOST-ALM-102948",
    carrier: "KazPost Express Courier",
    createdAt: "2026-02-02T11:20:00.000Z",
  },
];

const devices = [
  { name: "fēnix® 8 – 47 mm", serial: "6J2004921", registered: "July 5, 2026", image: "/images/products/fenix8-cf.jpg" },
  { name: "Instinct® 3", serial: "7A1188342", registered: "May 20, 2026", image: "/images/products/1316397.jpg" },
];

const subscriptions = [
  { name: "Outdoor Maps+", plan: "Annual", renews: "July 8, 2027", price: "$49.99/yr", active: true },
  { name: "inReach® Standard", plan: "Monthly", renews: "Aug 1, 2026", price: "$34.99/mo", active: true },
];

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
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

export function AccountDashboard() {
  const [tab, setTab] = useState<Tab>("Profile");

  // Profile State
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfile>(initialProfile);
  const [isCustomCity, setIsCustomCity] = useState(false);

  // Address State (Maximum 5)
  const [addresses, setAddresses] = useState<ShippingAddress[]>(initialAddresses);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState({
    title: "",
    name: "",
    street: "",
    city: DEFAULT_CITY,
    state: "",
    zip: "",
    country: DEFAULT_COUNTRY,
    phone: "",
    isPrimary: false,
  });

  // Orders State & Interactive Details Modal
  const [customerOrders, setCustomerOrders] = useState<Order[]>(initialAccountOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Reset Password Modal State
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPasswordStatus, setResetPasswordStatus] = useState<string | null>(null);

  // Feedback Notification
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showNotification = (text: string, type: "success" | "error" = "success") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 4500);
  };

  // Synchronize orders with API / admin store
  useEffect(() => {
    fetch(`/api/account/orders?email=${encodeURIComponent(profile.email)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Orders response not ok");
        return res.json();
      })
      .then((data) => {
        if (data.orders && Array.isArray(data.orders) && data.orders.length > 0) {
          setCustomerOrders(data.orders);
        }
      })
      .catch((err) => {
        console.warn("Could not sync remote orders, using local store data:", err);
      });
  }, [profile.email]);

  // Profile Handlers
  const handleStartEditProfile = () => {
    setProfileForm(profile);
    setIsCustomCity(!KAZAKHSTAN_CITIES.includes(profile.city as (typeof KAZAKHSTAN_CITIES)[number]));
    setIsEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setProfileForm(profile);
    setIsEditingProfile(false);
  };

  const handleCountryChange = (newCountry: string) => {
    setProfileForm({
      ...profileForm,
      country: newCountry,
      city: newCountry === DEFAULT_COUNTRY ? DEFAULT_CITY : "",
    });
    setIsCustomCity(newCountry !== DEFAULT_COUNTRY);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "__custom__") {
      setIsCustomCity(true);
      setProfileForm({ ...profileForm, city: "" });
    } else {
      setProfileForm({ ...profileForm, city: val });
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      showNotification("Name and email are required fields.", "error");
      return;
    }
    const updated = updateProfileDetails(profile, {
      name: profileForm.name,
      email: profileForm.email,
      phone: profileForm.phone,
      country: profileForm.country,
      city: profileForm.city,
    });
    setProfile(updated);
    setIsEditingProfile(false);
    showNotification("Personal details successfully updated.", "success");
  };

  // Password Reset Trigger
  const handleTriggerPasswordReset = () => {
    setResetPasswordStatus(null);
    setIsResetPasswordModalOpen(true);
  };

  const handleConfirmPasswordReset = () => {
    setResetPasswordStatus(`Password reset instructions sent to ${profile.email}`);
    setTimeout(() => {
      setIsResetPasswordModalOpen(false);
      setResetPasswordStatus(null);
      showNotification(`Password reset link dispatched to ${profile.email}`);
    }, 1800);
  };

  // Address Handlers
  const handleOpenAddAddress = () => {
    if (addresses.length >= MAX_SHIPPING_ADDRESSES) {
      showNotification(
        `Maximum limit of ${MAX_SHIPPING_ADDRESSES} shipping addresses reached. Please remove one before adding.`,
        "error"
      );
      return;
    }
    setEditingAddressId(null);
    setAddressForm({
      title: "",
      name: profile.name,
      street: "",
      city: profile.city || DEFAULT_CITY,
      state: "",
      zip: "",
      country: profile.country || DEFAULT_COUNTRY,
      phone: profile.phone,
      isPrimary: addresses.length === 0,
    });
    setIsAddressModalOpen(true);
  };

  const handleOpenEditAddress = (addr: ShippingAddress) => {
    setEditingAddressId(addr.id);
    setAddressForm({
      title: addr.title,
      name: addr.name,
      street: addr.street,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      country: addr.country,
      phone: addr.phone || "",
      isPrimary: addr.isPrimary,
    });
    setIsAddressModalOpen(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!addressForm.title.trim()) {
        showNotification("Address Title (e.g. Home, Office, 2nd Home) is required.", "error");
        return;
      }
      if (!addressForm.street.trim() || !addressForm.city.trim() || !addressForm.country.trim()) {
        showNotification("Street, City, and Country are required.", "error");
        return;
      }

      if (editingAddressId) {
        const updatedList = updateShippingAddress(addresses, {
          id: editingAddressId,
          ...addressForm,
        });
        setAddresses(updatedList);
        showNotification("Shipping address updated successfully.");
      } else {
        const newAddress: ShippingAddress = {
          id: `addr-${Date.now()}`,
          ...addressForm,
        };
        const updatedList = addShippingAddress(addresses, newAddress);
        setAddresses(updatedList);
        showNotification("New shipping address saved.");
      }
      setIsAddressModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving address.";
      showNotification(msg, "error");
    }
  };

  const handleDeleteAddress = (id: string) => {
    const target = addresses.find((a) => a.id === id);
    if (!target) return;
    if (confirm(`Remove shipping address "${target.title}"?`)) {
      const updatedList = deleteShippingAddress(addresses, id);
      setAddresses(updatedList);
      showNotification(`Address "${target.title}" removed.`);
    }
  };

  const handleSetPrimary = (id: string) => {
    const updated = setPrimaryAddress(addresses, id);
    setAddresses(updated);
    const chosen = updated.find((a) => a.id === id);
    showNotification(`"${chosen?.title || "Selected address"}" is now set as your primary address for all orders.`);
  };

  const primaryAddress = addresses.find((a) => a.isPrimary) || addresses[0];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 font-sans">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 border px-5 py-3 shadow-xl transition-all ${
            statusMessage.type === "error"
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-black bg-black text-white"
          }`}
        >
          {statusMessage.type === "error" ? (
            <AlertCircle className="h-4 w-4 text-red-600" />
          ) : (
            <Check className="h-4 w-4 text-[#007cc3]" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider">{statusMessage.text}</span>
        </div>
      )}

      {/* Header Profile Summary */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center border-b border-neutral-200 pb-6">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-100 text-neutral-600">
          <AccountIcon className="h-8 w-8" />
        </div>
        <div>
          <h1 className="g-heading text-[28px] font-semibold text-black uppercase tracking-wide">
            {profile.name}
          </h1>
          <p className="text-[13px] text-neutral-500 font-mono">
            {profile.email} · {profile.city}, {profile.country} · Member since 2021
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        {/* Navigation Sidebar */}
        <nav className="lg:border-r lg:border-neutral-200">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:pr-4">
            {TABS.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => setTab(t)}
                  className={`w-full whitespace-nowrap px-4 py-2.5 text-left text-[14px] transition-colors ${
                    tab === t
                      ? "bg-black text-white font-medium lg:border-l-4 lg:border-[#007cc3]"
                      : "text-neutral-600 hover:text-black hover:bg-neutral-100/60"
                  }`}
                >
                  {t}
                  {t === "Orders" && (
                    <span className="ml-2 px-1.5 py-0.5 text-[11px] bg-neutral-200 text-neutral-800 font-mono">
                      {customerOrders.length}
                    </span>
                  )}
                </button>
              </li>
            ))}
            <li className="pt-2">
              <button
                type="button"
                onClick={() => showNotification("Signed out from session.")}
                className="w-full px-4 py-2 text-left text-[13px] text-neutral-400 hover:text-black transition-colors"
              >
                Sign Out
              </button>
            </li>
          </ul>
        </nav>

        {/* Tab Content Display */}
        <div className="space-y-6">
          {/* ======================================================== */}
          {/* PROFILE TAB                                             */}
          {/* ======================================================== */}
          {tab === "Profile" && (
            <>
              {/* Account Details Box */}
              <Card
                title="Account Details"
                action={
                  !isEditingProfile ? (
                    <button
                      type="button"
                      onClick={handleStartEditProfile}
                      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#007cc3] hover:underline"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit Details</span>
                    </button>
                  ) : null
                }
              >
                {!isEditingProfile ? (
                  <dl className="grid grid-cols-1 gap-4 text-[14px] sm:grid-cols-2">
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Full Name</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.name}</dd>
                    </div>

                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Email Address</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.email}</dd>
                    </div>

                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Phone Number</dt>
                      <dd className="mt-1 font-semibold text-black">{profile.phone}</dd>
                    </div>

                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">City, Country</dt>
                      <dd className="mt-1 font-semibold text-black">
                        {profile.city}, {profile.country}
                      </dd>
                    </div>

                    {/* Birth Date (Immutable) */}
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3">
                      <div className="flex items-center justify-between">
                        <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Birth Date</dt>
                        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      </div>
                      <dd className="mt-1 font-semibold text-black">
                        {profile.birthDate
                          ? new Date(profile.birthDate + "T00:00:00").toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "Not provided"}
                      </dd>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        Verified during registration (immutable).
                      </p>
                    </div>

                    {/* Password */}
                    <div className="border border-neutral-100 bg-neutral-50/50 p-3 flex flex-col justify-between">
                      <div>
                        <dt className="text-[12px] font-medium uppercase tracking-wider text-neutral-500">Password</dt>
                        <dd className="mt-1 text-black font-mono">••••••••</dd>
                      </div>
                      <div className="mt-2 pt-2 border-t border-neutral-200/60">
                        <button
                          type="button"
                          onClick={handleTriggerPasswordReset}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#007cc3] hover:underline"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>Reset Password</span>
                        </button>
                      </div>
                    </div>
                  </dl>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-[12px] font-semibold uppercase tracking-wider text-neutral-600">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={profileForm.name}
                          onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                          className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold uppercase tracking-wider text-neutral-600">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={profileForm.email}
                          onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                          className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold uppercase tracking-wider text-neutral-600">
                          Phone Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[12px] font-semibold uppercase tracking-wider text-neutral-600">
                          Country *
                        </label>
                        <select
                          value={profileForm.country}
                          onChange={(e) => handleCountryChange(e.target.value)}
                          className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                        >
                          {AVAILABLE_COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[12px] font-semibold uppercase tracking-wider text-neutral-600">
                          City *
                        </label>
                        {profileForm.country === DEFAULT_COUNTRY && !isCustomCity ? (
                          <div className="mt-1 flex gap-2">
                            <select
                              value={profileForm.city}
                              onChange={handleCityChange}
                              className="w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                            >
                              {KAZAKHSTAN_CITIES.map((city) => (
                                <option key={city} value={city}>
                                  {city}
                                </option>
                              ))}
                              <option value="__custom__">+ Other / Not Listed...</option>
                            </select>
                          </div>
                        ) : (
                          <div className="mt-1 flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Enter your city name"
                              value={profileForm.city}
                              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                              className="w-full border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black focus:border-black focus:outline-none"
                            />
                            {profileForm.country === DEFAULT_COUNTRY && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCustomCity(false);
                                  setProfileForm({ ...profileForm, city: DEFAULT_CITY });
                                }}
                                className="shrink-0 border border-neutral-300 px-3 text-xs font-semibold uppercase hover:bg-neutral-100"
                              >
                                Select List
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                      <button
                        type="button"
                        onClick={handleCancelEditProfile}
                        className="border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-black px-6 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-neutral-800"
                      >
                        Save Details
                      </button>
                    </div>
                  </form>
                )}
              </Card>

              {/* Shipping Addresses Section (Max 5) */}
              <Card
                title={`Shipping Addresses (${addresses.length}/${MAX_SHIPPING_ADDRESSES})`}
                action={
                  addresses.length < MAX_SHIPPING_ADDRESSES ? (
                    <button
                      type="button"
                      onClick={handleOpenAddAddress}
                      className="inline-flex items-center gap-1.5 bg-black px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wider text-white hover:bg-neutral-800 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Address</span>
                    </button>
                  ) : (
                    <span className="text-[12px] font-medium text-neutral-400">
                      Max {MAX_SHIPPING_ADDRESSES} addresses reached
                    </span>
                  )
                }
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {addresses.map((addr) => {
                    const isPrimary = addr.isPrimary;
                    return (
                      <div
                        key={addr.id}
                        className={`relative flex flex-col justify-between border p-4 transition-all ${
                          isPrimary
                            ? "border-black bg-neutral-50/70 shadow-xs"
                            : "border-neutral-200 bg-white hover:border-neutral-300"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-heading text-[14px] font-bold uppercase tracking-wider text-black">
                                {addr.title}
                              </span>
                              {isPrimary && (
                                <span className="inline-flex items-center gap-1 bg-[#007cc3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-neutral-400">
                              <button
                                type="button"
                                onClick={() => handleOpenEditAddress(addr)}
                                className="p-1 hover:text-black"
                                title="Edit address"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              {addresses.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAddress(addr.id)}
                                  className="p-1 hover:text-red-600"
                                  title="Delete address"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 text-[13px] leading-relaxed text-neutral-700">
                            <p className="font-semibold text-black">{addr.name}</p>
                            <p>{addr.street}</p>
                            <p>
                              {addr.city}, {addr.state} {addr.zip}
                            </p>
                            <p>{addr.country}</p>
                            {addr.phone && <p className="text-[12px] text-neutral-500 pt-0.5">Phone: {addr.phone}</p>}
                          </div>
                        </div>

                        {/* Set Primary Address Tick */}
                        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(addr.id)}
                            className="group flex items-center gap-2 text-left"
                            title={isPrimary ? "Current primary address" : "Set as primary shipping address"}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                isPrimary
                                  ? "border-[#007cc3] bg-[#007cc3] text-white"
                                  : "border-neutral-300 bg-white group-hover:border-black"
                              }`}
                            >
                              {isPrimary ? (
                                <Check className="h-3 w-3 stroke-[3]" />
                              ) : (
                                <span className="h-1.5 w-1.5 rounded-full opacity-0 group-hover:bg-neutral-400 group-hover:opacity-100" />
                              )}
                            </span>
                            <span
                              className={`text-[12px] font-medium transition-colors ${
                                isPrimary ? "text-[#007cc3] font-semibold" : "text-neutral-600 group-hover:text-black"
                              }`}
                            >
                              {isPrimary ? "Primary address (used in every order)" : "Set as Primary"}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Recent Order Preview */}
              {customerOrders.length > 0 && (
                <Card
                  title="Recent Order"
                  action={
                    <button
                      type="button"
                      onClick={() => setTab("Orders")}
                      className="text-[13px] font-semibold text-[#007cc3] hover:underline flex items-center gap-1"
                    >
                      <span>View All Orders</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  }
                >
                  <div
                    onClick={() => setSelectedOrder(customerOrders[0])}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-neutral-200 bg-white hover:border-black cursor-pointer transition-all group gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative h-14 w-14 shrink-0 bg-neutral-50 border border-neutral-200 p-1 flex items-center justify-center">
                        <Image
                          src={customerOrders[0].items[0]?.image || "/images/products/fenix8-cf.jpg"}
                          alt={customerOrders[0].items[0]?.name || "Garmin Product"}
                          width={52}
                          height={52}
                          className="object-contain max-h-full max-w-full"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs bg-black text-white px-2 py-0.5">
                            {customerOrders[0].orderNumber || customerOrders[0].id}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                              customerOrders[0].fulfillmentStatus === "delivered"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : customerOrders[0].fulfillmentStatus === "shipped"
                                ? "bg-sky-50 text-sky-800 border-sky-300"
                                : "bg-amber-50 text-amber-800 border-amber-300"
                            }`}
                          >
                            {customerOrders[0].fulfillmentStatus}
                          </span>
                        </div>
                        <p className="font-semibold text-sm text-black mt-1">
                          {customerOrders[0].items[0]?.name || "Garmin Equipment"}
                          {customerOrders[0].items.length > 1 && (
                            <span className="text-xs text-neutral-500 font-normal">
                              {" "}
                              + {customerOrders[0].items.length - 1} other item(s)
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-neutral-500 font-mono mt-0.5">
                          Placed {formatOrderDate(customerOrders[0].createdAt)} · Destination: {primaryAddress.title} ({primaryAddress.city})
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-100">
                      <span className="g-heading text-lg font-bold text-black">
                        ${customerOrders[0].total.toFixed(2)}
                      </span>
                      <span className="text-[12px] font-semibold text-[#007cc3] group-hover:underline inline-flex items-center gap-1 mt-1">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect Route Map →</span>
                      </span>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ======================================================== */}
          {/* ORDERS TAB (COMPREHENSIVE ORDER LIST & ROUTE POPUP)     */}
          {/* ======================================================== */}
          {tab === "Orders" && (
            <Card
              title={`Order History & Fulfillment Tracker (${customerOrders.length})`}
              action={
                <span className="text-xs text-neutral-500 font-mono hidden sm:inline-block">
                  Click any order to view details &amp; route map
                </span>
              }
            >
              <div className="space-y-4">
                {customerOrders.map((ord) => {
                  const firstItem = ord.items[0];
                  return (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className="border border-neutral-200 bg-white p-4 hover:border-black hover:shadow-md cursor-pointer transition-all group"
                    >
                      {/* Top Bar: Order Number, Date, Status */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="bg-black text-white font-mono text-xs font-bold px-2.5 py-1 tracking-wider">
                            {ord.orderNumber || ord.id}
                          </span>
                          <span className="text-xs text-neutral-500 font-mono">
                            Placed on {formatOrderDate(ord.createdAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${
                              ord.fulfillmentStatus === "delivered"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : ord.fulfillmentStatus === "shipped"
                                ? "bg-sky-50 text-sky-800 border-sky-300"
                                : ord.fulfillmentStatus === "processing"
                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                : "bg-neutral-100 text-neutral-800 border-neutral-300"
                            }`}
                          >
                            {ord.fulfillmentStatus}
                          </span>
                          <span className="text-xs text-[#007cc3] group-hover:translate-x-0.5 transition-transform">
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </div>
                      </div>

                      {/* Middle: Product Line Preview */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-14 shrink-0 bg-neutral-50 border border-neutral-200 p-1 flex items-center justify-center">
                            <Image
                              src={firstItem?.image || "/images/products/1228429.jpg"}
                              alt={firstItem?.name || "Garmin Product"}
                              width={50}
                              height={50}
                              className="object-contain max-h-full max-w-full"
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-black">
                              {firstItem?.name || "Garmin Device"}
                            </p>
                            {ord.items.length > 1 && (
                              <p className="text-xs text-neutral-500">
                                + {ord.items.length - 1} additional product(s)
                              </p>
                            )}
                            <p className="text-[11px] text-neutral-400 font-mono mt-0.5 truncate max-w-md">
                              Shipping to: {ord.shippingAddress}
                            </p>
                          </div>
                        </div>

                        <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-100">
                          <span className="text-xs text-neutral-400 block font-mono">Order Total</span>
                          <span className="g-heading text-lg font-bold text-black">
                            ${ord.total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Route Quick Hint */}
                      <div className="mt-1 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-[#007cc3]" />
                          <span>
                            Carrier: <strong className="text-black font-semibold">{ord.carrier || "Garmin Priority"}</strong>
                            {ord.trackingNumber && ` · Tracking #${ord.trackingNumber}`}
                          </span>
                        </div>
                        <span className="font-semibold text-[#007cc3] group-hover:underline">
                          View Order Popup &amp; Route Map →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* DEVICES TAB */}
          {tab === "Devices" && (
            <Card
              title="Registered Devices"
              action={
                <button
                  type="button"
                  onClick={() => showNotification("Device registration form opened.")}
                  className="text-[13px] text-[#007cc3] underline font-semibold"
                >
                  Register a device
                </button>
              }
            >
              <ul className="divide-y divide-neutral-200">
                {devices.map((d) => (
                  <li key={d.serial} className="flex items-center gap-4 py-4">
                    <div className="relative h-14 w-14 shrink-0 border border-neutral-200 bg-neutral-50 flex items-center justify-center p-1">
                      <Image
                        src={d.image}
                        alt={d.name}
                        width={50}
                        height={50}
                        className="object-contain"
                      />
                    </div>
                    <div>
                      <p className="g-heading text-[16px] font-semibold text-black">{d.name}</p>
                      <p className="text-[13px] text-neutral-500 font-mono">
                        Serial: {d.serial} · Registered {d.registered}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* SUBSCRIPTIONS TAB */}
          {tab === "Subscriptions" && (
            <Card title="Subscriptions &amp; Plans">
              <ul className="divide-y divide-neutral-200">
                {subscriptions.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <div>
                      <p className="g-heading text-[16px] font-semibold text-black">{s.name}</p>
                      <p className="text-[13px] text-neutral-500 font-mono">
                        {s.plan} · Renews {s.renews}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px] font-semibold text-black">{s.price}</p>
                      <span className="text-[12px] font-bold text-emerald-700 uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* ORDER DETAILS POPUP MODAL (ITEMIZED PRODUCTS & ROUTE MAP)*/}
      {/* ======================================================== */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      {/* ======================================================== */}
      {/* SHIPPING ADDRESS MODAL (ADD / EDIT)                      */}
      {/* ======================================================== */}
      {isAddressModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsAddressModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white border border-neutral-300 p-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="g-heading text-lg font-bold uppercase tracking-wider text-black">
                {editingAddressId ? "Edit Shipping Address" : "Add New Shipping Address"}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddressModalOpen(false)}
                className="text-neutral-400 hover:text-black"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                  Address Title (e.g. Home, Office, 2nd Home, Summer House) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2nd Home, Villa, Office"
                  value={addressForm.title}
                  onChange={(e) => setAddressForm({ ...addressForm, title: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                  Recipient Name *
                </label>
                <input
                  type="text"
                  required
                  value={addressForm.name}
                  onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                  Street Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street name, building, apartment/suite"
                  value={addressForm.street}
                  onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                  className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    Postal / Zip Code
                  </label>
                  <input
                    type="text"
                    value={addressForm.zip}
                    onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })}
                    className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    Country *
                  </label>
                  <select
                    value={addressForm.country}
                    onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                    className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                  >
                    {AVAILABLE_COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    className="mt-1 w-full border border-neutral-300 px-3 py-2 text-xs focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addressForm.isPrimary}
                    onChange={(e) => setAddressForm({ ...addressForm, isPrimary: e.target.checked })}
                    className="h-4 w-4 accent-black"
                  />
                  <span className="text-xs text-neutral-700 font-medium">
                    Set as Primary Shipping Address (used by default for all orders)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(false)}
                  className="border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-black text-white px-5 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-neutral-800"
                >
                  {editingAddressId ? "Save Changes" : "Add Address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* RESET PASSWORD MODAL                                    */}
      {/* ======================================================== */}
      {isResetPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setIsResetPasswordModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white border border-neutral-300 p-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="g-heading text-base font-bold uppercase tracking-wider text-black flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#007cc3]" />
                Password Reset Request
              </h3>
              <button
                type="button"
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="text-neutral-400 hover:text-black"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-neutral-600 leading-relaxed">
                Clicking confirm will send an encrypted password recovery token to your registered email:
              </p>
              <div className="bg-neutral-50 border border-neutral-200 p-3 font-mono text-xs font-bold text-black">
                {profile.email}
              </div>

              {resetPasswordStatus && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 text-xs flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>{resetPasswordStatus}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordModalOpen(false)}
                  className="border border-neutral-300 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-700 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPasswordReset}
                  className="bg-black text-white px-5 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-neutral-800"
                >
                  Send Reset Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
