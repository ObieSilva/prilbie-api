# Implementation Guide — Consistency App Backend

> **Purpose:** Strict, ordered implementation plan for `BACKEND_SPEC.MD`.
> Follow this document step-by-step. Never skip ahead. Mark each step done as you complete it.
>
> **Rule:** Every implementation session begins by reading this file to determine the next uncompleted step.

---

## How to Use This Guide

1. Each **Phase** must be completed before moving to the next.
2. Each **Step** within a phase must be completed in order.
3. A step is "done" when you replace `[ ]` with `[x]` after verifying it works.
4. Each step lists exactly which spec sections to reference and what files to create/modify.
5. Do NOT implement anything not listed in a step — no speculative features.
6. After completing a step, run the verification listed at the end of that step before proceeding.

---

## Phase 1: Project Scaffold & Infrastructure - DONE

Everything needed before writing a single business feature.

### Step 1.1 — Initialize NestJS Project - DONE

**Spec refs:** §1.1, §4 (project structure), Appendix C (dependencies)

**Do:**

- Initialize a new NestJS project using the NestJS CLI inside the repo root (the app lives at the repo root, NOT in a `backend/` subfolder — adapt the §4 tree accordingly).
- Configure `tsconfig.json` with `strict: true`.
- Install **production dependencies** from Appendix C.
- Install **dev dependencies** from Appendix C.
- Remove `class-validator` and `class-transformer` if the CLI added them.
- Create `.env.example` from §12.5.
- Create `.gitignore` (node_modules, dist, .env, etc.).

**Verify:** `npm run build` succeeds with zero errors.

---

### Step 1.2 — Docker & Local Dev Environment - DONE

**Spec refs:** §12.1 (Dockerfile), §12.2 (docker-compose.yml)

**Do:**

- Create `Dockerfile` exactly as specified in §12.1.
- Create `docker-compose.yml` exactly as specified in §12.2.
- Ensure `docker-compose up db` starts a working PostgreSQL 16 instance.

**Verify:** `docker-compose up db` starts cleanly; `psql` can connect to `consistency_app` database on port 5432.

---

### Step 1.3 — Prisma Setup & Database Schema - DONE

**Spec refs:** §2.2 (full Prisma schema), §2.3 (design decisions), §2.4 (PrismaService)

**Do:**

- Create `prisma/schema.prisma` with the complete schema from §2.2 (all models, enums, indexes, maps).
- Create `src/prisma/prisma.module.ts` — global module exporting `PrismaService`.
- Create `src/prisma/prisma.service.ts` — environment-aware connection from §2.4 (Neon adapter in prod, standard TCP locally).
- Run `npx prisma generate`.
- Run `npx prisma migrate dev --name init` against the Docker PostgreSQL.

**Verify:** Migration completes successfully. `npx prisma studio` shows all tables.

---

### Step 1.4 — App Module Shell, Global Prefix & main.ts - DONE

**Spec refs:** §1.3 (API versioning), §12.5–§12.6 (environment variables & validation), §13 (Swagger, helmet, compression, CORS, prefix)

**Do:**

- Implement bootstrap with the **same behavior** as §13 (Swagger, helmet, compression, CORS, global prefix with exclusions for health + webhook routes, shutdown hooks, pino logger). A thin `src/main.ts` plus a shared `src/configure-app.ts` (called from `main` and e2e) is the **preferred** pattern for DRY tests; §13’s inline `main.ts` remains the behavioral reference.
- Add `**src/config/env.schema.ts`** — Zod schema + `validateEnv` for `ConfigModule.forRoot({ validate })` per §12.6 (`DATABASE_URL` always required; `PORT` 1–65535 default 3001; `CLERK`_* required only when `NODE_ENV=production`; `test`/`development` may omit Clerk for partial local runs).
- In `src/main.ts`, listen using `**ConfigService.getOrThrow('PORT')`** after `NestFactory.create` so the port matches validated config.
- Create `src/app.module.ts` — imports `PrismaModule`, `LoggerModule` (§10.1), `ThrottlerModule` (§5.1), `validate` on `ConfigModule`, and applies `CorrelationIdMiddleware`.
- Register `**ThrottlerGuard`** and `**ClerkAuthGuard`** as `**APP_GUARD`** globally in `AppModule` (global limits require the throttler guard; see §5.1). The Clerk guard file is specified in Step 1.5 — create it here if needed so the module compiles.

**Verify:** `npm run start:dev` boots without errors. `GET http://localhost:3001/` returns 404 (no routes yet) but the server is running.

---

### Step 1.5 — Common Infrastructure (Guards, Decorators, Pipes, Filters, Interceptors, Middleware) - DONE

**Spec refs:** §3.2, §3.3, §5.0, §6.10, §10.2

**Implementation note:** This repo uses Zod v4, so adapt §6.10's `ZodSchema` sample to `ZodType`. `safeParse()` and `error.flatten()` still behave as expected for this step.

**Do:**

- Create `src/common/guards/clerk-auth.guard.ts` — ClerkAuthGuard from §3.2 (includes `@Public()` decorator + `IS_PUBLIC_KEY`) if not already added in Step 1.4.
- Create `src/common/middleware/correlation-id.middleware.ts` — from §10.2 if not already added in Step 1.4.
- Create `src/common/decorators/current-user.decorator.ts` — from §3.3.
- Create `src/common/pipes/zod-validation.pipe.ts` — from §6.10.
- Create `src/common/interceptors/transform.interceptor.ts` — wraps all responses in the `{ success, data, meta, error }` envelope from §5.0.
- Create `src/common/filters/http-exception.filter.ts` — catches all exceptions, formats them into the envelope, logs 5xx errors (§10.3).

**Verify:** All files compile. The guard, filter, interceptor, and middleware are registered in `AppModule` / `main.ts`. Server boots.

---

### Step 1.6 — Shared Schemas & Constants - DONE

**Spec refs:** §6.1 (enums.ts, shared.ts), §6.11 (dependency map), §7.2–§7.5 (constants), Appendix E (icons)

**Do:**

- Create `src/common/schemas/enums.ts` — `EffortLevelSchema`, `TimeAnchorSchema`, `ConversationTypeSchema`, `DateStringSchema`, `TimezoneSchema` from §6.1.
- Create `src/common/schemas/shared.ts` — `TierInputSchema`, `BundleLevelsSchema` from §6.1.
- Create `src/common/constants/momentum.ts` — `MOMENTUM_POINTS`, `MOMENTUM_TIERS`, `STREAK_MILESTONES` from §7.2, §7.3, §7.5.
- Create `src/common/constants/icons.ts` — `VALID_ICONS` set from Appendix E.
- Create `src/common/dto/pagination.dto.ts` — shared pagination Zod schema (page, pageSize).

**Verify:** Files compile. Importing from `enums.ts` and `shared.ts` in a scratch test works.

---

### Step 1.7 — Cache Module - DONE

**Spec refs:** §9.1–§9.3

**Do:**

- Create `src/cache/cache.interface.ts` — `ICacheService` interface from §9.2.
- Create `src/cache/memory-cache.service.ts` — in-memory implementation from §9.2.
- Create `src/cache/redis-cache.service.ts` — Upstash Redis implementation from §9.2.
- Create `src/cache/cache.module.ts` — global module with provider selection from §9.2.

**Verify:** Files compile. Module can be imported. In-memory cache works in local dev (no Redis needed yet).

---

### Step 1.8 — Health Module - DONE

**Spec refs:** §5.2

**Do:**

- Create `src/health/health.controller.ts` — `GET /health` (liveness) and `GET /health/ready` (readiness with DB check) from §5.2.
- These routes are OUTSIDE `/api/v1` prefix (already excluded in main.ts).
- Mark the controller with `@Public()` so the auth guard skips it.

**Verify:** `GET http://localhost:3001/health` → `{ "success": true, "data": { "status": "ok" } }`. `GET /health/ready` → 200 when DB is up, 503 when DB is down.

---

## Phase 2: Auth & User Management - DONE

### Step 2.1 — Auth Module (Clerk Webhook) - DONE

**Spec refs:** §3.4, §5.3

**Do:**

- Create `src/auth/auth.module.ts`.
- Create `src/auth/auth.controller.ts` — `POST /webhooks/clerk` handler from §3.4.
  - Verifies Svix webhook signature.
  - Handles `user.created`, `user.updated`, `user.deleted` events.
  - Route is OUTSIDE `/api/v1` prefix and marked `@Public()`.
  - Uses raw body for signature verification.

**Verify:** Webhook endpoint exists at `POST /webhooks/clerk`. Manual test with a mock Svix payload creates a `UserProfile` row in the database.

---

### Step 2.2 — Users Module (Profile + Onboarding) - DONE

**Spec refs:** §5.4, §6.8 (OnboardingSchema), §6.9 (UpdateUserSchema)

**Do:**

- Create `src/users/dto/update-user.dto.ts` — from §6.9.
- Create `src/users/dto/onboarding.dto.ts` — from §6.8 (imports `BundleLevelsSchema`).
- Create `src/users/users.service.ts`:
  - `getProfile(clerkUserId)` — finds UserProfile by `clerkUserId`, throws 404 if not found.
  - `updateProfile(clerkUserId, dto)` — partial update.
  - `onboard(clerkUserId, dto)` — atomic transaction: sets userName/timezone, creates System + "General" Area + ActionBundle + 3 Actions, sets `onboarded = true`. Returns full created tree.
  - `softDelete(clerkUserId)` — sets `deletedAt`.
- Create `src/users/users.controller.ts`:
  - `GET /users/me` — get profile.
  - `PATCH /users/me` — update profile.
  - `POST /users/me/onboard` — onboarding.
  - `DELETE /users/me` — soft-delete.
- Create `src/users/users.module.ts`.

**Verify:** All four user endpoints work via Swagger or curl (with a valid Clerk JWT or mocked auth).

---

## Phase 3: Core CRUD — Systems, Areas, Bundles - DONE

Each step delivers a fully working vertical slice: controller + service + DTOs + Zod validation.

### Step 3.1 — Systems Module - DONE

**Spec refs:** §5.5, §6.2, §7.4 (system health)

**Do:**

- Create `src/systems/dto/create-system.dto.ts` — from §6.2 (with icon validation against `VALID_ICONS`).
- Create `src/systems/dto/update-system.dto.ts` — from §6.2.
- Create `src/systems/dto/reorder-systems.dto.ts` — from §6.2.
- Create `src/systems/systems.service.ts`:
  - `list(userId)` — active systems with computed `areaCount`, `bundleCount`, `healthStatus`, `healthLabel` (§7.4).
  - `getById(userId, id)` — full detail with nested areas → bundles → actions.
  - `create(userId, dto)` — creates system + auto-creates "General" area.
  - `update(userId, id, dto)` — partial update with ownership check.
  - `softDelete(userId, id)` — sets `deletedAt` with ownership check.
  - `reorder(userId, dto)` — bulk `sortOrder` update in transaction.
- Create `src/systems/systems.controller.ts` — all six routes from §5.5.
- Create `src/systems/systems.module.ts`.

**Verify:** All system endpoints work. Creating a system auto-creates a "General" area. System health computes correctly.

---

### Step 3.2 — Areas Module - DONE

**Spec refs:** §5.6, §6.3

**Do:**

- Create `src/areas/dto/create-area.dto.ts` — from §6.3.
- Create `src/areas/dto/update-area.dto.ts` — update with optional name and sortOrder.
- Create `src/areas/areas.service.ts`:
  - `listBySystem(userId, systemId)` — with ownership verification.
  - `create(userId, systemId, dto)` — with ownership verification.
  - `update(userId, areaId, dto)` — with ownership verification.
  - `softDelete(userId, areaId)` — must validate it's NOT the last active area (§5.6 DELETE validation).
- Create `src/areas/areas.controller.ts` — all four routes from §5.6.
- Create `src/areas/areas.module.ts`.

**Verify:** All area endpoints work. Cannot delete the last active area in a system (returns 400).

---

### Step 3.3 — Action Bundles Module - DONE

**Spec refs:** §5.7, §6.4

**Do:**

- Create `src/action-bundles/dto/create-bundle.dto.ts` — imports `BundleLevelsSchema` from shared (§6.4).
- Create `src/action-bundles/dto/update-bundle.dto.ts` — imports `BundleLevelsSchema` from shared (§6.4).
- Create `src/action-bundles/action-bundles.service.ts`:
  - `listByArea(userId, areaId)` — with ownership verification, includes 3 actions.
  - `create(userId, areaId, dto)` — transaction: creates bundle + 3 Action rows (baseline/normal/stretch).
  - `update(userId, bundleId, dto)` — transaction: updates bundle title + upserts 3 actions.
  - `softDelete(userId, bundleId)` — sets `deletedAt` on bundle AND its actions.
- Create `src/action-bundles/action-bundles.controller.ts` — all four routes from §5.7.
- Create `src/action-bundles/action-bundles.module.ts`.

**Verify:** All bundle endpoints work. A bundle always has exactly 3 actions (baseline, normal, stretch). The `@@unique([bundleId, effortLevel])` constraint holds.

---

## Phase 4: Checkins, Energy & Reflections - DONE

### Step 4.1 — Checkins Module - DONE

**Spec refs:** §5.8, §6.5, §7.7 (expansion offers), §9.3 (cache invalidation)

**Do:**

- Create `src/checkins/dto/create-checkin.dto.ts` — from §6.5.
- Create `src/checkins/checkins.service.ts`:
  - `list(userId, filters)` — with query params: date, systemId, from, to, page, pageSize. Paginated.
  - `create(userId, dto)`:
    - Resolves `systemId`, `areaId`, `energyLevel` from the `actionId` chain (§5.8 IMPORTANT note).
    - Enforces `@@unique([actionId, date])` — returns 409 on duplicate.
    - Computes `expansionOffers` (§7.7) and includes them in the response.
    - Invalidates cache keys: `streak:{userId}`, `weekly-momentum:{userId}`, `today:{userId}:{date}`, `momentum-overview:{userId}` (§9.3).
  - `delete(userId, checkinId)` — with ownership check. Invalidates same cache keys.
- Create `src/checkins/checkins.controller.ts` — all three routes from §5.8.
- Create `src/checkins/checkins.module.ts`.

**Verify:** Creating a checkin auto-resolves systemId/areaId/energyLevel. Duplicate actionId+date returns 409. Expansion offers are returned correctly. Delete works with ownership.

---

### Step 4.2 — Energy Module - DONE

**Spec refs:** §5.9, §6.6

**Do:**

- Create `src/energy/dto/set-global-energy.dto.ts` — from §6.6.
- Create `src/energy/dto/set-system-energy.dto.ts` — from §6.6.
- Create `src/energy/energy.service.ts`:
  - `getByDate(userId, date)` — returns global level + system overrides map. 404 if no energy set.
  - `setGlobal(userId, date, dto)` — upserts DailyEnergy, clears existing SystemEnergyOverrides for that date.
  - `setSystemOverride(userId, date, systemId, dto)` — upserts override. Creates DailyEnergy first if needed (default to `normal`).
- Create `src/energy/energy.controller.ts` — all three routes from §5.9.
- Create `src/energy/energy.module.ts`.

**Verify:** Setting global energy clears overrides. Setting system override works. GET returns correct shape.

---

### Step 4.3 — Reflections Module - DONE

**Spec refs:** §5.10, §6.7

**Do:**

- Create `src/reflections/dto/upsert-reflection.dto.ts` — from §6.7.
- Create `src/reflections/reflections.service.ts`:
  - `getByDate(userId, date)` — returns reflection or 404.
  - `upsert(userId, date, dto)` — creates or updates.
- Create `src/reflections/reflections.controller.ts` — both routes from §5.10.
- Create `src/reflections/reflections.module.ts`.

**Verify:** PUT creates a new reflection. PUT again updates it. GET retrieves it.

---

## Phase 5: Computed Data — Momentum & Today - DONE

### Step 5.1 — Momentum Module - DONE

**Spec refs:** §5.11, §7.1 (streak), §7.2 (points), §7.3 (tiers), §9.3 (caching)

**Do:**

- Create `src/momentum/momentum.service.ts`:
  - `getOverview(userId)` — §5.11: streak (§7.1), totals, tier (§7.3), per-system stats. Cache result.
  - `getWeekGrid(userId)` — last 7 days with max effort level per day.
  - `getHistory(userId, page, pageSize)` — week-by-week paginated history.
  - `getWeekDetail(userId, weekStart)` — day-by-day for a specific week.
  - `getDayDetail(userId, date)` — per-system checkins + reflection for a single day.
  - Private `calculateStreak(userId)` — algorithm from §7.1, uses user's timezone.
- Create `src/momentum/momentum.controller.ts` — all five GET routes from §5.11.
- Create `src/momentum/momentum.module.ts`.

**Verify:** All momentum endpoints return correct computed data. Streak counts consecutive days correctly. Tiers are assigned from `MOMENTUM_TIERS` constant.

---

### Step 5.2 — Today Module - DONE

**Spec refs:** §5.12

**Do:**

- Create `src/today/today.service.ts`:
  - `getTodayPayload(userId)` — assembles the full `TodayPayload` from §5.12 in a single method. Aggregates data from UserProfile, Systems (with health), Areas, Bundles, Actions, today's checkins, energy, reflection, streak, weekly momentum, tier. Cache result.
- Create `src/today/today.controller.ts` — `GET /today`.
- Create `src/today/today.module.ts`.

**Verify:** `GET /api/v1/today` returns the full `TodayPayload` shape. All nested data is correct and matches the spec exactly.

---

## Phase 6: AI Coach - DONE

### Step 6.1 — AI Coach Module - DONE

**Spec refs:** §5.13, §8.1–§8.6

**Do:**

- Create `src/ai-coach/ai-coach.prompts.ts` — `buildSystemPrompt()` from §8.2.
- Create `src/ai-coach/dto/create-conversation.dto.ts`.
- Create `src/ai-coach/dto/send-message.dto.ts`.
- Create `src/ai-coach/dto/apply-suggestion.dto.ts`.
- Create `src/ai-coach/ai-coach.service.ts`:
  - `listConversations(userId)`.
  - `createConversation(userId, dto)`.
  - `getConversation(userId, id)` — with messages.
  - `deleteConversation(userId, id)`.
  - `sendMessage(userId, conversationId, dto)` — saves user message, calls AI, saves assistant reply, returns both.
  - `streamResponse(userId, conversationId, messageId)` — returns Observable for SSE streaming (§8.6).
  - `suggestSystems(userId, dto)` — structured AI suggestions.
  - `suggestActions(userId, dto)` — structured AI suggestions.
  - `applySuggestion(userId, dto)` — creates entities in transaction.
  - Private `buildUserContext(userId)` — assembles `UserContext` (§8.3).
- Create `src/ai-coach/ai-coach.controller.ts` — all nine routes from §5.13.
- Create `src/ai-coach/ai-coach.module.ts`.

**Verify:** Conversations CRUD works. Sending a message returns an AI reply (mock or real). Suggest and apply-suggestion endpoints work end-to-end. SSE streaming works.

---

## Phase 7: Rate Limiting & Swagger Polish

### Step 7.1 — Rate Limiting

**Spec refs:** §5.1

**Do:**

- Configure `@nestjs/throttler` in `AppModule` with the four rate limit scopes from §5.1:
  - Global: 100 req / 60s.
  - Write endpoints: 30 req / 60s.
  - AI chat messages: 30 req / 3600s.
  - AI suggestions: 10 req / 3600s.
- Apply throttle decorators to the relevant controllers/endpoints.

**Verify:** Exceeding rate limits returns 429 Too Many Requests.

---

### Step 7.2 — Swagger Annotations

**Spec refs:** §13

**Do:**

- Add `@ApiTags(...)` to every controller.
- Add `@ApiBearerAuth('clerk-jwt')` to all authenticated controllers.
- Use `nestjs-zod`'s `createZodDto` to auto-generate Swagger schemas from Zod definitions where beneficial.
- Verify all endpoints appear in Swagger UI with correct request/response shapes.

**Verify:** `GET /api/docs` shows all 44 endpoints, organized by tag, with correct DTOs.

---

## Phase 8: Testing

### Step 8.1 — Test Infrastructure

**Spec refs:** §11.1–§11.5

**Do:**

- Create `jest.config.ts` — with ts-jest, test paths.
- Create `.env.test` — test database URL.
- Create `test/setup.ts` — from §11.2 (migrate deploy, truncate between tests).
- Create `test/helpers/test-app.ts` — `createTestingModule` helper.
- Create `test/helpers/mock-auth.ts` — from §11.3.
- Create `test/helpers/mock-ai.ts` — from §11.4.

**Verify:** Running `npm test` finds and executes tests (even if none exist yet).

---

### Step 8.2 — Unit Tests

**Spec refs:** §11.1

**Do:**

- Write unit tests for business logic in these services (mocked Prisma):
  - `MomentumService` — streak calculation, tier assignment, points math.
  - `CheckinsService` — expansion offers logic, duplicate prevention, denormalization resolution.
  - `SystemsService` — system health computation.
  - `UsersService` — onboarding transaction correctness.

**Verify:** `npm run test:unit` passes. Coverage on business logic methods is meaningful.

---

### Step 8.3 — Integration / E2E Tests

**Spec refs:** §11.1

**Do:**

- Write integration tests (real test DB, mocked auth) for key workflows:
  - Onboarding flow: create user → onboard → verify system/area/bundle/actions exist.
  - Checkin flow: create system → create checkin → verify streak → delete checkin → verify streak resets.
  - Systems CRUD: create, update, soft-delete, reorder.
  - Energy + Reflection CRUD.
  - Momentum endpoints return correct computed data after checkins.
  - Today aggregate endpoint returns complete payload.

**Verify:** `npm run test:e2e` passes against the test database.

---

## Phase 9: Deployment

### Step 9.1 — Cloud Build & Cloud Run Setup

**Spec refs:** §12.3, §12.4, §12.5

**Do:**

- Create `cloudbuild.yaml` from §12.3.
- Set up GCP Secret Manager secrets for all env vars from §12.5.
- Set up Artifact Registry repo.
- Deploy to Cloud Run.
- Verify health endpoints respond.

**Verify:** `GET https://<cloud-run-url>/health` returns `{ status: "ok" }`. `GET /health/ready` returns 200. All authenticated endpoints work with real Clerk JWTs.

---

## Phase 10: Frontend Migration (Reference Only)

> This phase is NOT backend work — it is documented here for sequencing awareness only.
> See §14 of `BACKEND_SPEC.MD` for full details.

- Phase 14.1: Add API layer + React Query hooks.
- Phase 14.2: Remove Zustand store + client-side logic.
- Phase 14.3: Auth integration (ClerkProvider, sign-in routes).
- Phase 14.4: Update pages to use API data sources.
- Phase 14.5: Types cleanup.

---

## Quick Reference: Spec Section → Implementation Step


| Spec Section                | Step                                   |
| --------------------------- | -------------------------------------- |
| §1 Architecture Overview    | 1.4                                    |
| §2 Domain Model & Schema    | 1.3                                    |
| §3 Authentication (Clerk)   | 1.5, 2.1                               |
| §4 Project Structure        | 1.1                                    |
| §5.0 Response Envelope      | 1.5                                    |
| §5.1 Rate Limiting          | 1.4, 7.1                               |
| §5.2 Health                 | 1.8                                    |
| §5.3 Auth/Webhooks          | 2.1                                    |
| §5.4 Users                  | 2.2                                    |
| §5.5 Systems                | 3.1                                    |
| §5.6 Areas                  | 3.2                                    |
| §5.7 Action Bundles         | 3.3                                    |
| §5.8 Checkins               | 4.1                                    |
| §5.9 Daily Energy           | 4.2                                    |
| §5.10 Reflections           | 4.3                                    |
| §5.11 Momentum              | 5.1                                    |
| §5.12 Today                 | 5.2                                    |
| §5.13 AI Coach              | 6.1                                    |
| §6 Zod Schemas              | 1.6, then with each module             |
| §7 Business Logic           | 1.6 (constants), then with each module |
| §8 AI Coach Module          | 6.1                                    |
| §9 Caching Strategy         | 1.7                                    |
| §10 Logging & Observability | 1.4, 1.5                               |
| §11 Testing Strategy        | 8.1–8.3                                |
| §12 Docker & Deployment     | 1.2, 1.4, 9.1                          |
| §13 Swagger                 | 1.4, 7.2                               |
| §14 Migration Strategy      | 10 (reference only)                    |
| Appendix A (Endpoints)      | Cross-reference after Phase 6          |
| Appendix B (Auth Rules)     | Enforced in every service              |
| Appendix C (Dependencies)   | 1.1                                    |
| Appendix D (Frontend Types) | Reference only                         |
| Appendix E (Icons)          | 1.6                                    |


---

## Progress Tracker

```
Phase 1: Project Scaffold & Infrastructure
  [x] 1.1 — Initialize NestJS Project
  [x] 1.2 — Docker & Local Dev Environment
  [x] 1.3 — Prisma Setup & Database Schema
  [x] 1.4 — App Module Shell, Global Prefix & main.ts
  [x] 1.5 — Common Infrastructure
  [x] 1.6 — Shared Schemas & Constants
  [x] 1.7 — Cache Module
  [x] 1.8 — Health Module

Phase 2: Auth & User Management
  [x] 2.1 — Auth Module (Clerk Webhook)
  [x] 2.2 — Users Module (Profile + Onboarding)

Phase 3: Core CRUD
  [x] 3.1 — Systems Module
  [x] 3.2 — Areas Module
  [x] 3.3 — Action Bundles Module

Phase 4: Checkins, Energy & Reflections
  [x] 4.1 — Checkins Module
  [x] 4.2 — Energy Module
  [x] 4.3 — Reflections Module

Phase 5: Computed Data
  [x] 5.1 — Momentum Module
  [x] 5.2 — Today Module

Phase 6: AI Coach
  [x] 6.1 — AI Coach Module

Phase 7: Rate Limiting & Swagger
  [ ] 7.1 — Rate Limiting
  [ ] 7.2 — Swagger Annotations

Phase 8: Testing
  [ ] 8.1 — Test Infrastructure
  [ ] 8.2 — Unit Tests
  [ ] 8.3 — Integration / E2E Tests

Phase 9: Deployment
  [ ] 9.1 — Cloud Build & Cloud Run Setup

Phase 10: Frontend Migration
  [ ] Reference only — see §14
```

