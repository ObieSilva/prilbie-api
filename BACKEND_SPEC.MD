# Prilbie API — Backend Specification Document

> **Purpose:** Canonical backend specification for the **`prilbie-api`** repository (Prilbie — life systems, habits, and daily consistency).
> **Stack:** NestJS · PostgreSQL (Neon) · Clerk Auth · Zod · Swagger · Docker · Google Cloud Run
> **Date:** April 2026
>
> **Source of truth:** If this document drifts, prefer the repository: **`Dockerfile`**, **`cloudbuild.yaml`**, **`prisma/schema.prisma`**, **`prisma.config.ts`**, **`src/config/env.schema.ts`**, and **`src/main.ts`** / **`src/configure-app.ts`**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Domain Model & Database Schema](#2-domain-model--database-schema)
3. [Authentication (Clerk)](#3-authentication-clerk)
4. [NestJS Project Structure](#4-nestjs-project-structure)
5. [API Specification](#5-api-specification)
6. [Zod Validation Schemas (DRY)](#6-zod-validation-schemas-dry)
7. [Business Logic & Computed Data](#7-business-logic--computed-data)
8. [AI Coach Module](#8-ai-coach-module)
9. [Caching Strategy](#9-caching-strategy)
10. [Logging & Observability](#10-logging--observability)
11. [Testing Strategy](#11-testing-strategy)
12. [Docker & Deployment (GCP + Neon)](#12-docker--deployment-gcp--neon)
13. [Swagger Configuration](#13-swagger-configuration)
14. [Migration Strategy (Frontend Cleanup)](#14-migration-strategy-frontend-cleanup)
15. [Appendix A — Complete API Endpoint Summary](#appendix-a-complete-api-endpoint-summary)
16. [Appendix B — Authorization Rules](#appendix-b-key-authorization-rules)
17. [Appendix C — Recommended npm Dependencies](#appendix-c-recommended-npm-dependencies)
18. [Appendix D — Frontend Domain Model Reference](#appendix-d-frontend-domain-model-reference)
19. [Appendix E — Valid Icon Names](#appendix-e-valid-icon-names)

---

## 1. Architecture Overview

### 1.1 Stack

| Layer        | Technology                                                |
| ------------ | --------------------------------------------------------- |
| Runtime      | Node.js 20+                                               |
| Framework    | NestJS (latest)                                           |
| Language     | TypeScript (strict mode)                                  |
| Database     | PostgreSQL 16 via **Neon** (serverless)                   |
| ORM          | Prisma (with `@prisma/adapter-neon` for serverless)       |
| Auth         | Clerk (JWT verification via `@clerk/backend`)             |
| Validation   | **Zod only** + `nestjs-zod` (no class-validator)          |
| API Docs     | Swagger via `@nestjs/swagger`                             |
| Caching      | Upstash Redis (serverless) or Google Memorystore          |
| AI           | OpenAI (`openai` package; default model `gpt-4o-mini`, override via `AI_MODEL`) |
| Logging      | `nestjs-pino` (structured JSON)                           |
| Container    | Docker + Docker Compose                                   |
| Hosting      | Google Cloud Run                                          |
| CI/CD        | Cloud Build or GitHub Actions                             |

### 1.2 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                      │
│          Clerk.js SDK → JWT in Authorization header        │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼────────────────────────────────┐
│                  Google Cloud Run                          │
│  ┌─────────────────────────────────────────────────────┐  │
│  │               NestJS Backend (Docker)                │  │
│  │                                                     │  │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────────────┐  │  │
│  │  │ Auth Guard │ │  CRUD    │ │   AI Coach        │  │  │
│  │  │ (Clerk)    │ │  Modules │ │   Module          │  │  │
│  │  └───────────┘ └──────────┘ └───────────────────┘  │  │
│  │        │              │               │             │  │
│  │  ┌─────▼──────────────▼───────────────▼──────────┐  │  │
│  │  │              Prisma ORM                        │  │  │
│  │  └──────────┬──────────────────┬─────────────────┘  │  │
│  └─────────────┼──────────────────┼────────────────────┘  │
│                │                  │                         │
│     ┌──────────▼──────┐   ┌──────▼──────────┐             │
│     │ Neon PostgreSQL  │   │ Upstash Redis   │             │
│     │ (serverless)     │   │ (cache)         │             │
│     └─────────────────┘   └─────────────────┘             │
└───────────────────────────────────────────────────────────┘
```

### 1.3 API Versioning

All API routes are prefixed with `/api/v1`. This allows introducing `/api/v2`
in the future without breaking existing clients.

```typescript
// Implemented in src/configure-app.ts (called from main.ts and e2e test app factory)
app.setGlobalPrefix('api/v1', {
  exclude: ['/health', '/health/ready', '/webhooks/clerk'],
});
```

---

## 2. Domain Model & Database Schema

### 2.1 Entity Relationship Overview

```
User (Clerk)
 └── 1:1 → UserProfile
           ├── 1:N → System
           │         ├── 1:N → Area
           │         │         └── 1:N → ActionBundle
           │         │                   └── 1:3 → Action (baseline, normal, stretch)
           │         └── 1:N → Checkin
           ├── 1:N → DailyEnergy
           │         └── 1:N → SystemEnergyOverride
           ├── 1:N → DailyReflection
           └── 1:N → AiConversation
                     └── 1:N → AiMessage
```

### 2.2 Prisma Schema

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
}

// ─── User Profile ────────────────────────────────────────

model UserProfile {
  id                String    @id @default(cuid())
  clerkUserId       String    @unique @map("clerk_user_id")
  userName          String    @map("user_name")
  onboarded         Boolean   @default(false)
  timezone          String    @default("UTC")
  lastReviewDate    DateTime? @map("last_review_date")
  lastMilestoneSeen Int       @default(0) @map("last_milestone_seen")
  focusedActionId   String?   @map("focused_action_id")
  focusedAt         DateTime? @map("focused_at")
  deletedAt         DateTime? @map("deleted_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  systems           System[]
  dailyEnergies     DailyEnergy[]
  dailyReflections  DailyReflection[]
  aiConversations   AiConversation[]

  @@map("user_profiles")
}

// ─── System ──────────────────────────────────────────────

model System {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  name          String
  icon          String
  replacedHabit String?   @map("replaced_habit")
  sortOrder     Int       @default(0) @map("sort_order")
  deletedAt     DateTime? @map("deleted_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  user          UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  areas         Area[]
  checkins      Checkin[]

  @@index([userId])
  @@index([userId, deletedAt])
  @@map("systems")
}

// ─── Area ────────────────────────────────────────────────

model Area {
  id        String    @id @default(cuid())
  systemId  String    @map("system_id")
  name      String
  sortOrder Int       @default(0) @map("sort_order")
  deletedAt DateTime? @map("deleted_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  system    System         @relation(fields: [systemId], references: [id], onDelete: Cascade)
  bundles   ActionBundle[]
  checkins  Checkin[]

  @@index([systemId])
  @@index([systemId, deletedAt])
  @@map("areas")
}

// ─── Action Bundle ───────────────────────────────────────

model ActionBundle {
  id          String    @id @default(cuid())
  areaId      String    @map("area_id")
  bundleTitle String?   @map("bundle_title")
  sortOrder   Int       @default(0) @map("sort_order")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  area        Area     @relation(fields: [areaId], references: [id], onDelete: Cascade)
  actions     Action[]

  @@index([areaId])
  @@index([areaId, deletedAt])
  @@map("action_bundles")
}

// ─── Action ──────────────────────────────────────────────

enum EffortLevel {
  baseline
  normal
  stretch
}

enum TimeAnchor {
  morning
  midday
  afternoon
  evening
  anytime
}

model Action {
  id           String      @id @default(cuid())
  bundleId     String      @map("bundle_id")
  title        String
  effortLevel  EffortLevel @map("effort_level")
  anchor       TimeAnchor  @default(anytime)
  deletedAt    DateTime?   @map("deleted_at")
  createdAt    DateTime    @default(now()) @map("created_at")
  updatedAt    DateTime    @updatedAt @map("updated_at")

  bundle       ActionBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  checkins     Checkin[]

  @@unique([bundleId, effortLevel])
  @@index([bundleId])
  @@map("actions")
}

// ─── Checkin ─────────────────────────────────────────────
//
// DELIBERATE DENORMALIZATION: systemId and areaId are stored directly
// on Checkin even though they can be derived via actionId → bundle → area → system.
// This is intentional for query performance:
//   - GET /checkins?systemId=X avoids a 3-table join
//   - GET /momentum/* aggregations group by systemId directly
//   - Streak calculation filters by userId+date without joins
// The service layer resolves and sets these from the action chain on create.
// They are never accepted from the client.

model Checkin {
  id           String      @id @default(cuid())
  systemId     String      @map("system_id")
  areaId       String      @map("area_id")
  actionId     String      @map("action_id")
  energyLevel  EffortLevel @map("energy_level")
  note         String?
  date         String      // ISO date string "YYYY-MM-DD" (in user's timezone)
  createdAt    DateTime    @default(now()) @map("created_at")

  system       System  @relation(fields: [systemId], references: [id], onDelete: Cascade)
  area         Area    @relation(fields: [areaId], references: [id], onDelete: Cascade)
  action       Action  @relation(fields: [actionId], references: [id], onDelete: Cascade)

  @@unique([actionId, date])
  @@index([systemId])
  @@index([areaId])
  @@index([date])
  @@index([systemId, date])
  @@map("checkins")
}

// ─── Daily Energy ────────────────────────────────────────

model DailyEnergy {
  id           String       @id @default(cuid())
  userId       String       @map("user_id")
  date         String       // "YYYY-MM-DD"
  globalLevel  EffortLevel  @map("global_level")
  createdAt    DateTime     @default(now()) @map("created_at")
  updatedAt    DateTime     @updatedAt @map("updated_at")

  user         UserProfile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  overrides    SystemEnergyOverride[]

  @@unique([userId, date])
  @@map("daily_energies")
}

model SystemEnergyOverride {
  id            String       @id @default(cuid())
  dailyEnergyId String       @map("daily_energy_id")
  systemId      String       @map("system_id")
  level         EffortLevel

  dailyEnergy   DailyEnergy  @relation(fields: [dailyEnergyId], references: [id], onDelete: Cascade)

  @@unique([dailyEnergyId, systemId])
  @@map("system_energy_overrides")
}

// ─── Daily Reflection ────────────────────────────────────

model DailyReflection {
  id        String      @id @default(cuid())
  userId    String      @map("user_id")
  date      String      // "YYYY-MM-DD"
  text      String
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")

  user      UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date])
  @@map("daily_reflections")
}

// ─── AI Coach ────────────────────────────────────────────

enum ConversationType {
  coaching
  system_builder
  general_chat
}

model AiConversation {
  id        String            @id @default(cuid())
  userId    String            @map("user_id")
  type      ConversationType  @default(general_chat)
  title     String?
  createdAt DateTime          @default(now()) @map("created_at")
  updatedAt DateTime          @updatedAt @map("updated_at")

  user      UserProfile       @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  AiMessage[]

  @@index([userId])
  @@map("ai_conversations")
}

enum MessageRole {
  user
  assistant
  system
}

model AiMessage {
  id             String         @id @default(cuid())
  conversationId String         @map("conversation_id")
  role           MessageRole
  content        String
  metadata       Json?          // structured data: suggested systems, actions, etc.
  createdAt      DateTime       @default(now()) @map("created_at")

  conversation   AiConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("ai_messages")
}
```

**Prisma 7:** The database URL is **not** declared in `schema.prisma`. It is supplied via **`prisma.config.ts`**, which loads the repo-root `.env` using **`src/config/root-env-path.ts`** and `env('DATABASE_URL')` for CLI commands (`generate`, `migrate`, etc.).

### 2.3 Key Schema Design Decisions

1. **ActionBundle is a first-class entity.** In the current frontend, bundles are implicitly
   represented by a shared `bundleId` string across 3 `Action` rows stored in a flat array.
   In the database, `ActionBundle` is its own table with a `bundleTitle`, and each `Action`
   references its bundle via a foreign key. The `@@unique([bundleId, effortLevel])` constraint
   enforces exactly one action per effort level per bundle.

2. **DailyEnergy is normalized.** Instead of the frontend's `Record<date, level>` plus
   `Record<date, Record<systemId, level>>`, we have a `DailyEnergy` row per user+date with
   a `globalLevel`, and a child `SystemEnergyOverride` table for per-system overrides.

3. **Checkin.date is a string** (`"YYYY-MM-DD"`) calculated using the user's `timezone`
   to match the frontend's behavior of date-based grouping. The backend resolves "today"
   using the user's timezone, not server UTC.

4. **Checkin denormalizes systemId and areaId** — see comment block in schema above.
   These fields are derived by the service from the action→bundle→area→system chain on
   create and are never accepted from the client. This trades a small write overhead for
   major query performance gains on reads (no 3-table joins for filtering/grouping).

5. **One checkin per action per day.** The `@@unique([actionId, date])` constraint
   prevents duplicate check-ins for the same action on the same date. The service layer
   returns a `409 Conflict` if the user attempts to check in the same action twice on
   the same day.

6. **Soft deletes** on UserProfile, System, Area, ActionBundle, and Action via nullable
   `deletedAt`. All list queries filter `WHERE deleted_at IS NULL`. A scheduled job
   hard-deletes rows older than 30 days. This protects against accidental data loss
   and supports undo. `DELETE /api/v1/users/me` sets `deletedAt` on the UserProfile;
   a Clerk user deletion webhook triggers the hard-delete after the retention period.

7. **sortOrder** on System, Area, and ActionBundle lets users reorder items.
   Default 0; clients send explicit ordering via PATCH.

8. **timezone** on UserProfile for correct date boundaries. The frontend sends dates as
   `YYYY-MM-DD` strings based on the user's local time; the backend validates streak
   calculations and "today" logic against this timezone.

9. **focusedActionId / focusedAt** on UserProfile persists the user's focused action
   across sessions. This was previously ephemeral in the frontend's Zustand store.

10. **clerkUserId** on `UserProfile` maps to Clerk's external user ID. All other tables
    reference the internal `UserProfile.id`.

11. **Neon PostgreSQL** — Serverless PostgreSQL. Use `@prisma/adapter-neon` with the
    `ws` WebSocket library for serverless connection pooling. No need for PgBouncer.

### 2.4 Prisma Connection Setup (Environment-Aware)

`createPrismaClientOptions()` in **`src/prisma/prisma-client.factory.ts`** returns Neon
adapter options when `USE_NEON=true`, otherwise `undefined` (default Prisma TCP client).
**`src/prisma/prisma.service.ts`** applies those options in its constructor and implements
`OnModuleInit` / `OnModuleDestroy` for connect/disconnect.

When `USE_NEON=true`, the factory uses **`PrismaNeon`** from `@prisma/adapter-neon` with
`@neondatabase/serverless` **`neonConfig.webSocketConstructor = ws`** (not a `Pool` passed
into the adapter — the adapter is constructed with `{ connectionString }` per Prisma 7).

Set `USE_NEON=true` in production (Cloud Run) and omit it (or set to `false`) when using
local Docker Compose Postgres.

---

## 3. Authentication (Clerk)

### 3.1 Overview

The frontend uses `@clerk/nextjs` to sign users in and obtain a JWT. Every API request
sends the JWT in the `Authorization: Bearer <token>` header. The backend verifies the JWT
using `@clerk/backend` and extracts the Clerk user ID from `payload.sub`.

### 3.2 Auth Guard Implementation

Use **`verifyToken`** from `@clerk/backend` **v3** (standalone function). Older examples that call `createClerkClient().verifyToken` are obsolete for current SDK versions.

```typescript
// src/common/guards/clerk-auth.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        jwtKey: process.env.CLERK_JWT_KEY,
      });
      const sub = payload.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new UnauthorizedException('Invalid token');
      }
      request.auth = { userId: sub };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.debug('Clerk JWT verification failed');
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### 3.3 Current User Decorator

```typescript
// src/common/decorators/current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth; // { userId: string }
  },
);
```

### 3.4 Clerk Webhook (User Sync)

Register a Clerk webhook for `user.created`, `user.updated`, and `user.deleted` events
to auto-provision, update, and clean up `UserProfile` rows.

Endpoint: `POST /webhooks/clerk` (outside the `/api/v1` prefix)

This endpoint is NOT behind the auth guard. It verifies the Svix webhook signature
from Clerk using the `svix` npm package.

```typescript
// Pseudocode for webhook handler
async handleClerkWebhook(rawBody: Buffer, headers: Record<string, string>) {
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  const event = wh.verify(rawBody, headers);

  switch (event.type) {
    case 'user.created':
      await prisma.userProfile.create({
        data: {
          clerkUserId: event.data.id,
          userName: event.data.first_name || 'Friend',
        },
      });
      break;
    case 'user.updated':
      await prisma.userProfile.update({
        where: { clerkUserId: event.data.id },
        data: { userName: event.data.first_name },
      });
      break;
    case 'user.deleted':
      await prisma.userProfile.delete({
        where: { clerkUserId: event.data.id },
      });
      break;
  }
}
```

---

## 4. NestJS Project Structure

Repository root **`prilbie-api/`** (illustrative tree; see repo for full file list).
**Unit tests** are co-located as **`src/**/*.spec.ts`** (`jest.config.ts`); **`test/`** holds e2e only.

```
prilbie-api/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── prisma.config.ts                        // Prisma 7: DATABASE_URL for CLI
├── src/
│   ├── main.ts                             // NestFactory + rawBody: true; configureApp()
│   ├── configure-app.ts                    // helmet, CORS, global prefix, Swagger
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.schema.ts                   // Zod validateEnv for ConfigModule
│   │   └── root-env-path.ts                // repo-root .env path for Prisma CLI
│   ├── common/
│   │   ├── guards/
│   │   │   └── clerk-auth.guard.ts
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── middleware/
│   │   │   └── correlation-id.middleware.ts
│   │   ├── pipes/
│   │   │   └── zod-validation.pipe.ts
│   │   ├── schemas/
│   │   │   ├── enums.ts
│   │   │   └── shared.ts
│   │   ├── constants/
│   │   │   ├── momentum.ts
│   │   │   ├── icons.ts
│   │   │   ├── rate-limits.ts
│   │   │   └── http-headers.ts
│   │   ├── types/
│   │   │   ├── api-response.ts
│   │   │   └── authenticated-request.ts
│   │   ├── utils/
│   │   │   ├── date.utils.ts
│   │   │   └── system-health.utils.ts
│   │   └── dto/
│   │       └── pagination.dto.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── prisma-client.factory.ts        // USE_NEON + PrismaNeon adapter
│   ├── cache/
│   │   ├── cache.module.ts
│   │   ├── cache.interface.ts
│   │   ├── redis-cache.service.ts          // Upstash REST (@upstash/redis)
│   │   └── memory-cache.service.ts         // fallback when Upstash unset
│   ├── auth/
│   │   ├── auth.module.ts
│   │   └── auth.controller.ts              // POST /webhooks/clerk (Svix)
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │       ├── update-user.dto.ts
│   │       └── onboarding.dto.ts
│   ├── systems/
│   │   ├── systems.module.ts
│   │   ├── systems.controller.ts
│   │   ├── systems.service.ts
│   │   └── dto/
│   │       ├── create-system.dto.ts
│   │       ├── update-system.dto.ts
│   │       └── reorder-systems.dto.ts
│   ├── areas/
│   │   └── …
│   ├── action-bundles/
│   │   └── …
│   ├── checkins/
│   │   └── …
│   ├── energy/
│   │   └── …
│   ├── reflections/
│   │   └── …
│   ├── momentum/
│   │   └── …
│   ├── today/
│   │   └── …
│   ├── ai-coach/
│   │   ├── ai-coach.module.ts
│   │   ├── ai-coach.controller.ts
│   │   ├── ai-coach.service.ts
│   │   ├── ai-coach.prompts.ts
│   │   └── dto/
│   │       ├── create-conversation.dto.ts
│   │       ├── send-message.dto.ts
│   │       ├── suggest-systems.dto.ts
│   │       ├── suggest-actions.dto.ts
│   │       └── apply-suggestion.dto.ts
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts
├── test/
│   ├── setup.ts                            // loads .env.test
│   ├── setup-e2e-clerk.ts
│   ├── global-setup-e2e.js                 // prisma migrate deploy once per e2e run
│   ├── jest-e2e.json
│   ├── helpers/                            // test-app, mock-auth, mock-ai, e2e helpers, …
│   └── e2e/
│       ├── app.e2e-spec.ts
│       ├── onboarding.e2e-spec.ts
│       ├── systems.e2e-spec.ts
│       ├── checkins-momentum.e2e-spec.ts
│       ├── energy-reflections.e2e-spec.ts
│       └── today.e2e-spec.ts
├── Dockerfile
├── docker-compose.yml
├── cloudbuild.yaml
├── .env.example
├── .env.test.example
├── jest.config.ts
├── package.json
└── README.md
```

### 4.1 Module Dependencies

```
AppModule
 ├── PrismaModule          (global)
 ├── CacheModule           (global — Upstash Redis)
 ├── AuthModule
 ├── UsersModule
 ├── SystemsModule
 ├── AreasModule
 ├── ActionBundlesModule
 ├── CheckinsModule
 ├── EnergyModule
 ├── ReflectionsModule
 ├── MomentumModule        (read-only computed data)
 ├── TodayModule           (read-only aggregate endpoint)
 ├── AiCoachModule
 ├── HealthModule
 └── ThrottlerModule       (global rate limiting)
```

### 4.2 Build Order

Modules follow this dependency order (implemented in **`app.module.ts`**):

1. PrismaModule (Neon DB connection)
2. CacheModule (Upstash Redis)
3. HealthModule (liveness + readiness probes)
4. AuthModule (Clerk webhook + guard)
5. UsersModule (profile + onboarding)
6. SystemsModule
7. AreasModule
8. ActionBundlesModule
9. CheckinsModule
10. EnergyModule
11. ReflectionsModule
12. MomentumModule
13. TodayModule
14. AiCoachModule

---

## 5. API Specification

All endpoints under `/api/v1` (except health and webhook) require:
`Authorization: Bearer <clerk_jwt>`

### 5.0 Standard Response Envelope

All responses use this shape:

```typescript
{
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}
```

### 5.1 Rate Limiting

Applied globally via `@nestjs/throttler`:

| Scope             | Limit                          |
| ----------------- | ------------------------------ |
| Global            | 100 requests / 60 seconds      |
| Write endpoints   | 30 requests / 60 seconds       |
| AI chat messages  | 30 requests / 3600 seconds     |
| AI suggestions    | 10 requests / 3600 seconds     |

---

### 5.2 Health

These endpoints are OUTSIDE the `/api/v1` prefix and have no auth.

| Method | Path             | Description                                                    |
| ------ | ---------------- | -------------------------------------------------------------- |
| GET    | `/health`        | Liveness probe — returns `{ status: "ok" }`                    |
| GET    | `/health/ready`  | Readiness probe — checks DB connectivity, returns 200 or 503   |

Readiness probe implementation:

```typescript
@Get('ready')
async ready() {
  try {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  } catch {
    throw new ServiceUnavailableException('Database not reachable');
  }
}
```

---

### 5.3 Auth / Webhooks

Outside `/api/v1` prefix.

| Method | Path              | Auth        | Description                                        |
| ------ | ----------------- | ----------- | -------------------------------------------------- |
| POST   | `/webhooks/clerk` | Webhook sig | Provisions UserProfile on user.created, syncs on   |
|        |                   |             | user.updated, cleans up on user.deleted             |

---

### 5.4 Users

| Method | Path                      | Description                                      |
| ------ | ------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/users/me`        | Get current user profile                         |
| PATCH  | `/api/v1/users/me`        | Update profile                                   |
| POST   | `/api/v1/users/me/onboard`| Complete onboarding in one atomic transaction    |
| DELETE | `/api/v1/users/me`        | Soft-delete account (hard-delete after 30 days)  |

**PATCH /api/v1/users/me — UpdateUserDto:**

```typescript
{
  userName?: string;           // 1-100 chars
  timezone?: string;           // IANA timezone, e.g. "America/New_York"
  lastMilestoneSeen?: number;  // >= 0
  lastReviewDate?: string;     // ISO date "YYYY-MM-DD"
  focusedActionId?: string | null;
}
```

**POST /api/v1/users/me/onboard — OnboardingDto:**

This is a transactional endpoint. One API call creates everything atomically:
sets userName and timezone, creates first system + "General" area + action bundle
(3 actions), and sets onboarded=true. The `accountCreatedAt` field in API responses
is derived from `UserProfile.createdAt` — no separate column is needed.

```typescript
{
  userName: string;                              // 1-100 chars
  timezone: string;                              // IANA timezone
  system: {
    name: string;                                // 1-100 chars
    icon: string;                                // valid AppIconName
    replacedHabit?: string;                      // max 200 chars
  };
  bundle: {                                      // uses shared BundleLevelsSchema
    bundleTitle: string;
    baseline: { title: string; anchor: TimeAnchor };
    normal:   { title: string; anchor: TimeAnchor };
    stretch:  { title: string; anchor: TimeAnchor };
  };
}
```

**Response:** UserProfile + created System + Area + ActionBundle with Actions.

---

### 5.5 Systems

| Method | Path                          | Description                                             |
| ------ | ----------------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/systems`             | List all active systems for current user                |
| POST   | `/api/v1/systems`             | Create system (auto-creates "General" area)             |
| GET    | `/api/v1/systems/:id`         | Get system detail (includes areas, bundles, actions)     |
| PATCH  | `/api/v1/systems/:id`         | Update system (name, icon, replacedHabit, sortOrder)    |
| DELETE | `/api/v1/systems/:id`         | Soft-delete system (sets deletedAt)                     |
| PATCH  | `/api/v1/systems/reorder`     | Reorder systems (bulk sortOrder update)                 |

**POST — CreateSystemDto:**

```typescript
{
  name: string;              // 1-100 chars, trimmed
  icon: string;              // valid icon name from AppIconName set
  replacedHabit?: string;    // max 200 chars, trimmed
}
```

**PATCH /api/v1/systems/reorder — ReorderSystemsDto:**

```typescript
{
  orderedIds: string[];  // system IDs in desired order; index becomes sortOrder
}
```

The service sets `sortOrder = index` for each ID in the array within a single
transaction. Returns 400 if any ID is not owned by the current user or does not exist.

**GET /api/v1/systems response (list):**

Each system includes computed fields. Only returns systems where `deletedAt IS NULL`.

```typescript
{
  id: string;
  name: string;
  icon: string;
  replacedHabit: string | null;
  sortOrder: number;
  createdAt: string;
  areaCount: number;          // computed
  bundleCount: number;        // computed
  healthStatus: HealthStatus; // computed
  healthLabel: string;        // computed
}
```

**GET /api/v1/systems/:id response (detail):**

```typescript
{
  id: string;
  name: string;
  icon: string;
  replacedHabit: string | null;
  sortOrder: number;
  createdAt: string;
  healthStatus: HealthStatus;
  healthLabel: string;
  areas: Array<{
    id: string;
    name: string;
    sortOrder: number;
    createdAt: string;
    bundles: Array<{
      id: string;
      bundleTitle: string | null;
      sortOrder: number;
      actions: Array<{
        id: string;
        title: string;
        effortLevel: EffortLevel;
        anchor: TimeAnchor;
      }>;
    }>;
  }>;
}
```

All lists filter `WHERE deleted_at IS NULL` and order by `sortOrder ASC, createdAt ASC`.

---

### 5.6 Areas

| Method | Path                                    | Description                                 |
| ------ | --------------------------------------- | ------------------------------------------- |
| GET    | `/api/v1/systems/:systemId/areas`       | List areas for a system                     |
| POST   | `/api/v1/systems/:systemId/areas`       | Create area                                 |
| PATCH  | `/api/v1/areas/:id`                     | Update area (name, sortOrder)               |
| DELETE | `/api/v1/areas/:id`                     | Soft-delete area (must not be last active)  |

**POST — CreateAreaDto:**

```typescript
{
  name: string;  // 1-100 chars, trimmed
}
```

**DELETE validation:**
Return 400 if deleting would leave the system with zero active (non-deleted) areas.

---

### 5.7 Action Bundles

A "bundle" is a group of exactly 3 actions (baseline, normal, stretch) representing
escalating effort levels of the same behavior.

| Method | Path                                | Description                                       |
| ------ | ----------------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/areas/:areaId/bundles`     | List bundles for an area (each with 3 actions)    |
| POST   | `/api/v1/areas/:areaId/bundles`     | Create bundle (creates 3 actions atomically)      |
| PATCH  | `/api/v1/bundles/:id`               | Update bundle (updates all 3 actions + title)     |
| DELETE | `/api/v1/bundles/:id`               | Soft-delete bundle (sets deletedAt on bundle + actions) |

**POST/PATCH — uses shared BundleLevelsSchema:**

```typescript
{
  bundleTitle: string;                             // optional label, max 200 chars
  baseline: { title: string; anchor: TimeAnchor }; // title 1-200 chars
  normal:   { title: string; anchor: TimeAnchor }; // title 1-200 chars
  stretch:  { title: string; anchor: TimeAnchor }; // title 1-200 chars
}
```

The service layer handles creating/updating/deleting the 3 Action rows
in a Prisma transaction.

**Response shape:**

```typescript
{
  id: string;
  bundleTitle: string | null;
  areaId: string;
  sortOrder: number;
  actions: [
    { id: string; title: string; effortLevel: "baseline"; anchor: TimeAnchor },
    { id: string; title: string; effortLevel: "normal";   anchor: TimeAnchor },
    { id: string; title: string; effortLevel: "stretch";  anchor: TimeAnchor },
  ];
}
```

---

### 5.8 Checkins

| Method | Path                      | Description                  |
| ------ | ------------------------- | ---------------------------- |
| GET    | `/api/v1/checkins`        | List checkins with filters   |
| POST   | `/api/v1/checkins`        | Create checkin               |
| DELETE | `/api/v1/checkins/:id`    | Undo/remove checkin          |

**GET query parameters:**

| Param      | Type   | Description                         |
| ---------- | ------ | ----------------------------------- |
| date       | string | Filter by exact date "YYYY-MM-DD"   |
| systemId   | string | Filter by system                    |
| from       | string | Start date (inclusive)              |
| to         | string | End date (inclusive)                |
| page       | number | Page number (default 1)            |
| pageSize   | number | Items per page (default 50, max 200)|

**POST — CreateCheckinDto:**

```typescript
{
  actionId: string;          // the specific action completed
  date: string;              // "YYYY-MM-DD"
  note?: string;             // max 500 chars, trimmed
}
```

IMPORTANT: The service resolves `systemId`, `areaId`, AND `energyLevel` from the
`actionId`'s chain. The client only sends `actionId` and `date`. This prevents
mismatches and enforces referential integrity server-side:
- `energyLevel` ← `action.effortLevel`
- `areaId` ← `action.bundle.areaId`
- `systemId` ← `action.bundle.area.systemId`

UNIQUENESS: A user can only check in a given action once per date. Attempting to
create a duplicate checkin for the same `actionId` + `date` returns `409 Conflict`.

**POST response** includes `expansionOffers` — next-tier actions to offer
after completing the checked-in action:

```typescript
{
  checkin: Checkin;
  expansionOffers: Array<{
    actionId: string;
    title: string;
    effortLevel: EffortLevel;
    momentumPoints: number;
    alreadyDoneToday: boolean;
  }>;
}
```

**Side effects on write/delete:**
- Invalidate cached streak for this user
- Invalidate cached weekly momentum for this user

---

### 5.9 Daily Energy

| Method | Path                                             | Description                             |
| ------ | ------------------------------------------------ | --------------------------------------- |
| GET    | `/api/v1/energy/:date`                           | Get energy for a date (global + overrides) |
| PUT    | `/api/v1/energy/:date`                           | Set global energy for date (clears overrides) |
| PUT    | `/api/v1/energy/:date/systems/:systemId`         | Set system-specific energy override     |

**PUT /api/v1/energy/:date — SetGlobalEnergyDto:**

```typescript
{
  level: EffortLevel;  // "baseline" | "normal" | "stretch"
}
```

Setting global energy clears all system-level overrides for that date.

**PUT /api/v1/energy/:date/systems/:systemId — SetSystemEnergyDto:**

```typescript
{
  level: EffortLevel;
}
```

**GET response:**

```typescript
{
  date: string;
  globalLevel: EffortLevel;
  overrides: Record<string, EffortLevel>;  // systemId → level
}
```

Returns null/404 if no energy set for that date.

---

### 5.10 Reflections

| Method | Path                            | Description                    |
| ------ | ------------------------------- | ------------------------------ |
| GET    | `/api/v1/reflections/:date`     | Get reflection for a date      |
| PUT    | `/api/v1/reflections/:date`     | Create or update reflection    |

**PUT — UpsertReflectionDto:**

```typescript
{
  text: string;  // 1-2000 chars, trimmed
}
```

---

### 5.11 Momentum (Read-Only Computed Data)

All endpoints are GET only. No writes. Results are cached (see Section 9).

| Method | Path                                     | Description                                |
| ------ | ---------------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/momentum/overview`              | Dashboard: streak, totals, tier, per-system |
| GET    | `/api/v1/momentum/week-grid`             | Last 7 days with max effort level per day  |
| GET    | `/api/v1/momentum/history`               | Week-by-week history (paginated)           |
| GET    | `/api/v1/momentum/weeks/:weekStart`      | Day-by-day detail for a specific week      |
| GET    | `/api/v1/momentum/days/:date`            | Single day detail: per-system checkins     |

**GET /api/v1/momentum/overview response:**

```typescript
{
  streak: number;
  totalActiveDays: number;
  totalCheckins: number;
  totalMomentum: number;
  baselineCount: number;
  normalCount: number;
  stretchCount: number;
  weeklyMomentum: number;
  bestWeekMomentum: number;
  momentumTier: {
    label: string;       // e.g. "In Motion"
    threshold: number;   // e.g. 40
  };
  nextTier: {
    label: string;
    threshold: number;
  } | null;
  perSystemStats: Array<{
    systemId: string;
    systemName: string;
    systemIcon: string;
    total: number;
    baseline: number;
    normal: number;
    stretch: number;
  }>;
}
```

**GET /api/v1/momentum/week-grid response:**

```typescript
Array<{
  date: string;          // "YYYY-MM-DD"
  maxLevel: EffortLevel | null;
  checkinCount: number;
}>
```

**GET /api/v1/momentum/history response:**

```typescript
{
  data: Array<{
    weekStart: string;     // "YYYY-MM-DD" (Monday)
    weekEnd: string;       // "YYYY-MM-DD" (Sunday)
    totalMomentum: number;
  }>;
  meta: { page: number; pageSize: number; total: number };
}
```

**GET /api/v1/momentum/weeks/:weekStart response:**

```typescript
Array<{
  date: string;
  momentum: number;
  checkinCount: number;
}>
// 7 entries (Mon-Sun) for the specified week.
```

**GET /api/v1/momentum/days/:date response:**

```typescript
{
  date: string;
  totalMomentum: number;
  reflection: string | null;
  systems: Array<{
    systemId: string;
    systemName: string;
    systemIcon: string;
    momentum: number;
    checkins: Array<{
      id: string;
      actionTitle: string;
      energyLevel: EffortLevel;
      points: number;
      note: string | null;
    }>;
  }>;
}
```

---

### 5.12 Today (Convenience Aggregate)

A single endpoint that returns everything the Today page needs in one round-trip.

| Method | Path              | Description             |
| ------ | ----------------- | ----------------------- |
| GET    | `/api/v1/today`   | Aggregated today data   |

**Response — TodayPayload:**

```typescript
{
  user: {
    userName: string;
    onboarded: boolean;
    timezone: string;
    lastReviewDate: string | null;
    lastMilestoneSeen: number;
    accountCreatedAt: string | null;    // maps to UserProfile.createdAt (ISO string)
    focusedActionId: string | null;
  };
  energy: {
    globalLevel: EffortLevel | null;
    overrides: Record<string, EffortLevel>;   // systemId → level
  };
  systems: Array<{
    system: {
      id: string;
      name: string;
      icon: string;
      replacedHabit: string | null;
      sortOrder: number;
    };
    healthStatus: HealthStatus;
    healthLabel: string;
    areas: Array<{
      area: { id: string; name: string; sortOrder: number };
      bundles: Array<{
        bundle: { id: string; bundleTitle: string | null; sortOrder: number };
        actions: Array<{
          id: string;
          title: string;
          effortLevel: EffortLevel;
          anchor: TimeAnchor;
        }>;
      }>;
    }>;
  }>;
  todayCheckins: Array<{
    id: string;
    systemId: string;
    areaId: string;
    actionId: string;
    energyLevel: EffortLevel;
    note: string | null;
    date: string;
  }>;
  streak: number;
  weeklyMomentum: number;
  momentumTier: { label: string; threshold: number };
  nextTier: { label: string; threshold: number } | null;
  reflection: string | null;
}
```

This DRY aggregate endpoint replaces 5-6 separate calls the frontend would
otherwise need on page load.

---

### 5.13 AI Coach

| Method | Path                                             | Description                    |
| ------ | ------------------------------------------------ | ------------------------------ |
| GET    | `/api/v1/ai/conversations`                       | List user's conversations      |
| POST   | `/api/v1/ai/conversations`                       | Start new conversation         |
| GET    | `/api/v1/ai/conversations/:id`                   | Get conversation with messages |
| POST   | `/api/v1/ai/conversations/:id/messages`          | Send message, get AI reply     |
| GET    | `/api/v1/ai/conversations/:id/stream`            | Stream AI reply via SSE        |
| DELETE | `/api/v1/ai/conversations/:id`                   | Delete conversation            |
| POST   | `/api/v1/ai/suggest/systems`                     | AI suggests systems            |
| POST   | `/api/v1/ai/suggest/actions`                     | AI suggests action bundles     |
| POST   | `/api/v1/ai/apply-suggestion`                    | Apply an AI suggestion         |

**POST /api/v1/ai/conversations — CreateConversationDto:**

```typescript
{
  type: ConversationType;   // "coaching" | "system_builder" | "general_chat"
  title?: string;           // max 200 chars
}
```

**POST /api/v1/ai/conversations/:id/messages — SendMessageDto:**

```typescript
{
  content: string;   // 1-5000 chars
}
```

Response: The assistant's reply message (AiMessage object). For streaming,
use the SSE endpoint described in Section 8.6.

**POST /api/v1/ai/suggest/systems:**

```typescript
// Request
{
  goals: string;   // user's description of their goals, 1-2000 chars
}

// Response
Array<{
  name: string;
  icon: string;
  replacedHabit?: string;
  areas: Array<{
    name: string;
    bundles: Array<{
      bundleTitle: string;
      baseline: { title: string; anchor: TimeAnchor };
      normal:   { title: string; anchor: TimeAnchor };
      stretch:  { title: string; anchor: TimeAnchor };
    }>;
  }>;
  reasoning: string;
}>
```

**POST /api/v1/ai/suggest/actions:**

```typescript
// Request
{
  systemId: string;
  context?: string;   // additional context, max 1000 chars
}

// Response
Array<{
  bundleTitle: string;
  baseline: { title: string; anchor: TimeAnchor };
  normal:   { title: string; anchor: TimeAnchor };
  stretch:  { title: string; anchor: TimeAnchor };
  reasoning: string;
}>
```

**POST /api/v1/ai/apply-suggestion — ApplySuggestionDto:**

```typescript
{
  type: "system" | "bundle";
  system?: {
    name: string;
    icon: string;
    replacedHabit?: string;
    areas: Array<{
      name: string;
      bundles: Array<BundleLevelsDto>;  // reuses shared schema
    }>;
  };
  bundle?: {
    areaId: string;
    bundleTitle: string;
    baseline: { title: string; anchor: TimeAnchor };
    normal:   { title: string; anchor: TimeAnchor };
    stretch:  { title: string; anchor: TimeAnchor };
  };
}
```

Validation: Must provide `system` when type is "system", or `bundle` when type is "bundle".
Creates the corresponding entities in a Prisma transaction.

---

## 6. Zod Validation Schemas (DRY)

All DTOs are defined as Zod schemas. This gives runtime validation, TypeScript types,
and Swagger doc generation from a single source of truth. **No `class-validator` or
`class-transformer` — Zod only.**

### 6.1 Shared Schemas (Single Source — Import Everywhere)

```typescript
// src/common/schemas/enums.ts
import { z } from 'zod';

export const EffortLevelSchema = z.enum(['baseline', 'normal', 'stretch']);
export const TimeAnchorSchema = z.enum([
  'morning', 'midday', 'afternoon', 'evening', 'anytime',
]);
export const ConversationTypeSchema = z.enum([
  'coaching', 'system_builder', 'general_chat',
]);
export const DateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format',
);
export const TimezoneSchema = z.string().min(1).max(50);
```

```typescript
// src/common/schemas/shared.ts
//
// SINGLE SOURCE for tier and bundle-level shapes.
// Imported by: CreateBundleSchema, UpdateBundleSchema, OnboardingSchema,
//              ApplySuggestionSchema — never duplicated.

import { z } from 'zod';
import { TimeAnchorSchema } from './enums';

export const TierInputSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  anchor: TimeAnchorSchema,
});

export const BundleLevelsSchema = z.object({
  bundleTitle: z.string().max(200).trim().default(''),
  baseline: TierInputSchema,
  normal: TierInputSchema,
  stretch: TierInputSchema,
});

export type TierInputDto = z.infer<typeof TierInputSchema>;
export type BundleLevelsDto = z.infer<typeof BundleLevelsSchema>;
```

### 6.2 System DTOs

```typescript
// src/systems/dto/create-system.dto.ts
import { z } from 'zod';

export const CreateSystemSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  icon: z.string().min(1).max(50),
  replacedHabit: z.string().max(200).trim().optional(),
});

export type CreateSystemDto = z.infer<typeof CreateSystemSchema>;
```

```typescript
// src/systems/dto/update-system.dto.ts
import { z } from 'zod';

export const UpdateSystemSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  icon: z.string().min(1).max(50).optional(),
  replacedHabit: z.string().max(200).trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateSystemDto = z.infer<typeof UpdateSystemSchema>;
```

```typescript
// src/systems/dto/reorder-systems.dto.ts
import { z } from 'zod';

export const ReorderSystemsSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ReorderSystemsDto = z.infer<typeof ReorderSystemsSchema>;
```

### 6.3 Area DTOs

```typescript
// src/areas/dto/create-area.dto.ts
import { z } from 'zod';

export const CreateAreaSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export type CreateAreaDto = z.infer<typeof CreateAreaSchema>;
```

### 6.4 Bundle DTOs (Import from shared — NOT duplicated)

```typescript
// src/action-bundles/dto/create-bundle.dto.ts
import { BundleLevelsSchema } from '../../common/schemas/shared';

export const CreateBundleSchema = BundleLevelsSchema;
export type CreateBundleDto = z.infer<typeof CreateBundleSchema>;
```

```typescript
// src/action-bundles/dto/update-bundle.dto.ts
import { BundleLevelsSchema } from '../../common/schemas/shared';

export const UpdateBundleSchema = BundleLevelsSchema;
export type UpdateBundleDto = z.infer<typeof UpdateBundleSchema>;
```

### 6.5 Checkin DTOs

```typescript
// src/checkins/dto/create-checkin.dto.ts
import { z } from 'zod';
import { DateStringSchema } from '../../common/schemas/enums';

export const CreateCheckinSchema = z.object({
  actionId: z.string().min(1),
  date: DateStringSchema,
  note: z.string().max(500).trim().optional(),
});

export type CreateCheckinDto = z.infer<typeof CreateCheckinSchema>;
```

### 6.6 Energy DTOs

```typescript
// src/energy/dto/set-global-energy.dto.ts
import { z } from 'zod';
import { EffortLevelSchema } from '../../common/schemas/enums';

export const SetGlobalEnergySchema = z.object({
  level: EffortLevelSchema,
});

export type SetGlobalEnergyDto = z.infer<typeof SetGlobalEnergySchema>;
```

`SetSystemEnergySchema` is identical — import `SetGlobalEnergySchema` as an alias
or define once and reuse:

```typescript
// src/energy/dto/set-system-energy.dto.ts
export { SetGlobalEnergySchema as SetSystemEnergySchema } from './set-global-energy.dto';
export type SetSystemEnergyDto = SetGlobalEnergyDto;
```

### 6.7 Reflection DTOs

```typescript
// src/reflections/dto/upsert-reflection.dto.ts
import { z } from 'zod';

export const UpsertReflectionSchema = z.object({
  text: z.string().min(1).max(2000).trim(),
});

export type UpsertReflectionDto = z.infer<typeof UpsertReflectionSchema>;
```

### 6.8 Onboarding DTO (Imports shared BundleLevelsSchema)

```typescript
// src/users/dto/onboarding.dto.ts
import { z } from 'zod';
import { TimezoneSchema } from '../../common/schemas/enums';
import { BundleLevelsSchema } from '../../common/schemas/shared';

export const OnboardingSchema = z.object({
  userName: z.string().min(1).max(100).trim(),
  timezone: TimezoneSchema,
  system: z.object({
    name: z.string().min(1).max(100).trim(),
    icon: z.string().min(1).max(50),
    replacedHabit: z.string().max(200).trim().optional(),
  }),
  bundle: BundleLevelsSchema,    // <-- reused, not duplicated
});

export type OnboardingDto = z.infer<typeof OnboardingSchema>;
```

### 6.9 User Update DTO

```typescript
// src/users/dto/update-user.dto.ts
import { z } from 'zod';
import { DateStringSchema, TimezoneSchema } from '../../common/schemas/enums';

export const UpdateUserSchema = z.object({
  userName: z.string().min(1).max(100).trim().optional(),
  timezone: TimezoneSchema.optional(),
  lastMilestoneSeen: z.number().int().min(0).optional(),
  lastReviewDate: DateStringSchema.optional(),
  focusedActionId: z.string().nullable().optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

### 6.10 ZodValidationPipe

```typescript
// src/common/pipes/zod-validation.pipe.ts
import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
```

Usage in controllers:

```typescript
@Post()
create(
  @Body(new ZodValidationPipe(CreateSystemSchema)) dto: CreateSystemDto,
  @CurrentUser() user: { userId: string },
) {
  return this.systemsService.create(user.userId, dto);
}
```

### 6.11 DRY Schema Dependency Map

```
common/schemas/enums.ts
  ├── EffortLevelSchema     → used by: checkins, energy, shared
  ├── TimeAnchorSchema      → used by: shared
  ├── DateStringSchema      → used by: checkins, users, energy, reflections
  ├── TimezoneSchema        → used by: users (onboarding + update)
  └── ConversationTypeSchema→ used by: ai-coach

common/schemas/shared.ts
  ├── TierInputSchema       → used by: BundleLevelsSchema
  └── BundleLevelsSchema    → used by: CreateBundleDto, UpdateBundleDto,
                               OnboardingDto, ApplySuggestionDto

No schema is defined more than once. Every DTO imports from the single source.
```

---

## 7. Business Logic & Computed Data

These algorithms currently live in the frontend and MUST be replicated in
the backend services.

### 7.1 Streak Calculation

Source: `src/hooks/use-momentum.ts` (frontend)
Target: `MomentumService.calculateStreak(userId)`

Algorithm (respects user timezone):

```
streak = 0
today = current date in user's timezone
for i = 0, 1, 2, ...
  date = today - i days
  if checkins exist on date for this user → streak++
  else if i == 0 → continue (today might have no checkins yet)
  else → break
return streak
```

**Performance:** Cache the streak value in Redis (key: `streak:{userId}`).
Invalidate on checkin create or delete. See Section 9.

### 7.2 Momentum Points

Constants (define in `src/common/constants/momentum.ts` — single source):

```typescript
export const MOMENTUM_POINTS: Record<EffortLevel, number> = {
  baseline: 1,
  normal: 3,
  stretch: 5,
};
```

Total momentum = sum of points across all checkins for the user.
Weekly momentum = sum of points for checkins where date >= Monday of current week
(calculated in user's timezone).

### 7.3 Momentum Tiers

```typescript
export const MOMENTUM_TIERS = [
  { threshold: 0,   label: 'Getting Started' },
  { threshold: 20,  label: 'Warming Up' },
  { threshold: 40,  label: 'In Motion' },
  { threshold: 60,  label: 'Momentum' },
  { threshold: 80,  label: 'Locked In' },
  { threshold: 100, label: 'Unstoppable' },
] as const;
```

Return the highest tier whose threshold <= weeklyMomentum, and the next tier above it.

### 7.4 System Health

Source: `src/lib/system-health.ts` (frontend)
Target: `SystemsService.getSystemHealth(systemId)` or computed in queries

Algorithm based on days since last checkin for that system:

```
0 days since last checkin   → status: "maintained",  label: "Maintained"
1-2 days                    → status: "healthy",     label: "Healthy"
3-5 days                    → status: "attention",   label: "Needs attention"
6+ days                     → status: "neglected",   label: "Neglected"
```

Exception: systems with ZERO checkins ever → status: "healthy", label: "Healthy"

### 7.5 Streak Milestones

Sequential milestones: 7, 14, 30, 60, 100 days.

```typescript
export const STREAK_MILESTONES = [
  { days: 7,   label: 'You Showed Up',        line: 'Consistency is building.' },
  { days: 14,  label: "You're Consistent",    line: 'Keep showing up — it compounds.' },
  { days: 30,  label: 'This Is Who You Are',  line: 'Identity forms from repetition.' },
  { days: 60,  label: "You're Locked In",     line: 'Stability you can trust.' },
  { days: 100, label: 'Unstoppable',          line: 'Mastery is rare — you earned this.' },
] as const;
```

Next milestone to show:
```
nextMilestone = MILESTONES.find(m => m.days > lastMilestoneSeen && m.days <= streak)
```

### 7.6 Weekly Review Eligibility

Conditions (evaluated by frontend using data from GET /api/v1/today):

1. Account is at least 7 days old (`accountCreatedAt` + 7 days <= today)
2. Today is **Sunday** (`new Date().getDay() === 0`)
3. Review has **not** been completed this calendar week: `lastReviewDate` is null
   OR `lastReviewDate` is before Monday of the current week
4. User has at least one system

Note: The energy-set-for-today check is NOT part of the review eligibility logic.
It is an implicit UI gate — the energy modal blocks all other interactions until
energy is set, so in practice the user cannot reach the review prompt without
having set energy. But the eligibility function itself does not check it.

The backend returns the raw data (`accountCreatedAt`, `lastReviewDate`, systems
array); the frontend evaluates these conditions client-side.

### 7.7 Expansion Offers

Source: `src/lib/action-expansion.ts` (frontend)
Target: Computed in `CheckinsService.create()` response

After completing a baseline action → offer normal and stretch actions from same system
After completing a normal action   → offer stretch action from same system
After completing a stretch action  → no expansion offers

Preference: same area first, then other areas within the system. Sort by action ID.

Returned in the POST /api/v1/checkins response so the frontend can display them
immediately in the completion modal.

**409 Conflict handling for expansion offers:**
The expansion offers include an `alreadyDoneToday` flag for each offered action.
The frontend SHOULD use this flag to either hide already-completed actions or
render them in a disabled state (the current frontend labels them "(Already done
today)" in `completion-view.tsx`). If the user somehow taps a completed action,
the POST /api/v1/checkins call returns `409 Conflict`. The frontend API client
should handle 409 gracefully — suppress the error and show a toast like
"Already checked in today" rather than displaying a generic error.

### 7.8 Today Display Actions

Source: `src/lib/today-display-actions.ts` (frontend)

This logic determines which actions to show for a system at a given energy level.
This is purely a display concern and REMAINS on the frontend. The backend provides
raw data (all actions + today's checkins + focused action ID) via GET /api/v1/today.

### 7.9 Win Messages & Reflection Prompts (Frontend-only)

These stay on the frontend — they are UI copy, not business logic.

---

## 8. AI Coach Module

### 8.1 Overview

The AI Coach serves three purposes:

1. **System Builder** — Help users discover what life systems, areas, and action
   bundles they should create based on their goals and lifestyle
2. **Coaching** — Analyze user behavior/data and provide motivational coaching,
   identify patterns, suggest adjustments to baselines
3. **General Chat** — Free-form conversation about consistency, habits, motivation

### 8.2 System Context Prompt

Every AI call includes a system prompt with the user's full context:

```typescript
// src/ai-coach/ai-coach.prompts.ts

export function buildSystemPrompt(userData: UserContext): string {
  return `
You are a consistency coach inside an app that helps people maintain life systems.

DOMAIN MODEL:
- A "System" is a life domain (e.g., Fitness, Learning, Business)
- Each System has "Areas" (sub-categories, e.g., "Cardio" under Fitness)
- Each Area has "Action Bundles" — three escalating effort levels:
  - Baseline: The minimum viable action on a bad day ("just show up")
  - Normal: A regular day's work
  - Stretch: Full energy, maximum effort
- Users check in daily by completing actions at their chosen energy level
- Momentum points: baseline=1, normal=3, stretch=5
- The goal is NEVER ZERO — even bad days get a baseline check-in

USER'S CURRENT STATE:
- Name: ${userData.userName}
- Systems: ${JSON.stringify(userData.systems)}
- Current streak: ${userData.streak} days
- Weekly momentum: ${userData.weeklyMomentum} points
- System health: ${JSON.stringify(userData.systemHealth)}
- Recent activity (last 14 days): ${JSON.stringify(userData.recentCheckins)}

GUIDELINES:
- Be encouraging but honest
- Focus on behavior, not outcomes
- Emphasize that baseline days protect streaks
- When suggesting systems/actions, make baselines genuinely easy (2-5 min max)
- When analyzing patterns, look for neglected systems and inconsistencies
- Never suggest more than 3-5 systems total to avoid overwhelm
- Keep responses concise and actionable
`.trim();
}
```

### 8.3 UserContext Type

```typescript
type UserContext = {
  userName: string;
  systems: Array<{
    id: string;
    name: string;
    icon: string;
    areas: Array<{
      name: string;
      bundles: Array<{
        bundleTitle: string | null;
        baseline: string;
        normal: string;
        stretch: string;
      }>;
    }>;
  }>;
  streak: number;
  weeklyMomentum: number;
  systemHealth: Array<{
    systemName: string;
    status: HealthStatus;
    daysSinceLastCheckin: number | null;
  }>;
  recentCheckins: Array<{
    date: string;
    systemName: string;
    actionTitle: string;
    effortLevel: EffortLevel;
  }>;
};
```

### 8.4 Structured Suggestions

When the AI suggests systems or bundles, instruct it to return structured JSON
that can be parsed and directly applied. Use function calling / tool use or
JSON mode depending on the AI provider.

### 8.5 Apply Suggestion Flow

1. User requests suggestions via POST /api/v1/ai/suggest/systems or /suggest/actions
2. Backend calls AI, parses structured response, returns suggestion objects
3. Frontend displays suggestions for user review and editing
4. User approves (optionally modifies) and clicks "Apply"
5. Frontend calls POST /api/v1/ai/apply-suggestion with the finalized data
6. Backend creates entities in a Prisma transaction
7. Frontend refetches affected data

### 8.6 Streaming Responses

NestJS `@Sse()` only supports GET requests, so AI streaming uses a two-step pattern:

1. **POST** `/api/v1/ai/conversations/:id/messages` — saves the user's message and
   returns `{ messageId: string }` (the pending assistant message ID).
2. **GET** `/api/v1/ai/conversations/:id/stream?messageId=xyz` — opens an SSE stream
   that delivers the AI response token-by-token.

```typescript
// Step 1: POST saves user message, kicks off AI generation
@Post('conversations/:id/messages')
async sendMessage(
  @Param('id') id: string,
  @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  @CurrentUser() user: { userId: string },
) {
  return this.aiCoachService.sendMessage(id, dto, user.userId);
  // Returns { userMessage: AiMessage, assistantMessageId: string }
}

// Step 2: GET streams the AI response via SSE
@Sse('conversations/:id/stream')
streamResponse(
  @Param('id') id: string,
  @Query('messageId') messageId: string,
  @CurrentUser() user: { userId: string },
): Observable<MessageEvent> {
  return this.aiCoachService.streamResponse(id, messageId, user.userId);
}
```

The service should:
1. On POST: save the user message, create a placeholder assistant message, and return
   both IDs. Optionally begin AI generation in the background.
2. On GET (SSE): build the system prompt with user context, stream tokens from the AI
   provider as SSE `data` events, and update the assistant message row with the
   complete content when streaming finishes.
3. Send a final SSE event `{ event: 'done', data: { messageId } }` so the client
   knows the stream is complete.

The non-streaming POST endpoint from Section 5.13 remains available as a simpler
alternative — it saves the user message, calls the AI synchronously, saves the
assistant reply, and returns both in a single response.

---

## 9. Caching Strategy

### 9.1 Why Cache

Momentum endpoints compute streaks, totals, and per-system stats from raw checkins
on every request. Without caching, `GET /api/v1/momentum/overview` scans all checkin
rows for the user, and `GET /api/v1/today` joins across 5+ tables.

### 9.2 Cache Provider (Strategy Pattern)

The `CacheService` is backed by an interface so the implementation can swap between
**in-memory** (local dev, tests) and **Upstash Redis** (staging/production) without
changing consuming code.

```typescript
// src/cache/cache.interface.ts
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>;
}
```

```typescript
// src/cache/memory-cache.service.ts — local dev & tests
@Injectable()
export class MemoryCacheService implements ICacheService {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> { this.store.delete(key); }

  async delPattern(pattern: string): Promise<void> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const k of this.store.keys()) {
      if (regex.test(k)) this.store.delete(k);
    }
  }
}
```

```typescript
// src/cache/redis-cache.service.ts — production (Upstash)
import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisCacheService implements ICacheService {
  private redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  });

  async get<T>(key: string): Promise<T | null> { ... }
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> { ... }
  async del(key: string): Promise<void> { ... }
  async delPattern(pattern: string): Promise<void> { ... }
}
```

```typescript
// src/cache/cache.module.ts — provider selection
const cacheProvider = {
  provide: 'CACHE_SERVICE',
  useClass: process.env.UPSTASH_REDIS_URL
    ? RedisCacheService
    : MemoryCacheService,
};
```

This keeps local development zero-dependency (no Redis container required)
while guaranteeing consistent cache semantics across environments.

### 9.3 Cache Keys & Invalidation

| Key Pattern                          | TTL       | Invalidated On                          |
| ------------------------------------ | --------- | --------------------------------------- |
| `streak:{userId}`                    | 24h       | Checkin create, Checkin delete           |
| `weekly-momentum:{userId}`           | 1h        | Checkin create, Checkin delete           |
| `today:{userId}:{date}`             | 5 min     | Any write (checkin, energy, reflection)  |
| `momentum-overview:{userId}`         | 10 min    | Checkin create, Checkin delete           |

Invalidation is done in the service layer after successful writes:

```typescript
// In CheckinsService.create()
await this.cache.del(`streak:${userId}`);
await this.cache.del(`weekly-momentum:${userId}`);
await this.cache.del(`today:${userId}:${today}`);
await this.cache.del(`momentum-overview:${userId}`);
```

---

## 10. Logging & Observability

### 10.1 Structured Logging

Use `nestjs-pino` for structured JSON logging compatible with Google Cloud Logging:

```typescript
// In app.module.ts
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        genReqId: (req) => req.headers['x-correlation-id'] || randomUUID(),
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            userId: req.raw?.auth?.userId,
          }),
        },
      },
    }),
  ],
})
```

### 10.2 Correlation ID Middleware

```typescript
// src/common/middleware/correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  }
}
```

### 10.3 Error Tracking

Integrate Google Cloud Error Reporting or Sentry:

```typescript
// In http-exception.filter.ts
if (status >= 500) {
  this.logger.error({ err: exception, correlationId }, 'Unhandled server error');
  // Optionally: Sentry.captureException(exception);
}
```

---

## 11. Testing Strategy

### 11.1 Test Types

| Type        | Location              | What It Tests                                    | Tools                     |
| ----------- | --------------------- | ------------------------------------------------ | ------------------------- |
| Unit        | `src/**/*.spec.ts`    | Service logic with mocked Prisma / deps          | Jest, ts-jest (`jest.config.ts`) |
| E2E / HTTP  | `test/e2e/*.e2e-spec.ts` | Full HTTP → real test DB → response           | Jest, Supertest (`test/jest-e2e.json`) |

### 11.2 Local & E2E Test Database

E2E tests use **`.env.test`** (copy from **`.env.test.example`**): a **dedicated** Postgres URL
(Neon branch or local), **`NODE_ENV=test`**, and Clerk/OpenAI placeholder values acceptable
for validation. **`test/global-setup-e2e.js`** runs **`npx prisma migrate deploy` once** per
Jest parent process before any e2e file runs (avoids repeated migrate / lock contention).

**`test/setup.ts`** loads `.env.test` and applies defaults (e.g. webhook secret fallback for
signing test webhooks). Table truncation and fixtures live under **`test/helpers/`** (see
`truncate-app-tables.ts`, e2e onboarding helpers).

**CI (Cloud Build):** the pipeline does **not** use a real database for unit tests. It sets a
**placeholder** `DATABASE_URL` (e.g. `postgresql://prisma:prisma@127.0.0.1:5432/prisma`) only
so **`npx prisma generate`** can run; **`npm test`** exercises **unit tests only** with mocks.
No dedicated test database secret is required in `cloudbuild.yaml` today.

### 11.3 Mock Clerk Auth

```typescript
// test/helpers/mock-auth.ts
export function mockAuthGuard(userId: string) {
  return {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      req.auth = { userId };
      return true;
    },
  };
}

// In test setup
app.overrideGuard(ClerkAuthGuard).useValue(mockAuthGuard('test-clerk-user-id'));
```

### 11.4 Mock OpenAI

```typescript
// test/helpers/mock-ai.ts
export const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Mocked AI response', role: 'assistant' } }],
      }),
    },
  },
};
```

### 11.5 CI Pipeline Test Step

Cloud Build runs **`npm ci` → `npx prisma generate` → `npm test`** before the Docker build.
The generate step uses a **synthetic** `DATABASE_URL` in the shell (see §12.3); unit tests do
not connect to Postgres. Adding **`test:e2e`** to CI would require a separate design (real
test DB URL, secrets, and longer runtime).

---

## 12. Docker & Deployment (GCP + Neon)

### 12.1 Dockerfile

Authoritative copy: repository root **`Dockerfile`**. Summary:

```dockerfile
# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/config ./src/config
# Prisma 7 loads prisma.config.ts, which requires DATABASE_URL; generate does not connect.
ARG DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/prisma"
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Production stage ──
FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

USER nestjs

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
```

### 12.2 docker-compose.yml (Local Development)

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: consistency
      POSTGRES_PASSWORD: consistency_dev
      POSTGRES_DB: consistency_app
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U consistency']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  api:
    build: .
    ports:
      - '3001:8080'
    environment:
      DATABASE_URL: postgresql://consistency:consistency_dev@db:5432/consistency_app
      UPSTASH_REDIS_URL: redis://redis:6379
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}
      CLERK_JWT_KEY: ${CLERK_JWT_KEY}
      CLERK_WEBHOOK_SECRET: ${CLERK_WEBHOOK_SECRET}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      NODE_ENV: development
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./src:/app/src

volumes:
  pgdata:
```

Note: For local development, use standard PostgreSQL via Compose (`consistency` /
`consistency_app` match **`docker-compose.yml`**). In staging/production, `DATABASE_URL`
points to **Neon**; set **`USE_NEON=true`** so **`prisma-client.factory.ts`** uses the Neon
serverless adapter (`previewFeatures = ["driverAdapters"]` in `schema.prisma`). For cache, **`CacheModule`** uses **`@upstash/redis`** only when **both**
`UPSTASH_REDIS_URL` (Upstash **REST** URL, `https://…`) and **`UPSTASH_REDIS_TOKEN`** are set;
otherwise it uses **in-memory** cache. Local **`docker-compose.yml`** sets a `redis://` URL
without a token, so the running API typically uses the **memory** implementation unless you
add a matching token for a real Upstash dev database.

### 12.3 Google Cloud Deployment

Services used:
- **Cloud Run** — Hosts the Docker container (auto-scaling, pay-per-request)
- **Neon** — Serverless PostgreSQL (external, not Cloud SQL)
- **Upstash Redis** — Serverless cache (REST API; `@upstash/redis`)
- **Secret Manager** — `neon-db-url`, Clerk keys + webhook, OpenAI, Upstash URL/token
- **Cloud Build** — CI/CD (e.g. trigger on push to `main`)
- **Artifact Registry** — Docker image storage (`prilbie-repo` in **`us-east4`** for production)

Authoritative pipeline: repository root **`cloudbuild.yaml`**. Excerpt (GCP project **`prilbie`**):

```yaml
# Prilbie API: unit tests → Docker image → Artifact Registry → Prisma migrate → Cloud Run.
# Image tag: $COMMIT_SHA (set on repo triggers; for gcloud builds submit use
# --substitutions=COMMIT_SHA=$(git rev-parse HEAD)).
steps:
  - name: node:20-alpine
    entrypoint: sh
    args:
      - -c
      - |
        set -euo pipefail
        export DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/prisma"
        npm ci
        npx prisma generate
        npm test

  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - '-t'
      - '$_REGION-docker.pkg.dev/$PROJECT_ID/$_REPO/$_SERVICE:$COMMIT_SHA'
      - '.'

  - name: gcr.io/cloud-builders/docker
    args:
      - push
      - '$_REGION-docker.pkg.dev/$PROJECT_ID/$_REPO/$_SERVICE:$COMMIT_SHA'

  - name: node:20-alpine
    entrypoint: sh
    args:
      - -c
      - |
        set -euo pipefail
        npm ci
        npx prisma migrate deploy
    secretEnv:
      - DATABASE_URL

  - name: gcr.io/cloud-builders/gcloud
    args:
      - run
      - deploy
      - prilbie-api
      - '--image=$_REGION-docker.pkg.dev/$PROJECT_ID/$_REPO/$_SERVICE:$COMMIT_SHA'
      - '--region=us-east4'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--service-account=cloudbuild-sa@prilbie.iam.gserviceaccount.com'
      - '--set-env-vars=NODE_ENV=production,USE_NEON=true,CORS_ORIGINS=https://prilbie.com'
      - '--set-secrets=DATABASE_URL=neon-db-url:latest,CLERK_SECRET_KEY=clerk-secret:latest,CLERK_JWT_KEY=clerk-jwt-key:latest,CLERK_WEBHOOK_SECRET=clerk-webhook-secret:latest,OPENAI_API_KEY=openai-key:latest,UPSTASH_REDIS_URL=upstash-url:latest,UPSTASH_REDIS_TOKEN=upstash-token:latest'

substitutions:
  _REGION: us-east4
  _REPO: prilbie-repo
  _SERVICE: prilbie-api

availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/neon-db-url/versions/latest
      env: DATABASE_URL

options:
  logging: CLOUD_LOGGING_ONLY
```

**IAM (outside YAML):** Cloud Build’s service account needs access to secrets, Artifact Registry,
and Cloud Run deploy. The **Cloud Run runtime** service account (here **`cloudbuild-sa@prilbie.iam.gserviceaccount.com`**) must have **Secret Manager Secret Accessor** on every secret
referenced in **`--set-secrets`**.

### 12.4 Rollback

Cloud Run supports instant rollback to any previous revision:

```bash
# List revisions
gcloud run revisions list --service=prilbie-api --region=us-east4

# Rollback to a specific revision
gcloud run services update-traffic prilbie-api \
  --to-revisions=prilbie-api-00042-abc=100 \
  --region=us-east4
```

Database rollbacks require a Prisma migration revert or restoring from a Neon branch.
Neon supports **branching** — create a branch before each migration as a restore point.

### 12.5 Environment Variables

```env
# .env.example

# ─── Database (Neon) ──────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/prilbie?sslmode=require

# ─── Cache (Upstash Redis) ───────────────────────────────
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxx...

# ─── Clerk Auth ───────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY=...
CLERK_WEBHOOK_SECRET=whsec_...

# ─── AI ───────────────────────────────────────────────────
OPENAI_API_KEY=sk-...
# Optional; defaults to gpt-4o-mini in env.schema.ts / AiCoachService
# AI_MODEL=gpt-4o-mini

# ─── App ──────────────────────────────────────────────────
# Local default 3001; Cloud Run / platforms inject PORT (e.g. 8080) — no need to duplicate in secrets if the platform sets it.
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
USE_NEON=false                           # set to "true" in production (Cloud Run)
```

### 12.6 Environment validation at bootstrap

Load and validate environment variables when the app starts using **Zod** and Nest **`ConfigModule.forRoot({ validate })`** (e.g. `src/config/env.schema.ts`). This fails fast on misconfiguration instead of failing on first request.

| Rule | Behavior |
| ---- | -------- |
| `DATABASE_URL` | Required in **all** environments (Prisma connects at boot). |
| `NODE_ENV` | Optional; treat unset as `development`. |
| `PORT` | Optional; must be an integer **1–65535** when set; default **3001** for local dev if omitted. |
| `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET`, `OPENAI_API_KEY` | Required (non-empty after trim) when **`NODE_ENV=production`** — fail fast at bootstrap. Webhooks need `CLERK_WEBHOOK_SECRET`; JWT routes need Clerk keys; AI Coach needs OpenAI key. |
| `CLERK_*` / `OPENAI_*` in dev/test | In **`development`** and **`test`**, Clerk and OpenAI keys may be omitted so partial local stacks and e2e with placeholders can boot; protected routes still need valid Clerk config to authenticate where applicable. |
| `AI_MODEL` | Optional; validated default **`gpt-4o-mini`** when unset. |
| `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `USE_NEON`, `CORS_ORIGINS`, … | Not in the Zod object; **`.passthrough()`** preserves them for `process.env` / `ConfigService.get()` (cache, Prisma factory, CORS). |

After validation, read the listen port from **`ConfigService.getOrThrow('PORT')`** in **`src/main.ts`** after `configureApp(app)`.

---

## 13. Swagger Configuration

**Implemented layout:** **`src/main.ts`** creates the app with **`rawBody: true`** (required for
Clerk **Svix** webhook signature verification on raw POST bodies), calls **`configureApp(app)`**
from **`src/configure-app.ts`** (helmet, compression, CORS, global prefix, shutdown hooks,
Swagger + `cleanupOpenApiDoc` from `nestjs-zod`), then listens on **`ConfigService.getOrThrow('PORT')`**.
The e2e **`test/helpers/test-app.ts`** factory follows the same pattern so HTTP behavior matches production.

The listing below is a **conceptual** single-file version of what `configureApp` + `main` apply together; prefer the real split files in the repo.

```typescript
// Conceptual: main.ts + configure-app.ts combined
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // required for POST /webhooks/clerk (Svix)
  });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', {
    exclude: ['/health', '/health/ready', '/webhooks/clerk'],
  });
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Consistency App API')
    .setDescription(
      'Backend API for the Consistency habit-tracking application',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'clerk-jwt',
    )
    .addTag('health',      'Health checks')
    .addTag('auth',        'Clerk webhooks')
    .addTag('users',       'User profile and onboarding')
    .addTag('systems',     'Life systems management')
    .addTag('areas',       'System areas')
    .addTag('bundles',     'Action bundles (baseline/normal/stretch)')
    .addTag('checkins',    'Daily check-ins')
    .addTag('energy',      'Daily energy levels')
    .addTag('reflections', 'Daily reflections')
    .addTag('momentum',    'Analytics and stats (read-only)')
    .addTag('today',       'Today page aggregate (read-only)')
    .addTag('ai',          'AI Coach')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Production uses cleanupOpenApiDoc(document) from nestjs-zod — see configure-app.ts
  SwaggerModule.setup('api/docs', app, document);

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
}
bootstrap();
```

Swagger UI: registered in **`configure-app.ts`** via `SwaggerModule.setup('api/docs', …)` — confirm the full URL when the app is running (depends on Nest global prefix behavior for static Swagger routes).

Swagger **title/description** strings in the snippet above match the current **`src/configure-app.ts`** (`Consistency App API`); the repository/product name is **Prilbie** — rename in code when you want UI copy to match.

For Zod-based DTOs, use `nestjs-zod`'s `createZodDto` helper to auto-generate
Swagger schemas from Zod definitions.

---

## 14. Migration Strategy (Frontend Cleanup)

When the backend is production-ready, the frontend needs these changes.

### Phase 1: Add API Layer

1. Install dependencies: `@clerk/nextjs`, `@tanstack/react-query`
2. Create `src/services/api.ts` — Typed API client pointing to `/api/v1/*`
3. Create React Query hooks for each resource
4. Replace Zustand store reads with React Query cache
5. Replace Zustand store mutations with React Query mutations

### Phase 2: Remove Client-Side Data Layer

| Frontend File                            | Action                                        |
| ---------------------------------------- | --------------------------------------------- |
| `src/store/app-store.ts`                 | DELETE — all state comes from API              |
| `src/hooks/use-momentum.ts`              | DELETE — replaced by GET /api/v1/momentum/overview |
| `src/hooks/use-momentum-history.ts`      | DELETE — replaced by momentum endpoints        |
| `src/hooks/use-systems.ts`               | REPLACE — React Query wrapper for GET /api/v1/systems |
| `src/lib/system-health.ts`               | DELETE — computed server-side                  |
| `src/lib/action-expansion.ts`            | DELETE — returned in POST /api/v1/checkins response |
| `src/lib/today-display-actions.ts`       | KEEP — display logic stays on frontend         |
| `src/lib/day-completion.ts`              | DELETE — server returns completion state        |
| `src/lib/seed-data.ts`                   | DELETE — dev seed handled by prisma/seed.ts    |
| `src/lib/action-bundles.ts`              | DELETE — bundle grouping done server-side      |
| `src/lib/constants.ts`                   | KEEP — UI constants (colors, labels, prompts)  |
| `src/lib/date-utils.ts`                  | KEEP — date formatting is a frontend concern   |
| `src/lib/icons.ts`                       | KEEP — icon rendering is frontend-only         |
| `src/lib/toast.ts`                       | KEEP                                           |
| `src/lib/utils.ts`                       | KEEP                                           |
| `src/components/beta/BetaGate.tsx`       | DELETE — replaced by Clerk auth                |

### Phase 3: Auth Integration

1. Wrap app in `<ClerkProvider>` in `layout.tsx`
2. Add `/sign-in` and `/sign-up` routes using Clerk's components
3. Add `middleware.ts` for route protection
4. Use `useAuth()` hook to get JWT for API calls
5. Remove BetaGate component entirely

### Phase 4: Update Pages

| Page                          | Current Data Source         | New Data Source                             |
| ----------------------------- | -------------------------- | ------------------------------------------- |
| `/` (redirect)                | Zustand `onboarded`        | GET /api/v1/users/me `.onboarded`           |
| `/onboarding`                 | Local state → Zustand      | POST /api/v1/users/me/onboard               |
| `/today`                      | Zustand + hooks            | GET /api/v1/today (single aggregate call)   |
| `/systems`                    | Zustand `systems`          | GET /api/v1/systems                         |
| `/systems/[id]`               | Zustand lookups            | GET /api/v1/systems/:id                     |
| `/momentum`                   | useMomentum hook           | GET /api/v1/momentum/overview + /week-grid  |
| `/momentum/week/[weekStart]`  | useMomentumHistory hook    | GET /api/v1/momentum/weeks/:weekStart       |
| `/momentum/day/[date]`        | useMomentumHistory hook    | GET /api/v1/momentum/days/:date             |

### Phase 5: Types Cleanup

1. Remove `AppState` type from `src/types/index.ts`
2. Keep `EffortLevel`, `TimeAnchor`, `System`, `Area`, `Action`, `Checkin` types
   but add `sortOrder` field to System, Area, and Action types
3. Add new types for API responses (MomentumOverview, TodayPayload, etc.)

---

## Appendix A: Complete API Endpoint Summary

| #  | Method | Path                                             | Module      | Auth       | Purpose                    |
| -- | ------ | ------------------------------------------------ | ----------- | ---------- | -------------------------- |
| 1  | GET    | /health                                          | Health      | No         | Liveness probe             |
| 2  | GET    | /health/ready                                    | Health      | No         | Readiness probe            |
| 3  | POST   | /webhooks/clerk                                  | Auth        | Webhook    | User provisioning          |
| 4  | GET    | /api/v1/users/me                                 | Users       | JWT        | Get profile                |
| 5  | PATCH  | /api/v1/users/me                                 | Users       | JWT        | Update profile             |
| 6  | POST   | /api/v1/users/me/onboard                         | Users       | JWT        | Complete onboarding        |
| 7  | DELETE | /api/v1/users/me                                 | Users       | JWT        | Delete account             |
| 8  | GET    | /api/v1/systems                                  | Systems     | JWT        | List systems               |
| 9  | POST   | /api/v1/systems                                  | Systems     | JWT        | Create system              |
| 10 | GET    | /api/v1/systems/:id                              | Systems     | JWT        | System detail              |
| 11 | PATCH  | /api/v1/systems/:id                              | Systems     | JWT        | Update system              |
| 12 | DELETE | /api/v1/systems/:id                              | Systems     | JWT        | Soft-delete system         |
| 13 | PATCH  | /api/v1/systems/reorder                          | Systems     | JWT        | Reorder systems            |
| 14 | GET    | /api/v1/systems/:systemId/areas                  | Areas       | JWT        | List areas                 |
| 15 | POST   | /api/v1/systems/:systemId/areas                  | Areas       | JWT        | Create area                |
| 16 | PATCH  | /api/v1/areas/:id                                | Areas       | JWT        | Update area                |
| 17 | DELETE | /api/v1/areas/:id                                | Areas       | JWT        | Soft-delete area           |
| 18 | GET    | /api/v1/areas/:areaId/bundles                    | Bundles     | JWT        | List bundles               |
| 19 | POST   | /api/v1/areas/:areaId/bundles                    | Bundles     | JWT        | Create bundle              |
| 20 | PATCH  | /api/v1/bundles/:id                              | Bundles     | JWT        | Update bundle              |
| 21 | DELETE | /api/v1/bundles/:id                              | Bundles     | JWT        | Soft-delete bundle         |
| 22 | GET    | /api/v1/checkins                                 | Checkins    | JWT        | List checkins              |
| 23 | POST   | /api/v1/checkins                                 | Checkins    | JWT        | Create checkin             |
| 24 | DELETE | /api/v1/checkins/:id                             | Checkins    | JWT        | Remove checkin             |
| 25 | GET    | /api/v1/energy/:date                             | Energy      | JWT        | Get daily energy           |
| 26 | PUT    | /api/v1/energy/:date                             | Energy      | JWT        | Set global energy          |
| 27 | PUT    | /api/v1/energy/:date/systems/:systemId           | Energy      | JWT        | Set system energy          |
| 28 | GET    | /api/v1/reflections/:date                        | Reflections | JWT        | Get reflection             |
| 29 | PUT    | /api/v1/reflections/:date                        | Reflections | JWT        | Upsert reflection          |
| 30 | GET    | /api/v1/momentum/overview                        | Momentum    | JWT        | Dashboard stats            |
| 31 | GET    | /api/v1/momentum/week-grid                       | Momentum    | JWT        | 7-day effort grid          |
| 32 | GET    | /api/v1/momentum/history                         | Momentum    | JWT        | Week summaries             |
| 33 | GET    | /api/v1/momentum/weeks/:weekStart                | Momentum    | JWT        | Week detail                |
| 34 | GET    | /api/v1/momentum/days/:date                      | Momentum    | JWT        | Day detail                 |
| 35 | GET    | /api/v1/today                                    | Today       | JWT        | Aggregate today data       |
| 36 | GET    | /api/v1/ai/conversations                         | AI Coach    | JWT        | List conversations         |
| 37 | POST   | /api/v1/ai/conversations                         | AI Coach    | JWT        | Start conversation         |
| 38 | GET    | /api/v1/ai/conversations/:id                     | AI Coach    | JWT        | Get conversation           |
| 39 | POST   | /api/v1/ai/conversations/:id/messages            | AI Coach    | JWT        | Send message               |
| 40 | GET    | /api/v1/ai/conversations/:id/stream              | AI Coach    | JWT        | Stream AI reply (SSE)      |
| 41 | DELETE | /api/v1/ai/conversations/:id                     | AI Coach    | JWT        | Delete conversation        |
| 42 | POST   | /api/v1/ai/suggest/systems                       | AI Coach    | JWT        | Get system suggestions     |
| 43 | POST   | /api/v1/ai/suggest/actions                       | AI Coach    | JWT        | Get bundle suggestions     |
| 44 | POST   | /api/v1/ai/apply-suggestion                      | AI Coach    | JWT        | Apply AI suggestion        |

Total: 44 endpoints

---

## Appendix B: Key Authorization Rules

Every data-mutating endpoint MUST verify the authenticated user owns the resource.

| Resource         | Ownership Chain                                     |
| ---------------- | --------------------------------------------------- |
| System           | system.userId === currentUser.profileId             |
| Area             | area.system.userId === currentUser.profileId        |
| ActionBundle     | bundle.area.system.userId === currentUser.profileId |
| Action           | action.bundle.area.system.userId === currentUser.profileId |
| Checkin          | checkin.system.userId === currentUser.profileId     |
| DailyEnergy      | energy.userId === currentUser.profileId             |
| DailyReflection  | reflection.userId === currentUser.profileId         |
| AiConversation   | conversation.userId === currentUser.profileId       |

Implementation: Service methods resolve the authenticated user’s **`UserProfile`** from the
Clerk JWT and filter queries / updates by **`userId`** (internal profile id) so resources are
owned by that profile. Nested resources (areas, bundles, checkins, etc.) are validated through
the same ownership chain inside services — there is **no** separate `OwnershipGuard` class in
the codebase; add route-level guards only if you introduce new cross-cutting rules.

NEVER trust client-supplied userId — always derive it from the JWT.

---

## Appendix C: Recommended npm Dependencies

### Production Dependencies

Aligned with **`package.json`** (April 2026); bump versions when upgrading the app.

```json
{
  "@nestjs/common": "^11.0.1",
  "@nestjs/core": "^11.0.1",
  "@nestjs/platform-express": "^11.0.1",
  "@nestjs/swagger": "^11.2.6",
  "@nestjs/config": "^4.0.3",
  "@nestjs/throttler": "^6.5.0",
  "@prisma/client": "^7.6.0",
  "@prisma/adapter-neon": "^7.6.0",
  "@neondatabase/serverless": "^1.0.2",
  "@clerk/backend": "^3.2.4",
  "@upstash/redis": "^1.37.0",
  "zod": "^4.3.6",
  "nestjs-zod": "^5.2.1",
  "nestjs-pino": "^4.6.1",
  "pino-http": "^11.0.0",
  "openai": "^6.33.0",
  "svix": "^1.90.0",
  "helmet": "^8.1.0",
  "compression": "^1.8.1",
  "dotenv": "^17.4.0",
  "reflect-metadata": "^0.2.2",
  "rxjs": "^7.8.1",
  "ws": "^8.20.0"
}
```

### Dev Dependencies

```json
{
  "prisma": "^7.6.0",
  "@nestjs/cli": "^11.0.0",
  "@nestjs/testing": "^11.1.18",
  "jest": "^30.0.0",
  "@types/jest": "^30.0.0",
  "ts-jest": "^29.2.5",
  "supertest": "^7.2.2",
  "@types/supertest": "^7.2.0",
  "typescript": "^5.7.3",
  "eslint": "^9.18.0",
  "typescript-eslint": "^8.20.0",
  "prettier": "^3.4.2",
  "pino-pretty": "^13.1.3",
  "ts-node": "^10.9.2",
  "@types/compression": "^1.8.1",
  "@types/express": "^5.0.6",
  "@types/ws": "^8.18.1"
}
```

Note: `class-validator` and `class-transformer` are intentionally NOT included.
All validation is handled by Zod.

---

## Appendix D: Frontend Domain Model Reference

For context, these are the current frontend types that the backend models are derived from.
Located in the frontend at `src/types/index.ts`:

```typescript
export type EffortLevel = "baseline" | "normal" | "stretch";

export type TimeAnchor =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "anytime";

export type System = {
  id: string;
  name: string;
  icon: string;
  replacedHabit?: string;
  createdAt: string;
};

export type Area = {
  id: string;
  systemId: string;
  name: string;
  createdAt: string;
};

export type Action = {
  id: string;
  areaId: string;
  bundleId: string;
  bundleTitle?: string;
  title: string;
  effortLevel: EffortLevel;
  anchor?: TimeAnchor;
};

export type Checkin = {
  id: string;
  systemId: string;
  areaId: string;
  actionId: string;
  energyLevel: EffortLevel;
  note?: string;
  date: string;  // "YYYY-MM-DD"
};
```

When migrating the frontend (Phase 5), add `sortOrder: number` to System, Area, and
the bundle/action types to match the new API response shapes.

---

## Appendix E: Valid Icon Names

The frontend uses Font Awesome icons mapped to custom names. The backend should
validate the `icon` field on System creation/update against this set.

Valid AppIconName values (from frontend `src/lib/icons.ts`):

```
fitness, writing, learning, business, health, music, coding, camera,
creative, world, energy, focus, coffee, fire, star, launch, sun, book,
house, bed, brain, leaf, meal, sprint, mail, phone, laptop, graduate,
wallet, chart, calendar, clock, moon, cloud, umbrella, car, plane,
train, ship, bicycle, dog, cat, baby, spa, tooth, physician, newspaper,
film, gamepad, chess, brush, hammer, wrench, tree, mountain, water,
snowflake, handshake, church, landmark, building, store, gift,
creditcard, piggybank, scale, key, fingerprint, microphone, headphones,
bookmark, map, compass, route, basketball, football, medal, crown,
guitar, drum
```

This list must be kept in sync with the frontend's `APP_ICON_BY_NAME` keys.
Store as a Set in `src/common/constants/icons.ts` and use in Zod validation:

```typescript
export const VALID_ICONS = new Set([ /* above list */ ]);

// In CreateSystemSchema:
icon: z.string().refine((v) => VALID_ICONS.has(v), { message: 'Invalid icon name' }),
```
