"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
          <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Check your email</h2>
        <p className="text-nexus-300 text-sm mb-2">
          We sent a password reset link to
        </p>
        <p className="text-white font-medium text-sm mb-6">{email}</p>
        <p className="text-nexus-400 text-xs mb-6">
          Didn&apos;t receive the email? Check your spam folder or{" "}
          <button
            onClick={() => setSent(false)}
            className="text-nexus-300 hover:text-white underline transition"
          >
            try again
          </button>
          .
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm text-nexus-400 hover:text-nexus-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-nexus-500/20 border border-nexus-500/30 mb-4">
          <svg className="w-6 h-6 text-nexus-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-1">Forgot your password?</h2>
        <p className="text-nexus-300 text-sm">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-nexus-200 mb-1.5">
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-400 focus:border-transparent transition text-sm"
          />
        </div>

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
              Sending...
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm text-nexus-400 hover:text-nexus-200 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to sign in
        </Link>
      </div>
    </>
  );
}
