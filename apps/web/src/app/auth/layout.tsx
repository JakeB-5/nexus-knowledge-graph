"use client";

import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-nexus-950 via-nexus-900 to-nexus-800 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-nexus-600 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-nexus-400 rounded-full opacity-10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-nexus-700 rounded-full opacity-5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-nexus-500 rounded-2xl mb-4 shadow-lg shadow-nexus-900/50">
            <svg
              className="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="3" />
              <circle cx="4" cy="6" r="2" />
              <circle cx="20" cy="6" r="2" />
              <circle cx="4" cy="18" r="2" />
              <circle cx="20" cy="18" r="2" />
              <line x1="12" y1="9" x2="5.5" y2="7" />
              <line x1="12" y1="9" x2="18.5" y2="7" />
              <line x1="12" y1="15" x2="5.5" y2="17" />
              <line x1="12" y1="15" x2="18.5" y2="17" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nexus</h1>
          <p className="text-nexus-300 text-sm mt-1">Knowledge Graph Platform</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-8">
          {children}
        </div>

        {/* Footer */}
        <p className="text-center text-nexus-400 text-xs mt-6">
          &copy; {new Date().getFullYear()} Nexus. All rights reserved.
        </p>
      </div>
    </div>
  );
}
