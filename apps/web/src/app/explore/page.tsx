export default function ExplorePage() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-800">Explorer</h2>
        <nav className="mt-4 space-y-2">
          <a href="/explore" className="block rounded px-3 py-2 text-sm text-nexus-600 bg-nexus-50">
            Graph View
          </a>
          <a href="/explore/list" className="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            List View
          </a>
        </nav>
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase text-gray-400">Node Types</h3>
          <div className="mt-2 space-y-1">
            {["document", "concept", "tag", "person"].map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" defaultChecked className="rounded" />
                {type}
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* Main graph area */}
      <main className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">🕸️</div>
          <p className="text-lg">Interactive graph visualization</p>
          <p className="text-sm mt-2">Canvas renderer will be implemented here</p>
        </div>
      </main>

      {/* Detail panel */}
      <aside className="w-80 border-l border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-800">Details</h2>
        <p className="mt-4 text-sm text-gray-500">
          Select a node to view its details, connections, and metadata.
        </p>
      </aside>
    </div>
  );
}
