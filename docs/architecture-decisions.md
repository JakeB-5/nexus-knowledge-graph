# Architecture Decision Records (ADR)

> Documenting key architectural decisions made by the AI agent team

---

## ADR-001: Monorepo with pnpm Workspaces + Turborepo

**Status**: Accepted
**Context**: A knowledge graph platform requires many interconnected modules (graph engine, search, CRDT, NLP, etc.) that share types and utilities.
**Decision**: Use pnpm workspaces for package management and Turborepo for build orchestration.
**Consequences**:
- (+) Shared types via `@nexus/shared` prevent interface drift
- (+) Turborepo caches builds across packages
- (+) Single `pnpm install` for all dependencies
- (-) Initial setup complexity higher than polyrepo
- (-) CI must handle monorepo-aware caching

---

## ADR-002: Hono over Express for API Server

**Status**: Accepted
**Context**: Need a fast, lightweight HTTP framework for the REST API.
**Decision**: Use Hono instead of Express.
**Rationale**:
- Hono is built on Web Standards API (Request/Response), making it portable
- 10-50x faster than Express in benchmarks
- TypeScript-first with excellent type inference
- Smaller bundle size for serverless deployment
**Consequences**:
- (+) Fast, modern, excellent TypeScript support
- (-) Smaller ecosystem than Express
- (-) Some middleware patterns differ from Express convention

---

## ADR-003: Drizzle ORM over Prisma

**Status**: Accepted
**Context**: Need a TypeScript ORM for PostgreSQL with type-safe queries.
**Decision**: Use Drizzle ORM instead of Prisma.
**Rationale**:
- Drizzle generates SQL that maps 1:1 to what you write (no query engine)
- Schema defined in TypeScript (not a DSL)
- Relations defined separately from tables (more flexible)
- Significantly smaller runtime footprint
**Consequences**:
- (+) Full SQL control, no magic query engine
- (+) TypeScript schema = better IDE experience
- (-) Less ecosystem support than Prisma
- (-) Migration tooling less mature

---

## ADR-004: In-Memory Graph + Search Engines

**Status**: Accepted (with known limitations)
**Context**: Graph algorithms and search engines need fast access to data.
**Decision**: Implement graph and search engines as in-memory data structures, with DB as persistence layer.
**Rationale**:
- Graph algorithms require random access patterns incompatible with SQL queries
- BM25 and vector search are faster in memory
- DB serves as persistence, not computation layer
**Consequences**:
- (+) Blazing fast algorithm execution
- (+) Clean separation between computation and persistence
- (-) Data size limited by available memory
- (-) Requires loading data from DB on startup
- **Mitigation**: Load subgraphs on demand rather than entire graph

---

## ADR-005: CRDT + OT Dual Approach for Collaboration

**Status**: Accepted
**Context**: Real-time collaborative editing requires conflict resolution.
**Decision**: Implement both CRDT and OT, allow choosing per use case.
**Rationale**:
- CRDTs (packages/crdt/) guarantee eventual consistency without central server
- OT (packages/collaboration/) provides lower latency for text editing with central server
- Different use cases benefit from different approaches
**Consequences**:
- (+) Flexibility to choose based on requirements
- (+) CRDTs for offline-first, OT for real-time presence
- (-) Two systems to maintain
- (-) Need clear guidance on when to use which

---

## ADR-006: Zod as Single Source of Truth for Types

**Status**: Accepted
**Context**: Types need to be consistent across frontend, backend, SDK, and validation.
**Decision**: Define all domain types as Zod schemas in `@nexus/shared`, infer TypeScript types with `z.infer<>`.
**Rationale**:
- Zod schemas provide runtime validation AND compile-time types
- Single definition used for: API validation, frontend forms, SDK types, DB queries
- Changes propagate automatically across all consumers
**Consequences**:
- (+) No type drift between packages
- (+) Runtime validation "for free"
- (-) All packages depend on `@nexus/shared`
- (-) Zod adds bundle size

---

## ADR-007: Package-Per-Domain Architecture

**Status**: Accepted
**Context**: 29 parallel agents need clear ownership boundaries.
**Decision**: One package per domain (graph, search, crdt, nlp, etc.) with explicit dependency declarations.
**Rationale**:
- Clear ownership boundaries enable parallel development
- Explicit `package.json` dependencies prevent accidental coupling
- Each package can be tested, built, and versioned independently
**Consequences**:
- (+) 29 agents worked simultaneously without conflicts
- (+) Any package can be extracted to a separate repo
- (-) 44 packages may be over-modularized for a single team
- (-) Cross-package refactoring requires touching many package.json files

---

## ADR-008: Canvas2D over WebGL/SVG for Graph Visualization

**Status**: Accepted
**Context**: Graph visualization needs to render hundreds/thousands of nodes interactively.
**Decision**: Use Canvas2D for the main graph renderer, SVG for smaller chart components.
**Rationale**:
- Canvas2D handles thousands of nodes without DOM overhead
- Simpler programming model than WebGL
- SVG used for charts where DOM interaction (hover, click) matters
- No external dependencies (no D3, no Three.js)
**Consequences**:
- (+) Zero dependencies for visualization
- (+) Good performance up to ~10k nodes
- (-) Text rendering less crisp than SVG at high zoom
- (-) Accessibility harder with Canvas (no DOM nodes)

---

## ADR-009: Event Sourcing for Audit Trail

**Status**: Accepted
**Context**: Need complete audit trail of all changes for compliance and undo/redo.
**Decision**: Implement event sourcing pattern in `@nexus/events` with saga support.
**Rationale**:
- Every state change captured as an immutable event
- Full audit trail for compliance requirements
- Enables time-travel debugging and undo/redo
- Saga pattern handles distributed transaction compensation
**Consequences**:
- (+) Complete history of all changes
- (+) Can rebuild state from events
- (-) Event store grows over time (needs compaction)
- (-) Eventual consistency may confuse users expecting immediate updates

---

## ADR-010: No External ML/AI Libraries

**Status**: Accepted
**Context**: NLP and AI features need to work without external API keys or heavy dependencies.
**Decision**: Implement all NLP features in pure TypeScript, use provider abstraction for AI.
**Rationale**:
- Pure TypeScript NLP (tokenizer, TF-IDF, sentiment, NER) works offline
- AI provider abstraction allows swapping between OpenAI, local models, or mocks
- No dependency on Python, TensorFlow, or external services for core features
**Consequences**:
- (+) Works offline, no API keys needed for core NLP
- (+) Tiny bundle size vs. ML libraries
- (-) NLP quality lower than transformer-based models
- (-) Embeddings are bag-of-words, not contextual

---

*These ADRs document the decisions made by the AI agent team during autonomous construction of the Nexus platform.*
