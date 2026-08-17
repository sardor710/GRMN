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
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-[#0a0c10] p-4 text-white font-sans">
      <div className="relative w-full max-w-md border border-[#262c39] bg-[#141720] p-8 shadow-2xl">
        {/* Brand */}
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-3">
            <GarminLogo className="h-6 w-auto text-white" />
            <span className="font-heading tracking-widest text-[10px] font-bold text-[#007cc3] uppercase bg-[#007cc3]/10 px-1.5 py-0.5 border border-[#007cc3]/30">
              ADMIN
            </span>
          </div>
          <h1 className="font-heading uppercase tracking-wider text-xl font-bold text-white">
            Administrator Sign In
          </h1>
          <p className="mt-1 text-[12px] text-[#8a92a3]">
            Official Garmin eCommerce portal & store configuration
          </p>
        </div>

        {/* Preset credentials card */}
        <div className="mt-6 border border-[#262c39] bg-[#101217] p-3.5">
          <div className="flex items-center justify-between">
            <span className="font-heading uppercase tracking-wider text-[10px] font-bold text-[#8a92a3]">
              Default Credentials
            </span>
            <button
              type="button"
              onClick={handleFillDemo}
              className="font-heading uppercase tracking-wider text-[11px] font-bold text-[#007cc3] hover:underline"
            >
              Fill In
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#c0c7d4] font-mono">
            <div className="bg-[#141720] p-1.5 border border-[#262c39]">
              <span className="text-[#737b8c]">Email:</span> admin@garmin.com
            </div>
            <div className="bg-[#141720] p-1.5 border border-[#262c39]">
              <span className="text-[#737b8c]">Pass:</span> admin123
            </div>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mt-4 border border-rose-500/30 bg-[#2c1919] p-3 text-[12px] text-rose-300">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Email Address
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@garmin.com"
                className="h-10 w-full border border-[#262c39] bg-[#101217] pl-10 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-heading uppercase tracking-wider font-bold text-[#8a92a3]">
              Password
            </label>
            <div className="relative mt-1">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737b8c]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full border border-[#262c39] bg-[#101217] pl-10 pr-3 text-[13px] text-white placeholder-[#606775] focus:border-[#007cc3] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="flex h-10 w-full items-center justify-center gap-2 bg-[#007cc3] text-[12px] font-heading uppercase tracking-wider font-bold text-white transition-colors hover:bg-[#006cae] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#4ade80]" /> Authorized
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
        <div className="mt-8 border-t border-[#232732] pt-4 flex items-center justify-between text-[11px] text-[#737b8c]">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3 text-[#007cc3]" /> SSL Encrypted
          </span>
          <span className="font-mono">v2.4.0</span>
        </div>
      </div>
    </div>
  );
}
