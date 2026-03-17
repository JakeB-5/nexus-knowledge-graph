"use client";

import { useState } from "react";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-800">Search Knowledge</h1>

      <div className="mt-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes, concepts, documents..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-lg focus:border-nexus-500 focus:outline-none focus:ring-2 focus:ring-nexus-200"
          />
          <button className="rounded-lg bg-nexus-600 px-6 py-3 text-white font-medium hover:bg-nexus-700 transition-colors">
            Search
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            Semantic
          </button>
          <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            Documents
          </button>
          <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            Concepts
          </button>
          <button className="rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            People
          </button>
        </div>
      </div>

      <div className="mt-12 text-center text-gray-400">
        <p>Enter a search query to find knowledge nodes</p>
      </div>
    </div>
  );
}
