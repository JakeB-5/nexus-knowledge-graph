# Nexus Improvement Roadmap

> Priority-ordered action items for production readiness

---

## Phase 1: Critical — Make It Work

### 1.1 Wire API Service Layer to Routes
**Status**: All 17 API route handlers return mock data
**Action**: Replace TODO stubs with actual service method calls
**Files**:
- `apps/api/src/routes/nodes.ts` → call `NodeService` methods
- `apps/api/src/routes/edges.ts` → call `EdgeService` methods
- `apps/api/src/routes/auth.ts` → call `AuthService` methods
- `apps/api/src/routes/graph.ts` → call `GraphService` methods
- `apps/api/src/routes/search.ts` → call `SearchService` methods

### 1.2 Connect Auth Middleware
**Status**: JWT auth middleware exists but is not applied
**Action**: Add `authMiddleware()` to protected route groups
**File**: `apps/api/src/app.ts`
```typescript
// Apply to all protected routes
app.use("/api/nodes/*", authMiddleware());
app.use("/api/edges/*", authMiddleware());
app.use("/api/graph/*", authMiddleware());
app.use("/api/search/*", authMiddleware());
```

### 1.3 Add LICENSE File
**Status**: Missing
**Action**: Create MIT LICENSE file at project root

### 1.4 Fix Data Structures Tests
**Status**: Reported as failing
**Action**: Run `pnpm --filter @nexus/data-structures test`, identify and fix failures

### 1.5 Commit pnpm-lock.yaml
**Status**: Not tracked in git
**Action**: `git add pnpm-lock.yaml && git commit`

---

## Phase 2: High Priority — Make It Secure & Tested

### 2.1 Rate Limit Auth Endpoints
**Action**: Apply stricter rate limiting to `/api/auth/*`
```typescript
app.use("/api/auth/*", rateLimiter({ windowMs: 60000, max: 5 }));
```

### 2.2 Add ESLint Configuration
**Action**: Create `eslint.config.js` with @typescript-eslint
**Impact**: Enables `pnpm lint` command

### 2.3 Add GraphQL Resolver Tests
**Action**: Create `packages/graphql/src/__tests__/` with resolver unit tests using mock DataLoaders

### 2.4 Add Web App Error Handling
**Action**: Create these Next.js conventional files:
- `apps/web/src/app/error.tsx` — Global error boundary
- `apps/web/src/app/not-found.tsx` — 404 page
- `apps/web/src/app/loading.tsx` — Global loading state

### 2.5 Add Security Headers
**Action**: Add Hono security middleware
```typescript
app.use("*", secureHeaders());
```

---

## Phase 3: Medium Priority — Make It Complete

### 3.1 Wire Frontend to API
**Action**: Replace mock data in dashboard/knowledge pages with actual API calls using the hooks in `apps/web/src/features/api/queries.ts`

### 3.2 Add Loading States
**Action**: Add `loading.tsx` files in key route groups:
- `apps/web/src/app/dashboard/loading.tsx`
- `apps/web/src/app/knowledge/loading.tsx`

### 3.3 Pin Node Version
**Action**: Create `.nvmrc` with `20` content

### 3.4 Verify Docker Build
**Action**: Run `docker build .` and fix any issues

### 3.5 Add React Component Tests
**Action**: Add `@testing-library/react` to `@nexus/ui` and test core components

---

## Phase 4: Polish — Make It Production-Ready

### 4.1 DB-Backed Search
**Action**: Add PostgreSQL tsvector full-text search alongside in-memory engine

### 4.2 Response Caching
**Action**: Add Cache-Control headers to GET endpoints

### 4.3 Type Safety Improvements
**Action**: Replace `as any` with proper generics, reduce `as never` Hono workarounds

### 4.4 API Documentation
**Action**: Add JSDoc comments to all exported functions in core packages

### 4.5 Dependency Management
**Action**: Add Dependabot configuration for automated security updates

---

## Verification Checklist

After implementing improvements, verify:

- [ ] `pnpm install` — No errors
- [ ] `pnpm build` — All packages build
- [ ] `pnpm test` — All tests pass
- [ ] `pnpm typecheck` — No TypeScript errors
- [ ] `pnpm lint` — No lint errors
- [ ] `docker build .` — Successful image build
- [ ] API `/health` endpoint — Returns 200
- [ ] Auth flow — Register → Login → Access protected route
- [ ] Search — Index document → Search → Get results

---

*This roadmap was generated from the completeness analysis and prioritized by production impact.*
