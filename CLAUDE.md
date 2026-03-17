# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

**Nexus** — An autonomous full-stack knowledge graph platform built entirely by AI agent teams without human-defined specifications. This project is an extreme experiment in agent autonomy: agents set their own goals, choose methods, and execute independently. External information gathering is encouraged.

**Scale**: 100,000+ LOC across 42 packages and 4 applications.

## Autonomous Operation Protocol

This project operates under **full agent autonomy**:
- No human-defined requirements — agents research, decide, and build
- Goals are self-determined based on what makes a compelling, production-grade platform
- External web research is actively encouraged before making architectural decisions
- Agents should think ambitiously and build real, working software

### Decision-Making Process
1. **Research** — Gather external information (web, docs, best practices)
2. **Propose** — Define goals and architecture with reasoning
3. **Execute** — Build with full test coverage
4. **Verify** — Architect-level review of all work

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Monorepo | pnpm workspaces + Turborepo | Industry standard for TS monorepos |
| Language | TypeScript (strict mode) | Type safety across all packages |
| Backend API | Hono on Node.js | Lightweight, fast, Web Standards API |
| Frontend | Next.js 15 (App Router) | React Server Components, SSR/SSG |
| Database | PostgreSQL + Drizzle ORM | Type-safe queries, migration support |
| Real-time | WebSocket (ws) | Low-latency bidirectional communication |
| Search | Full-text (BM25) + vector (cosine) + hybrid (RRF) | Knowledge graph requires semantic search |
| CLI | Commander.js | Standard Node.js CLI framework |
| Testing | Vitest (unit/integration), Playwright (e2e) | Fast, modern test runners |
| Validation | Zod | Runtime type validation, shared schemas |

## Monorepo Structure

```
apps/
  web/          — Next.js frontend (dashboard, graph explorer, search, auth, admin)
  api/          — Hono REST API (CRUD, auth, search, graph queries)
  cli/          — Command-line interface (nodes, search, graph, import/export, admin)
  ws/           — WebSocket real-time server (presence, cursor sync, live updates)

packages/
  # Core Domain
  graph/        — Graph engine: BFS, DFS, PageRank, HITS, betweenness, community detection,
                  max-flow, link prediction, random walks, topological sort, and more
  search/       — BM25 full-text, vector cosine, hybrid RRF search engines
  db/           — Drizzle ORM schema (users, nodes, edges), migrations, typed queries
  shared/       — Zod schemas, types, errors, constants, utility functions (string, date,
                  collection, object, async, validation)

  # Collaboration & Real-time
  crdt/         — CRDTs: G-Counter, PN-Counter, G-Set, OR-Set, LWW-Register, LWW-Map, RGA
  collaboration/— Session manager, presence, OT (Operation Transform), awareness protocol
  versioning/   — Content versioning: Myers diff, three-way merge, branching, snapshots

  # AI & NLP
  nlp/          — Tokenizer, TF-IDF, RAKE/TextRank keywords, entity extraction, sentiment,
                  summarization, language detection, similarity metrics
  ai/           — AI provider abstraction, prompt builder, chains (summarize, extract,
                  classify, QA/RAG), embeddings pipeline, token counter

  # Infrastructure
  permissions/  — RBAC, ACL, policy engine (ABAC), combined evaluator
  queue/        — Priority job queue, workers, scheduler, dead-letter queue
  events/       — Event bus (pub/sub), event store, event sourcing, sagas
  workflow/     — Workflow engine, expression evaluator, triggers, step types, templates
  notifications/— Notification service, dispatcher, templates, preferences
  cache/        — LRU cache, TTL cache, multi-tier cache, decorator
  logger/       — Structured logger, console/file/memory transports, formatters
  monitoring/   — Metrics (counter/gauge/histogram), tracing (spans), alerting, health checks
  rate-limiter/ — Token bucket, sliding window, leaky bucket, composite limiter
  api-gateway/  — Router, reverse proxy, load balancer, circuit breaker, health checks
  audit/        — Audit logger, store, policy engine, formatters
  backup/       — Export/import, scheduler, integrity checker, incremental diffs
  config-manager/— Layered config (env, file, memory), schema validation, hot reload
  scheduler/    — Cron parser, task scheduler, calendar (business days), recurrence rules
  storage/      — Local/memory storage providers, signed URLs, image processor, upload manager

  # Data & Serialization
  serialization/— JSON, binary, MessagePack serializers, schema migration, compression
  pipeline/     — Functional data pipeline (map/filter/reduce), windowing, joins
  importers/    — Markdown, CSV, JSON, HTML importers/exporters, deduplication, transforms
  query-builder/— SQL query builder, graph query builder, condition combinators
  template/     — Template engine (lexer, parser, compiler), filters, helpers
  i18n/         — Internationalization, plural rules, formatters, en/ko translations
  validation/   — Validator framework, string/number/date/graph rules, sanitizer
  math/         — Vector, matrix, PRNG, interpolation, geometry, QuadTree, number theory
  crypto/       — Hash (SHA-256, HMAC, Murmur3), AES-GCM encryption, tokens, passwords
  data-structures/— LinkedList, SkipList, Trie, BloomFilter, B-Tree, Red-Black Tree,
                    SegmentTree, IntervalTree, RingBuffer, LRU Cache
  state-machine/— FSM with guards, actions, hierarchical states, builder, presets

  # Testing & Quality
  testing/      — Test factories, custom matchers, fixtures, mocks, helpers
  analytics/    — Time series, graph metrics, search/user/content analytics, reports
  benchmarks/   — Benchmark runner, graph/search/CRDT benchmarks, data generators
  integration-tests/ — Cross-package integration tests

  # Presentation
  ui/           — React component library (Button, Input, Card, Badge, Spinner) +
                  Canvas2D graph visualization (renderer, physics, layout, camera, interaction)
  sdk/          — Client SDK for external API consumers
  config/       — Shared Vitest/TypeScript configs
```

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development (all packages)
pnpm dev

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @nexus/api test
pnpm --filter @nexus/graph test

# Run a single test file
pnpm --filter @nexus/graph vitest run src/__tests__/traversal.test.ts --no-cache

# Type check
pnpm typecheck

# Database migrations
pnpm --filter @nexus/db migrate
pnpm --filter @nexus/db generate

# Format
pnpm format
```

## Architecture Decisions

### Knowledge Graph Core
The `packages/graph/` module implements the core graph engine:
- Nodes represent knowledge entities (documents, concepts, tags, people, organizations, events, locations, resources)
- Edges represent typed relationships with metadata and weights
- 20+ algorithms: traversal (BFS, DFS), centrality (PageRank, betweenness, closeness, HITS), community detection, max-flow, link prediction, topological sort, shortest paths (Dijkstra, A*, Yen's K-shortest), random walks, graph partitioning, motif detection
- The graph engine is database-agnostic — it operates on in-memory structures loaded from the DB layer

### API Design
- RESTful endpoints for CRUD via Hono, GraphQL (with DataLoaders) for complex graph queries
- All endpoints validated with Zod schemas from `packages/shared/`
- Authentication via JWT (jose) with refresh token rotation and argon2 password hashing
- Rate limiting (token bucket, sliding window), circuit breaker, request caching with LRU + ETag

### Real-time Sync
- WebSocket server (`apps/ws/`) handles collaborative editing
- Dual approach: CRDT (packages/crdt/) for eventual consistency, OT (packages/collaboration/) for low-latency
- Presence awareness with cursor positions, selection ranges, activity status

### Search Architecture
- In-memory BM25 engine for full-text search with title boosting
- Vector search with cosine similarity for semantic matching
- Hybrid ranking via Reciprocal Rank Fusion (RRF) combining both

### Data Processing
- Import pipeline: parse → validate → deduplicate → transform → import (Markdown, CSV, JSON, HTML)
- Workflow engine with expression evaluator, conditional branching, parallel steps, triggers
- Event sourcing with sagas for distributed transaction patterns

## Code Conventions

- All packages use `@nexus/` npm scope
- Shared Zod schemas are the single source of truth for types (infer with `z.infer<>`)
- Database queries live in `packages/db/` — apps never import Drizzle directly
- Error types extend a base `NexusError` class with error codes
- Environment variables validated at startup via Zod schemas in each app's `env.ts`
- Barrel exports (`index.ts`) at package root only — no nested barrels
- Pure TypeScript implementations — minimal external dependencies for core packages

## Testing Strategy

- **Unit tests**: Pure functions, algorithms, validators — co-located in each package's `__tests__/`
- **Integration tests**: Cross-package tests in `packages/integration-tests/`
- **API tests**: Endpoint tests with Hono test client in `apps/api/src/__tests__/`
- **E2E tests**: Playwright user flows in `apps/web/e2e/`
- **Benchmarks**: Performance tests in `packages/benchmarks/`
- Use `vitest run --no-cache` to ensure tests actually execute
- Test factories and custom matchers available from `@nexus/testing`
