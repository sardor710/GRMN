"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Save,
  CheckCircle2,
  Globe,
  CreditCard,
  Search,
} from "lucide-react";
import type { StoreSettings } from "@/lib/cms/types";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (data.settings) setSettings(data.settings);
      } catch (err) {
        console.error("Error loading settings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="py-12 text-center text-[#737b8c]">Loading store settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#232732] pb-5">
        <div>
          <h1 className="font-heading uppercase tracking-wider text-2xl font-bold text-white flex items-center gap-2.5">
            <Settings className="h-6 w-6 text-[#007cc3]" />
            <span>Store Configuration & Global Settings</span>
          </h1>
          <p className="text-[13px] text-[#8a92a3] mt-1 font-sans">
            Global store metadata, currency formatting, Garmin Pay toggles, and SEO defaults.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 bg-[#007cc3] px-5 py-2 text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae] disabled:opacity-50"
        >
          {saving ? (
            <span>Saving...</span>
          ) : savedSuccess ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-[#4ade80]" /> Saved!
            </span>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Settings</span>
            </>
          )}
        </button>
      </div>

      {savedSuccess && (
        <div className="border border-[#4ade80]/30 bg-[#1e2a22] p-3 text-[13px] text-[#4ade80] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Store settings have been updated and persisted to configuration.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Store Details */}
        <div className="border border-[#262c39] bg-[#141720] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#232732] pb-3">
            <Globe className="h-4 w-4 text-[#007cc3]" />
            <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">General Information</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Storefront Name *
              </label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Support Contact Email *
              </label>
              <input
                type="email"
                required
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Support Helpline Phone
              </label>
              <input
                type="text"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Free Shipping Threshold ($)
              </label>
              <input
                type="number"
                value={settings.freeShippingThreshold}
                onChange={(e) => setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Currency & Tax */}
        <div className="border border-[#262c39] bg-[#141720] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#232732] pb-3">
            <CreditCard className="h-4 w-4 text-[#007cc3]" />
            <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">Currency & Tax Rates</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Currency Code
              </label>
              <select
                value={settings.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  const sym = curr === "SGD" ? "S$" : curr === "USD" ? "$" : curr === "EUR" ? "€" : "£";
                  setSettings({ ...settings, currency: curr, currencySymbol: sym });
                }}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading uppercase font-bold text-white focus:border-[#007cc3] focus:outline-none"
              >
                <option value="SGD">SGD (Singapore Dollar)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Currency Symbol
              </label>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] font-heading font-bold text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                GST / Sales Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.taxRate}
                onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Feature Switches & Gateway Toggles */}
        <div className="border border-[#262c39] bg-[#141720] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#232732] pb-3">
            <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">Payment Gateways & Operations</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between border border-[#262c39] bg-[#101217] p-3 cursor-pointer">
              <div>
                <p className="font-heading uppercase tracking-wider text-[12px] font-bold text-white">Garmin Pay™ Contactless Sandbox</p>
                <p className="text-[11px] text-[#8a92a3]">Enable test payment transactions for watch tokenization</p>
              </div>
              <input
                type="checkbox"
                checked={settings.garminPaySandbox}
                onChange={(e) => setSettings({ ...settings, garminPaySandbox: e.target.checked })}
                className="h-4 w-4 accent-[#007cc3]"
              />
            </label>

            <label className="flex items-center justify-between border border-[#262c39] bg-[#101217] p-3 cursor-pointer">
              <div>
                <p className="font-heading uppercase tracking-wider text-[12px] font-bold text-white">Stripe / Credit Card Gateway</p>
                <p className="text-[11px] text-[#8a92a3]">Accept Visa, Mastercard, and American Express</p>
              </div>
              <input
                type="checkbox"
                checked={settings.stripeEnabled}
                onChange={(e) => setSettings({ ...settings, stripeEnabled: e.target.checked })}
                className="h-4 w-4 accent-[#007cc3]"
              />
            </label>

            <label className="flex items-center justify-between border border-[#262c39] bg-[#101217] p-3 cursor-pointer">
              <div>
                <p className="font-heading uppercase tracking-wider text-[12px] font-bold text-white">Maintenance Mode</p>
                <p className="text-[11px] text-[#8a92a3]">Show maintenance splash page to storefront visitors</p>
              </div>
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="h-4 w-4 accent-[#007cc3]"
              />
            </label>
          </div>
        </div>

        {/* Global SEO Settings */}
        <div className="border border-[#262c39] bg-[#141720] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#232732] pb-3">
            <Search className="h-4 w-4 text-[#007cc3]" />
            <h3 className="font-heading uppercase tracking-wider text-sm font-bold text-white">Search Engine Optimization (SEO)</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Default SEO Meta Title
              </label>
              <input
                type="text"
                value={settings.seoTitle}
                onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })}
                className="mt-1 h-9 w-full border border-[#262c39] bg-[#101217] px-3 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
                Default SEO Meta Description
              </label>
              <textarea
                rows={3}
                value={settings.seoDescription}
                onChange={(e) => setSettings({ ...settings, seoDescription: e.target.value })}
                className="mt-1 w-full border border-[#262c39] bg-[#101217] p-2.5 text-[13px] text-white focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
