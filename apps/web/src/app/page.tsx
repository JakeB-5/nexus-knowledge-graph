export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-nexus-700">
          Nexus
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Knowledge Graph Platform
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <a
            href="/explore"
            className="rounded-lg bg-nexus-600 px-6 py-3 text-white font-medium hover:bg-nexus-700 transition-colors"
          >
            Explore Graph
          </a>
          <a
            href="/search"
            className="rounded-lg border border-nexus-300 px-6 py-3 text-nexus-700 font-medium hover:bg-nexus-50 transition-colors"
          >
            Search Knowledge
          </a>
        </div>
      </div>
    </main>
  );
}
