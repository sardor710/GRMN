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
import { Button, Select } from "@/components/admin/ui";

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
    return <div className="py-12 text-center text-neutral-400">Loading store settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-[#007cc3]" />
            <h1 className="g-heading text-2xl uppercase tracking-tight text-neutral-900">
              Store Configuration & Global Settings
            </h1>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Global store metadata, currency formatting, Garmin Pay toggles, and SEO defaults.
          </p>
        </div>

        <Button variant="primary" size="md"
          type="button"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <span>Saving...</span>
          ) : savedSuccess ? (
            <span className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Saved!
            </span>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Settings</span>
            </>
          )}
        </Button>
      </div>

      {savedSuccess && (
        <div className="border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2.5 rounded-none shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Store settings have been updated and persisted to configuration.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Store Details */}
        <div className="border border-neutral-200 bg-white p-6 space-y-4 rounded-none shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <Globe className="h-4 w-4 text-[#007cc3]" />
            <h3 className="g-heading text-base uppercase tracking-tight text-neutral-900 font-semibold">General Information</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Storefront Name *
              </label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Support Contact Email *
              </label>
              <input
                type="email"
                required
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Support Helpline Phone
              </label>
              <input
                type="text"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Free Shipping Threshold ($)
              </label>
              <input
                type="number"
                value={settings.freeShippingThreshold}
                onChange={(e) => setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Currency & Tax */}
        <div className="border border-neutral-200 bg-white p-6 space-y-4 rounded-none shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <CreditCard className="h-4 w-4 text-[#007cc3]" />
            <h3 className="g-heading text-base uppercase tracking-tight text-neutral-900 font-semibold">Currency & Tax Rates</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Currency Code
              </label>
              <Select
                value={settings.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  const sym = curr === "SGD" ? "S$" : curr === "USD" ? "$" : curr === "EUR" ? "€" : "£";
                  setSettings({ ...settings, currency: curr, currencySymbol: sym });
                }}
              >
                <option value="SGD">SGD (Singapore Dollar)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                GST / Sales Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.taxRate}
                onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Feature Switches & Gateway Toggles */}
        <div className="border border-neutral-200 bg-white p-6 space-y-4 rounded-none shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <h3 className="g-heading text-base uppercase tracking-tight text-neutral-900 font-semibold">Payment Gateways & Operations</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between border border-neutral-200 bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900">Garmin Pay™ Contactless Sandbox</p>
                <p className="text-xs text-neutral-500 mt-0.5">Enable test payment transactions for watch tokenization</p>
              </div>
              <input
                type="checkbox"
                checked={settings.garminPaySandbox}
                onChange={(e) => setSettings({ ...settings, garminPaySandbox: e.target.checked })}
                className="h-4 w-4 accent-black rounded-none"
              />
            </label>

            <label className="flex items-center justify-between border border-neutral-200 bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900">Stripe / Credit Card Gateway</p>
                <p className="text-xs text-neutral-500 mt-0.5">Accept Visa, Mastercard, and American Express</p>
              </div>
              <input
                type="checkbox"
                checked={settings.stripeEnabled}
                onChange={(e) => setSettings({ ...settings, stripeEnabled: e.target.checked })}
                className="h-4 w-4 accent-black rounded-none"
              />
            </label>

            <label className="flex items-center justify-between border border-neutral-200 bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-900">Maintenance Mode</p>
                <p className="text-xs text-neutral-500 mt-0.5">Show maintenance splash page to storefront visitors</p>
              </div>
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="h-4 w-4 accent-black rounded-none"
              />
            </label>
          </div>
        </div>

        {/* Global SEO Settings */}
        <div className="border border-neutral-200 bg-white p-6 space-y-4 rounded-none shadow-sm">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
            <Search className="h-4 w-4 text-[#007cc3]" />
            <h3 className="g-heading text-base uppercase tracking-tight text-neutral-900 font-semibold">Search Engine Optimization (SEO)</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Default SEO Meta Title
              </label>
              <input
                type="text"
                value={settings.seoTitle}
                onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })}
                className="h-10 w-full border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1">
                Default SEO Meta Description
              </label>
              <textarea
                rows={3}
                value={settings.seoDescription}
                onChange={(e) => setSettings({ ...settings, seoDescription: e.target.value })}
                className="w-full border border-neutral-300 bg-white p-3 text-sm text-neutral-900 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
