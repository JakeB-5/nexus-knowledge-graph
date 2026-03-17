# Nexus — Knowledge Graph Platform

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)
![pnpm](https://img.shields.io/badge/pnpm-9.15-orange?logo=pnpm)
![Turborepo](https://img.shields.io/badge/Turborepo-2.3-red?logo=turborepo)

---

## Overview

**Nexus** is a full-stack platform for building, exploring, and collaborating on knowledge graphs. It brings together graph algorithms, natural language processing, AI integration, real-time collaboration, and workflow automation in a single TypeScript monorepo.

This project is the result of an **autonomous AI agent experiment**. 29 parallel agent teams designed, implemented, and tested everything — with zero lines of human technical specification.

> Humans set the direction. Agents wrote the code.

---

## Key Features

### Knowledge Graph Engine
- Node-edge knowledge representation with typed relationships
- 20+ graph algorithms: PageRank, community detection, shortest paths, centrality analysis
- BFS/DFS traversal, topological sort, max-flow, link prediction, random walks

### Search & NLP
- Full-text search (BM25), vector search (cosine similarity), hybrid search (RRF)
- Named entity extraction, sentiment analysis, TF-IDF, language detection, text summarization

### AI Integration
- OpenAI-compatible provider abstraction
- Chains for summarization, extraction, classification, and question-answering (RAG)
- Embeddings pipeline, token counter

### Real-time Collaboration
- 7 CRDT types (G-Counter, G-Set, LWW-Register, OR-Set, RGA, PN-Counter, LWW-Map) for conflict-free concurrent editing
- WebSocket-based presence system with cursor tracking
- Content versioning with Myers diff engine and three-way merge

### Workflow Automation
- Workflow engine with condition, loop, parallel, and delay steps
- Trigger manager, expression evaluator, built-in templates

### Infrastructure
- RBAC + ACL + ABAC permission system
- Layered configuration manager, cron-based scheduler
- Audit logging, backup/restore, multi-backend storage
- Token bucket / sliding window rate limiters
- Prometheus-compatible metrics, distributed tracing, alerting, health checks

---

## Project Scale

| Metric | Value |
|--------|-------|
| TypeScript/TSX code | **146,854 lines** |
| Source files | **821** |
| Packages | **44** |
| Applications | **4** |
| Web pages | **35+** |
| CLI command groups | **10** |
| API route files | **6** |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.7 (strict mode) |
| Monorepo | Turborepo 2.3 + pnpm 9.15 |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS |
| API Server | Hono (Node.js) |
| WebSocket | ws library |
| CLI | Commander.js, Chalk, Ora |
| Database | PostgreSQL (Drizzle ORM) |
| GraphQL | graphql-js (schema + resolvers + DataLoaders) |
| Testing | Vitest (unit/integration), Playwright (e2e) |
| Validation | Zod |
| Container | Docker / docker-compose |

---

## Project Structure

```
nexus/
├── apps/
│   ├── web/             # Next.js 15 frontend (~21k LOC)
│   ├── api/             # Hono REST API server (~3.5k LOC)
│   ├── cli/             # Commander.js CLI tool (~3.5k LOC)
│   └── ws/              # WebSocket real-time server
│
├── packages/
│   │
│   │  ── Core Domain ──
│   ├── graph/           # Graph engine + 20+ algorithms
│   ├── search/          # Full-text / vector / hybrid search
│   ├── db/              # Drizzle ORM schema + queries
│   ├── shared/          # Common types, schemas, utilities
│   │
│   │  ── Collaboration & Real-time ──
│   ├── crdt/            # 7 CRDT data structures
│   ├── collaboration/   # Session & presence management, OT
│   ├── versioning/      # Version store + diff/merge engine
│   │
│   │  ── AI & NLP ──
│   ├── nlp/             # NLP pipeline (tokenizer, TF-IDF, NER, sentiment)
│   ├── ai/              # AI providers + chains + embeddings
│   │
│   │  ── Infrastructure ──
│   ├── permissions/     # RBAC + ACL + policy engine
│   ├── queue/           # Priority job queue + dead-letter queue
│   ├── events/          # Event bus + event store + event sourcing + sagas
│   ├── workflow/        # Workflow engine with expression evaluator
│   ├── notifications/   # Multi-channel notification system
│   ├── cache/           # LRU cache, TTL cache, multi-tier cache
│   ├── logger/          # Structured logging with multiple transports
│   ├── monitoring/      # Metrics, tracing, alerting, health checks
│   ├── rate-limiter/    # Token bucket, sliding window, leaky bucket
│   ├── api-gateway/     # Router, reverse proxy, circuit breaker, load balancer
│   ├── audit/           # Audit logging with policy engine
│   ├── backup/          # Backup/restore with integrity checking
│   ├── config-manager/  # Layered config (env, file, memory)
│   ├── scheduler/       # Cron parser + task scheduler + calendar
│   ├── storage/         # Storage abstraction (local, memory, signed URLs)
│   │
│   │  ── Data & Serialization ──
│   ├── serialization/   # JSON, binary, MessagePack serializers
│   ├── pipeline/        # Functional data pipeline (map/filter/reduce/window/join)
│   ├── importers/       # Markdown, CSV, JSON, HTML importers/exporters
│   ├── query-builder/   # SQL + graph query builder
│   ├── template/        # Template engine (lexer, parser, compiler)
│   ├── i18n/            # Internationalization with plural rules
│   ├── validation/      # Schema validator + sanitizer
│   ├── math/            # Vector, matrix, geometry, PRNG, interpolation
│   ├── crypto/          # Hash, AES-GCM encryption, tokens, passwords
│   ├── data-structures/ # LinkedList, SkipList, Trie, BloomFilter, B-Tree, Red-Black Tree
│   ├── state-machine/   # FSM with guards, actions, builder, presets
│   │
│   │  ── Testing & Quality ──
│   ├── testing/         # Test factories, custom matchers, fixtures, mocks
│   ├── analytics/       # Time series, graph metrics, user/content analytics
│   ├── benchmarks/      # Performance benchmarks + data generators
│   ├── integration-tests/ # Cross-package integration tests
│   │
│   │  ── Presentation ──
│   ├── ui/              # React component library + Canvas2D graph visualization
│   ├── sdk/             # NexusClient SDK for API consumers
│   ├── config/          # Shared TypeScript/Vitest configs
│   ├── graphql/         # GraphQL schema, resolvers, DataLoaders
│   └── plugins/         # Plugin system with registry and hooks
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9.15+
- PostgreSQL 15+ (for database features)

### Installation

```bash
git clone <repo-url>
cd anything3
pnpm install
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, etc.
```

### Development

```bash
# Run all apps in development mode
pnpm dev

# Run individual apps
pnpm --filter @nexus/web dev       # Web  → http://localhost:3000
pnpm --filter @nexus/api dev       # API  → http://localhost:3001
pnpm --filter @nexus/ws dev        # WS   → ws://localhost:3002
```

### Docker

```bash
docker-compose up
```

---

## Packages

### Core Domain

| Package | Description |
|---------|-------------|
| `@nexus/graph` | Knowledge graph engine with 20+ algorithms: BFS/DFS, PageRank, HITS, betweenness/closeness centrality, community detection, Dijkstra/A*/Floyd-Warshall shortest paths, max-flow (Edmonds-Karp), link prediction, random walks, topological sort, graph partitioning, motif detection, influence maximization |
| `@nexus/search` | In-memory search engines: BM25 full-text with title boosting, vector cosine similarity, hybrid ranking via Reciprocal Rank Fusion (RRF) |
| `@nexus/db` | Drizzle ORM schema (users, nodes, edges), typed CRUD queries, PostgreSQL client |
| `@nexus/shared` | Zod schemas (single source of truth for types), NexusError class, constants, and utility functions for strings, dates, collections, objects, async patterns, validation |

### Collaboration & Real-time

| Package | Description |
|---------|-------------|
| `@nexus/crdt` | 7 CRDT types (G-Counter, PN-Counter, G-Set, OR-Set, LWW-Register, LWW-Map, RGA), vector clocks, HLC, sync protocol with delta support |
| `@nexus/collaboration` | Session manager, presence tracking with cursor positions, Operation Transform (OT) for text editing, awareness protocol |
| `@nexus/versioning` | Version store, Myers diff algorithm, three-way merge engine, branch manager, text diff with unified/side-by-side output |

### AI & NLP

| Package | Description |
|---------|-------------|
| `@nexus/nlp` | Tokenizer with Porter stemmer, TF-IDF, RAKE/TextRank keyword extraction, rule-based NER, lexicon sentiment analysis, extractive summarization, language detection, similarity metrics (Levenshtein, Jaro-Winkler, Jaccard) |
| `@nexus/ai` | OpenAI-compatible provider abstraction, prompt builder with token budgeting, chains (summarize, extract, classify, QA/RAG), embeddings pipeline with caching, BPE-inspired token counter |

### Infrastructure

| Package | Description |
|---------|-------------|
| `@nexus/permissions` | RBAC with role hierarchy, per-resource ACL, attribute-based policy engine (ABAC), combined evaluator with caching and audit trail |
| `@nexus/queue` | In-memory priority queue with workers, exponential backoff retries, delayed jobs, dead-letter queue, cron-like scheduler |
| `@nexus/events` | Event bus (pub/sub with wildcards), event store with replay, event sourcing with aggregates, saga pattern for distributed transactions |
| `@nexus/workflow` | Workflow engine with condition/loop/parallel/delay steps, expression evaluator, trigger manager, fluent builder API, pre-built templates |
| `@nexus/notifications` | Multi-channel dispatcher (in-app, email, webhook), template engine, per-user preferences, digest mode, rate limiting |
| `@nexus/cache` | LRU cache (O(1) with linked list + hash map), TTL cache, multi-tier cache (L1/L2 read-through), function memoization decorator |
| `@nexus/logger` | Structured JSON logger, child loggers with context inheritance, console/file/memory transports, pretty and JSON formatters |
| `@nexus/monitoring` | Prometheus-compatible metrics (counter/gauge/histogram), OpenTelemetry-inspired tracing with AsyncLocalStorage, alert manager with hysteresis, health aggregator |
| `@nexus/rate-limiter` | Token bucket, sliding window (log + counter), leaky bucket, composite limiter (combine per-user + per-IP + per-endpoint) |
| `@nexus/api-gateway` | Pattern-matching router, reverse proxy, round-robin/weighted load balancer, circuit breaker (closed/open/half-open), health checker |
| `@nexus/audit` | Buffered audit logger, in-memory store with aggregation, configurable audit policies, JSON/CSV export formatters |
| `@nexus/backup` | Streaming export with checksums, import with ID remapping and conflict resolution, incremental diffs, retention-based scheduler |
| `@nexus/config-manager` | Layered config (defaults → file → env → remote), dot-notation access, schema validation, hot reload, secret masking |
| `@nexus/scheduler` | Full cron expression parser (with @yearly/@daily etc.), recurring and one-time tasks, business day calendar with holidays |
| `@nexus/storage` | Local filesystem and in-memory providers, HMAC signed URLs, image header parser (PNG/JPEG/GIF/WebP), chunked upload manager |

### Data & Serialization

| Package | Description |
|---------|-------------|
| `@nexus/serialization` | JSON serializer (Date/BigInt/Map/Set support), compact binary serializer with varint encoding, MessagePack-compatible codec, schema migration with BFS chaining, compression (RLE, LZ77, dictionary, delta, bit-packing) |
| `@nexus/pipeline` | Functional data pipeline with fluent API (map/filter/flatMap/batch/window), tumbling/sliding/session windows, hash/merge/cross joins, multiple source and sink types |
| `@nexus/importers` | Markdown parser (headings, wikilinks, front matter, hashtags), CSV with column mapping, JSON/JSON-LD, HTML parser, deduplication (exact/fuzzy/hash), import pipeline with rollback |
| `@nexus/query-builder` | Fluent SQL query builder with parameter binding, graph query builder (.traverse/.path/.neighbors/.pattern), composable condition combinators |
| `@nexus/template` | Template engine with lexer, recursive descent parser, AST compiler, variable interpolation, block inheritance, 30+ built-in filters, loop/conditional/macro helpers |
| `@nexus/i18n` | Translation with nested keys and interpolation, plural rules for 7 languages, locale-aware number/date/currency/relative-time formatters, English and Korean translations |
| `@nexus/validation` | Fluent validator with string/number/date/array/graph rules, cross-field validation, conditional rules, HTML/XSS sanitizer, path traversal prevention |
| `@nexus/math` | N-dimensional vectors, matrix operations (LU decomposition, inverse, eigenvalues), Xoshiro256** PRNG, easing functions, geometry (QuadTree, convex hull, polygon), number theory (prime, factorial, Catalan), extended statistics (regression, correlation, outlier detection) |
| `@nexus/crypto` | SHA-256/HMAC/Murmur3 hashing, AES-256-GCM encryption with PBKDF2 key derivation, secure token generation (API keys, TOTP/HOTP, magic links), scrypt password hashing with strength scoring |
| `@nexus/data-structures` | Doubly linked list, skip list, trie (with wildcard search), Bloom filter, B-tree, red-black tree, segment tree (lazy propagation), interval tree, ring buffer, LRU cache, disjoint set (union-find) |
| `@nexus/state-machine` | Finite state machine with guards, entry/exit actions, hierarchical/parallel states, fluent builder with validation, interpreter with delayed transitions, pre-built presets (document lifecycle, auth flow, import job) |

### Testing & Quality

| Package | Description |
|---------|-------------|
| `@nexus/testing` | Test data factories (nodes, edges, users, graphs with configurable topologies), custom Vitest matchers, pre-built fixtures, mock implementations (DB, search, WebSocket, event bus) |
| `@nexus/analytics` | Time series with downsampling and gap filling, graph metrics (degree distribution, clustering coefficient, centrality), search/user/content analytics, report generator with anomaly detection |
| `@nexus/benchmarks` | Benchmark runner with statistics (min/max/mean/p95/p99), graph generators (Barabasi-Albert, Watts-Strogatz, Erdos-Renyi), graph/search/CRDT benchmarks |
| `@nexus/integration-tests` | Cross-package integration tests: graph+search, graph+analytics, CRDT+collaboration, workflow+events, permissions+API, NLP+graph, import/export roundtrip |

### Presentation

| Package | Description |
|---------|-------------|
| `@nexus/ui` | React component library (Button, Input, Card, Badge, Spinner) + Canvas2D graph visualization engine (force-directed/circular/hierarchical layouts, physics simulation with Barnes-Hut, camera with smooth transitions, mouse/touch interaction) |
| `@nexus/sdk` | `NexusClient` SDK for external API consumers — typed methods for nodes, edges, search, graph traversal, auth |
| `@nexus/graphql` | GraphQL type definitions, resolvers for nodes/edges/users/graph/search, Relay-style cursor pagination, DataLoaders for N+1 prevention, custom scalars (DateTime, UUID, JSON), @auth directive |
| `@nexus/plugins` | Plugin registry with lifecycle management, hook pipeline (before/after with priority ordering), plugin loader with version compatibility, built-in plugins (auto-tag, link-extractor, metrics-collector) |
| `@nexus/config` | Shared TypeScript, Vitest, and build configurations |

---

## Applications

### `apps/web` — Next.js 15 Frontend

35+ pages including:
- **Dashboard**: overview, node/edge management, user management, analytics, settings
- **Knowledge Base**: node detail, editor with auto-save, change history
- **Graph Explorer**: interactive Canvas2D visualization with pan/zoom/drag
- **Search**: basic and advanced search with query builder
- **Collaboration**: workspaces, collections, real-time editing
- **Admin**: monitoring, audit log, API docs, notifications, help center
- **Auth**: login, register, forgot password
- **Onboarding**: multi-step wizard, guided tour system
- **Features**: SVG charts (line, bar, pie, heatmap, treemap, network), rich text editor, markdown editor, command palette (Cmd+K)

### `apps/api` — Hono REST API Server

| Route Group | Endpoints |
|-------------|-----------|
| `/api/auth` | POST /register, POST /login, POST /refresh |
| `/api/nodes` | GET/POST /nodes, GET/PATCH/DELETE /nodes/:id, GET /nodes/:id/edges |
| `/api/edges` | POST /edges, GET/DELETE /edges/:id |
| `/api/graph` | POST /traverse/:startId, GET /shortest-path, GET /pagerank, GET /communities |
| `/api/search` | POST /search |
| `/api/health` | GET /health |

Middleware: JWT auth, Zod validation, rate limiting, LRU caching, structured logging, request IDs.

### `apps/cli` — Commander.js CLI

| Command | Description |
|---------|-------------|
| `nexus auth` | Login, logout, register, token management |
| `nexus nodes` | List, create, get, update, delete nodes |
| `nexus graph` | Traverse, shortest path, PageRank |
| `nexus search` | Full-text and semantic search |
| `nexus import` | Import from Markdown, CSV, JSON |
| `nexus export` | Export to Markdown, CSV, JSON |
| `nexus workspace` | Workspace management |
| `nexus analytics` | Graph statistics and reports |
| `nexus admin` | Backup, restore, config, user management |
| `nexus interactive` | Interactive REPL with tab completion |

### `apps/ws` — WebSocket Real-time Server

Token-authenticated WebSocket server handling presence tracking, cursor synchronization, live node updates, and CRDT-based collaborative editing.

---

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @nexus/graph test
pnpm --filter @nexus/shared test
pnpm --filter @nexus/search test

# Run a single test file (always use --no-cache)
pnpm --filter @nexus/graph vitest run src/__tests__/traversal.test.ts --no-cache
```

### Verified Test Results

| Package | Tests |
|---------|-------|
| `@nexus/graph` | 74/74 |
| `@nexus/shared` | 259/259 |
| `@nexus/search` | 12/12 |
| `@nexus/permissions` | 164/164 |
| `@nexus/monitoring` | 156/156 |
| `@nexus/serialization` | 144/144 |
| `@nexus/math` | 210/210 |
| `@nexus/crypto` | 117/117 |
| `@nexus/pipeline` | 99/99 |
| `@nexus/state-machine` | 69/69 |
| `@nexus/audit` | 52/52 |
| `@nexus/api-gateway` | 43/43 |
| `@nexus/benchmarks` | 18/18 |

---

## The Agent Team Experiment

### What Was This?

This project is an experiment answering the question: **"Can AI agent teams autonomously design and implement production-grade software with zero human technical specifications?"**

### How It Worked

| Aspect | Detail |
|--------|--------|
| Agents deployed | **29 parallel agents** |
| Execution mode | Concurrent parallel (ultrawork) |
| Human technical specs | **0 lines** |
| Generated code | 146,854 lines of TypeScript |
| Generated packages | 44 |
| Human role | Set experiment direction only |

### What Agents Decided Autonomously

- **Architecture**: Monorepo structure, package boundaries, dependency graph
- **Algorithm selection**: Which graph algorithms to implement and how
- **API design**: REST endpoint specifications, request/response schemas
- **UI/UX design**: 35+ page layouts, component hierarchy, interaction patterns
- **Testing strategy**: What to test, how to test, test data generation

### What We Learned

- Parallel agents achieve high throughput when working on independent packages simultaneously
- Agents correctly implement standard software patterns (CRDT, Event Sourcing, RBAC, etc.) without being explicitly taught
- External dependencies (database, auth services) are recognized as boundaries — agents mark them with `TODO` comments
- Interface consistency across 29 agents is maintained through the shared `@nexus/shared` package
- The resulting codebase is structurally sound, with real algorithms (not stubs) that pass comprehensive tests

---

## License

MIT License — free to use, modify, and distribute.
