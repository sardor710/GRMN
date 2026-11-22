"use client";

import { useState, useEffect } from "react";
import {
  Save,
  CheckCircle2,
} from "lucide-react";
import type { StoreSettings } from "@/lib/cms/types";
import { LocaleTabs, type ContentLocale } from "@/components/admin/LocaleTabs";
import { TranslationField } from "@/components/admin/TranslationField";
import { translationStatus } from "@/lib/cms/translation-input";
import { getOverlayString, setOverlayValue } from "@/lib/cms/translation-edit";
import { SETTINGS_SPEC } from "@/i18n/translate-record";
import { Button, Select } from "@/components/admin/ui";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [seoLocale, setSeoLocale] = useState<ContentLocale>("en");

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
    setSaveError("");

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string | { message?: string } };
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        setSaveError(message || `Save failed (HTTP ${res.status}).`);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveError("Network error — settings were not saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="py-12 text-center text-muted-foreground">Loading store settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="g-heading g-h2 text-black">Settings</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Store details, currency, payments and SEO defaults.
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
            <span className="flex items-center gap-1.5">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Saved
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
        <div className="border border-garmin-badge-lime bg-garmin-badge-lime/25 p-4 text-xs font-semibold text-black flex items-center gap-2.5 rounded-none">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-black" />
          <span>Store settings have been updated and persisted to configuration.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Store Details */}
        <div className="border border-border bg-white p-6 space-y-4 rounded-none">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h3 className="font-sans text-base font-bold text-black">General Information</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Storefront Name *
              </label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Support Contact Email *
              </label>
              <input
                type="email"
                required
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Support Helpline Phone
              </label>
              <input
                type="text"
                value={settings.supportPhone}
                onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Free Shipping Threshold ($)
              </label>
              <input
                type="number"
                value={settings.freeShippingThreshold}
                onChange={(e) => setSettings({ ...settings, freeShippingThreshold: Number(e.target.value) })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Currency & Tax */}
        <div className="border border-border bg-white p-6 space-y-4 rounded-none">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h3 className="font-sans text-base font-bold text-black">Currency & Tax Rates</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Currency Code
              </label>
              <Select
                value={settings.currency}
                onChange={(e) => {
                  const curr = e.target.value;
                  // Task 5b.1 fix 2: the symbol is the currency code (₸ for tenge); never a "$" that implies USD.
                  const sym = curr === "KZT" ? "₸" : curr;
                  setSettings({ ...settings, currency: curr, currencySymbol: sym });
                }}
              >
                <option value="KZT">KZT (Kazakhstani tenge)</option>
                <option value="SGD">SGD (Singapore Dollar)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Currency Symbol
              </label>
              <input
                type="text"
                value={settings.currencySymbol}
                onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                className="h-10 w-full border border-border bg-white px-3 text-sm font-semibold text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                GST / Sales Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={settings.taxRate}
                onChange={(e) => setSettings({ ...settings, taxRate: Number(e.target.value) })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
        </div>

        {/* Feature Switches & Gateway Toggles */}
        <div className="border border-border bg-white p-6 space-y-4 rounded-none">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h3 className="font-sans text-base font-bold text-black">Payment Gateways & Operations</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between border border-border bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold text-black">Garmin Pay™ Contactless Sandbox</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enable test payment transactions for watch tokenization</p>
              </div>
              <input
                type="checkbox"
                checked={settings.garminPaySandbox}
                onChange={(e) => setSettings({ ...settings, garminPaySandbox: e.target.checked })}
                className="h-4 w-4 accent-black rounded-none"
              />
            </label>

            <label className="flex items-center justify-between border border-border bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold text-black">Stripe / Credit Card Gateway</p>
                <p className="text-xs text-muted-foreground mt-0.5">Accept Visa, Mastercard, and American Express</p>
              </div>
              <input
                type="checkbox"
                checked={settings.stripeEnabled}
                onChange={(e) => setSettings({ ...settings, stripeEnabled: e.target.checked })}
                className="h-4 w-4 accent-black rounded-none"
              />
            </label>

            <label className="flex items-center justify-between border border-border bg-neutral-50/70 p-4 cursor-pointer hover:bg-neutral-100/70 transition-colors rounded-none">
              <div>
                <p className="text-xs font-semibold text-black">Maintenance Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show maintenance splash page to storefront visitors</p>
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
        <div className="border border-border bg-white p-6 space-y-4 rounded-none">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h3 className="font-sans text-base font-bold text-black">Search Engine Optimization (SEO)</h3>
          </div>

          <LocaleTabs
            value={seoLocale}
            onChange={setSeoLocale}
            status={{
              ru: translationStatus(settings, "ru", SETTINGS_SPEC),
              kk: translationStatus(settings, "kk", SETTINGS_SPEC),
            }}
          />

          {seoLocale !== "en" ? (
            <div className="space-y-4">
              <TranslationField
                label="Default SEO meta title"
                field="seoTitle"
                value={getOverlayString(settings.translations, seoLocale, ["seoTitle"])}
                source={settings.seoTitle}
                onChange={(v) =>
                  setSettings({ ...settings, translations: setOverlayValue(settings.translations, seoLocale, ["seoTitle"], v) })
                }
              />
              <TranslationField
                label="Default SEO meta description"
                field="seoDescription"
                multiline
                rows={3}
                value={getOverlayString(settings.translations, seoLocale, ["seoDescription"])}
                source={settings.seoDescription}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    translations: setOverlayValue(settings.translations, seoLocale, ["seoDescription"], v),
                  })
                }
              />
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Default SEO Meta Title
              </label>
              <input
                type="text"
                value={settings.seoTitle}
                onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })}
                className="h-10 w-full border border-border bg-white px-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Default SEO Meta Description
              </label>
              <textarea
                rows={3}
                value={settings.seoDescription}
                onChange={(e) => setSettings({ ...settings, seoDescription: e.target.value })}
                className="w-full border border-border bg-white p-3 text-sm text-black focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>
          )}
        </div>
        {saveError && (
          <p role="alert" className="border border-garmin-error bg-white px-3 py-2 text-xs text-garmin-error">
            {saveError}
          </p>
        )}
      </form>
    </div>
  );
}
