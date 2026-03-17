"use client";

import React, { useState } from "react";
import Link from "next/link";

function PasswordStrength({ password }: { password: string }) {
  const getStrength = () => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const strength = getStrength();
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "bg-red-500", "bg-yellow-500", "bg-blue-400", "bg-green-500"];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i <= strength ? colors[strength] : "bg-white/10"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs ${strength <= 1 ? "text-red-400" : strength === 2 ? "text-yellow-400" : strength === 3 ? "text-blue-400" : "text-green-400"}`}>
        {labels[strength]}
      </p>
    </div>
  );
}

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setError("Please accept the terms of service.");
      return;
    }
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setIsLoading(false);
  };

  return (
    <>
      <h2 className="text-xl font-semibold text-white mb-1">Create an account</h2>
      <p className="text-nexus-300 text-sm mb-6">Start building your knowledge graph</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-nexus-200 mb-1.5">Full name</label>
          <input
            type="text"
            value={form.name}
            onChange={set("name")}
            required
            placeholder="Jane Smith"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-400 focus:border-transparent transition text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-nexus-200 mb-1.5">Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={set("email")}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-400 focus:border-transparent transition text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-nexus-200 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 pr-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-400 focus:border-transparent transition text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-400 hover:text-nexus-200 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {showPassword ? (
                  <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <>
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <PasswordStrength password={form.password} />
        </div>

        <div>
          <label className="block text-sm font-medium text-nexus-200 mb-1.5">Confirm password</label>
          <input
            type="password"
            value={form.confirm}
            onChange={set("confirm")}
            required
            placeholder="••••••••"
            className={`w-full px-4 py-2.5 rounded-lg bg-white/10 border text-white placeholder-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-400 focus:border-transparent transition text-sm ${
              form.confirm && form.password !== form.confirm
                ? "border-red-500/50"
                : "border-white/20"
            }`}
          />
          {form.confirm && form.password !== form.confirm && (
            <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
          )}
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-nexus-500 focus:ring-nexus-400"
          />
          <span className="text-sm text-nexus-300">
            I agree to the{" "}
            <a href="#" className="text-nexus-300 hover:text-white underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="text-nexus-300 hover:text-white underline">Privacy Policy</a>
          </span>
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-nexus-500 hover:bg-nexus-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center justify-center gap-2 text-sm"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-nexus-400">
        Already have an account?{" "}
        <Link href="/auth/login" className="text-nexus-300 hover:text-white font-medium transition">
          Sign in
        </Link>
      </p>
    </>
  );
}
