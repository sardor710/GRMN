"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GarminLogo } from "@/components/icons";
import { Shield, KeyRound, Mail, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@garmin.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/admin");
        router.refresh();
      }, 500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail("admin@garmin.com");
    setPassword("admin123");
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-neutral-100 p-4 text-black font-sans">
      <div className="relative w-full max-w-md border border-neutral-300 bg-white p-8 shadow-xl rounded-none">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-3">
            <GarminLogo className="h-6 w-auto text-black" />
            <span className="font-heading tracking-widest text-[10px] font-bold text-[#007cc3] uppercase bg-[#007cc3]/10 px-1.5 py-0.5 border border-[#007cc3]/20">
              ADMIN
            </span>
          </div>
          <h1 className="g-heading uppercase tracking-wide text-2xl font-normal text-black">
            Administrator Sign In
          </h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            Official Garmin eCommerce portal &amp; store configuration
          </p>
        </div>

        {/* Preset credentials card */}
        <div className="mt-6 border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-heading uppercase tracking-wider text-[11px] font-semibold text-neutral-500">
              Default Credentials
            </span>
            <button
              type="button"
              onClick={handleFillDemo}
              className="text-[12px] font-medium text-[#007cc3] hover:underline"
            >
              Fill In
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-neutral-700 font-mono">
            <div className="bg-white p-2 border border-neutral-200">
              <span className="text-neutral-400">Email:</span> admin@garmin.com
            </div>
            <div className="bg-white p-2 border border-neutral-200">
              <span className="text-neutral-400">Pass:</span> admin123
            </div>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mt-4 border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-700">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
              Email Address
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@garmin.com"
                className="h-10 w-full border border-neutral-300 bg-white pl-10 pr-3 text-[13px] text-black placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-semibold text-neutral-600">
              Password
            </label>
            <div className="relative mt-1">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full border border-neutral-300 bg-white pl-10 pr-3 text-[13px] text-black placeholder-neutral-400 focus:border-black focus:outline-none rounded-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="flex h-11 w-full items-center justify-center gap-2 bg-black text-white hover:bg-neutral-800 border border-black text-[13px] font-medium tracking-[0.06em] uppercase rounded-none transition-colors disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : success ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Authorized
              </span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 border-t border-neutral-200 pt-4 flex items-center justify-between text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5 text-[#007cc3]" /> SSL Encrypted
          </span>
          <span className="font-mono">v2.4.0</span>
        </div>
      </div>
    </div>
  );
}
