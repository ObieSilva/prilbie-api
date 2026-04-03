# Consistency App — Backend Specification Document

> **Purpose:** Complete implementation guide for the backend engineering team.
> **Stack:** NestJS · PostgreSQL (Neon) · Clerk Auth · Zod · Swagger · Docker · Google Cloud Run
> **Date:** April 2026

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
| AI           | OpenAI GPT-4o (or Anthropic Claude) via AI SDK or direct  |
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
// In main.ts
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
  url      = env("DATABASE_URL")
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

5. **Soft deletes** on System, Area, ActionBundle, and Action via nullable `deletedAt`.
   All list queries filter `WHERE deleted_at IS NULL`. A scheduled job hard-deletes rows
   older than 30 days. This protects against accidental data loss and supports undo.

6. **sortOrder** on System, Area, and ActionBundle lets users reorder items.
   Default 0; clients send explicit ordering via PATCH.

7. **timezone** on UserProfile for correct date boundaries. The frontend sends dates as
   `YYYY-MM-DD` strings based on the user's local time; the backend validates streak
   calculations and "today" logic against this timezone.

8. **focusedActionId / focusedAt** on UserProfile persists the user's focused action
   across sessions. This was previously ephemeral in the frontend's Zustand store.

9. **clerkUserId** on `UserProfile` maps to Clerk's external user ID. All other tables
   reference the internal `UserProfile.id`.

10. **Neon PostgreSQL** — Serverless PostgreSQL. Use `@prisma/adapter-neon` with the
    `ws` WebSocket library for serverless connection pooling. No need for PgBouncer.

### 2.4 Neon + Prisma Connection Setup

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaNeon(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

## 3. Authentication (Clerk)

### 3.1 Overview

The frontend uses `@clerk/nextjs` to sign users in and obtain a JWT. Every API request
sends the JWT in the `Authorization: Bearer <token>` header. The backend verifies the JWT
using `@clerk/backend` and extracts the Clerk user ID from `payload.sub`.

### 3.2 Auth Guard Implementation

```typescript
// src/common/guards/clerk-auth.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClerkClient } from '@clerk/backend';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    try {
      const payload = await this.clerk.verifyToken(token, {
        jwtKey: process.env.CLERK_JWT_KEY,
      });
      request.auth = { userId: payload.sub };
      return true;
    } catch {
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

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                             // dev/test seed data
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── guards/
│   │   │   └── clerk-auth.guard.ts
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts    // standard response envelope
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── middleware/
│   │   │   └── correlation-id.middleware.ts // request tracing
│   │   ├── pipes/
│   │   │   └── zod-validation.pipe.ts
│   │   ├── schemas/
│   │   │   ├── enums.ts                    // shared Zod enum schemas
│   │   │   └── shared.ts                   // TierInputSchema, BundleLevelsSchema
│   │   ├── constants/
│   │   │   └── momentum.ts                 // points, tiers, milestones
│   │   └── dto/
│   │       └── pagination.dto.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts               // Neon adapter setup
│   ├── cache/
│   │   ├── cache.module.ts
│   │   └── cache.service.ts                // Upstash Redis wrapper
│   ├── auth/
│   │   ├── auth.module.ts
│   │   └── auth.controller.ts              // Clerk webhook handler
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
│   │       └── update-system.dto.ts
│   ├── areas/
│   │   ├── areas.module.ts
│   │   ├── areas.controller.ts
│   │   ├── areas.service.ts
│   │   └── dto/
│   │       ├── create-area.dto.ts
│   │       └── update-area.dto.ts
│   ├── action-bundles/
│   │   ├── action-bundles.module.ts
│   │   ├── action-bundles.controller.ts
│   │   ├── action-bundles.service.ts
│   │   └── dto/
│   │       ├── create-bundle.dto.ts        // imports from common/schemas/shared
│   │       └── update-bundle.dto.ts
│   ├── checkins/
│   │   ├── checkins.module.ts
│   │   ├── checkins.controller.ts
│   │   ├── checkins.service.ts
│   │   └── dto/
│   │       └── create-checkin.dto.ts
│   ├── energy/
│   │   ├── energy.module.ts
│   │   ├── energy.controller.ts
│   │   ├── energy.service.ts
│   │   └── dto/
│   │       ├── set-global-energy.dto.ts
│   │       └── set-system-energy.dto.ts
│   ├── reflections/
│   │   ├── reflections.module.ts
│   │   ├── reflections.controller.ts
│   │   ├── reflections.service.ts
│   │   └── dto/
│   │       └── upsert-reflection.dto.ts
│   ├── momentum/
│   │   ├── momentum.module.ts
│   │   ├── momentum.controller.ts
│   │   └── momentum.service.ts
│   ├── today/
│   │   ├── today.module.ts
│   │   ├── today.controller.ts
│   │   └── today.service.ts
│   ├── ai-coach/
│   │   ├── ai-coach.module.ts
│   │   ├── ai-coach.controller.ts
│   │   ├── ai-coach.service.ts
│   │   ├── ai-coach.prompts.ts
│   │   └── dto/
│   │       ├── create-conversation.dto.ts
│   │       ├── send-message.dto.ts
│   │       └── apply-suggestion.dto.ts
│   └── health/
│       └── health.controller.ts            // liveness + readiness probes
├── test/
│   ├── setup.ts                            // test DB, mock factories
│   ├── helpers/
│   │   ├── test-app.ts                     // createTestingModule helper
│   │   ├── mock-auth.ts                    // mock Clerk JWT
│   │   └── mock-ai.ts                      // mock OpenAI
│   ├── e2e/
│   │   ├── systems.e2e-spec.ts
│   │   ├── checkins.e2e-spec.ts
│   │   └── ...
│   └── unit/
│       ├── momentum.service.spec.ts
│       ├── checkins.service.spec.ts
│       └── ...
├── Dockerfile
├── docker-compose.yml
├── cloudbuild.yaml
├── .env.example
├── tsconfig.json
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

Implement modules in this dependency order:

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
sets userName, creates first system + "General" area + action bundle (3 actions),
sets onboarded=true, sets accountCreatedAt.

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
  energyLevel: EffortLevel;  // "baseline" | "normal" | "stretch"
  date: string;              // "YYYY-MM-DD"
  note?: string;             // max 500 chars, trimmed
}
```

IMPORTANT: The service resolves `systemId` and `areaId` from the `actionId`'s
bundle → area → system chain. The client only sends `actionId`. This prevents
mismatches and enforces referential integrity server-side.

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
    accountCreatedAt: string | null;
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
import { EffortLevelSchema, DateStringSchema } from '../../common/schemas/enums';

export const CreateCheckinSchema = z.object({
  actionId: z.string().min(1),
  energyLevel: EffortLevelSchema,
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

1. Account is at least 7 days old (accountCreatedAt + 7 days <= today)
2. lastReviewDate is null OR was more than 7 days ago
3. User has at least one system
4. Energy has been set for today

The backend returns the raw data; the frontend evaluates these conditions.

### 7.7 Expansion Offers

Source: `src/lib/action-expansion.ts` (frontend)
Target: Computed in `CheckinsService.create()` response

After completing a baseline action → offer normal and stretch actions from same system
After completing a normal action   → offer stretch action from same system
After completing a stretch action  → no expansion offers

Preference: same area first, then other areas within the system. Sort by action ID.

Returned in the POST /api/v1/checkins response so the frontend can display them
immediately in the completion modal.

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

For chat conversations, use Server-Sent Events (SSE) for streaming AI responses:

```typescript
@Sse('conversations/:id/stream')
streamMessage(
  @Param('id') id: string,
  @Body() dto: SendMessageDto,
  @CurrentUser() user: { userId: string },
) {
  return this.aiCoachService.streamResponse(id, dto, user.userId);
}
```

The service should:
1. Save the user's message to the database
2. Build the system prompt with user context
3. Stream the AI response
4. Save the complete assistant message to the database when streaming finishes

---

## 9. Caching Strategy

### 9.1 Why Cache

Momentum endpoints compute streaks, totals, and per-system stats from raw checkins
on every request. Without caching, `GET /api/v1/momentum/overview` scans all checkin
rows for the user, and `GET /api/v1/today` joins across 5+ tables.

### 9.2 Cache Provider

Use **Upstash Redis** (serverless, pay-per-request) — natural fit with Neon and
Cloud Run. Alternative: Google Memorystore.

```typescript
// src/cache/cache.service.ts
import { Injectable } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class CacheService {
  private redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL,
    token: process.env.UPSTASH_REDIS_TOKEN,
  });

  async get<T>(key: string): Promise<T | null> { ... }
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> { ... }
  async del(key: string): Promise<void> { ... }
  async delPattern(pattern: string): Promise<void> { ... }
}
```

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

| Type        | Location           | What It Tests                                    | Tools                     |
| ----------- | ------------------ | ------------------------------------------------ | ------------------------- |
| Unit        | `test/unit/`       | Service methods with mocked Prisma               | Jest, ts-jest              |
| Integration | `test/e2e/`        | Full HTTP request → DB → response                | Jest, Supertest, test DB   |
| E2E         | `test/e2e/`        | Multi-endpoint workflows (onboarding → checkin)  | Jest, Supertest            |

### 11.2 Test Database

Use a separate Neon branch or local PostgreSQL for tests:

```env
# .env.test
DATABASE_URL=postgresql://user:pass@localhost:5432/consistency_app_test
```

```typescript
// test/setup.ts
beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: testDbUrl } });
});

afterEach(async () => {
  // Truncate all tables between tests
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE checkins, actions, action_bundles, areas, systems,
    daily_energies, system_energy_overrides, daily_reflections,
    ai_messages, ai_conversations, user_profiles CASCADE
  `);
});
```

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

Tests MUST run before deployment. See Section 12.3 for the updated cloudbuild.yaml
that includes a test step.

---

## 12. Docker & Deployment (GCP + Neon)

### 12.1 Dockerfile

```dockerfile
# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
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

Note: For local development, use standard PostgreSQL. In staging/production,
the `DATABASE_URL` points to **Neon** and the Redis URL points to **Upstash**.
The Prisma adapter auto-detects the Neon driver when `previewFeatures = ["driverAdapters"]`
is set.

### 12.3 Google Cloud Deployment

Services used:
- **Cloud Run** — Hosts the Docker container (auto-scaling, pay-per-request)
- **Neon** — Serverless PostgreSQL (external, not Cloud SQL)
- **Upstash Redis** — Serverless cache (external)
- **Secret Manager** — Stores DATABASE_URL, CLERK keys, OPENAI key
- **Cloud Build** — CI/CD pipeline triggered on push to main
- **Artifact Registry** — Docker image storage

cloudbuild.yaml:

```yaml
steps:
  # Run tests
  - name: 'node:20-alpine'
    entrypoint: 'sh'
    args:
      - '-c'
      - 'npm ci && npx prisma generate && npm run test'
    secretEnv: ['DATABASE_URL_TEST']

  # Build the Docker image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${COMMIT_SHA}'
      - '.'

  # Push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${COMMIT_SHA}'

  # Run Prisma migrations against Neon
  - name: 'node:20-alpine'
    entrypoint: 'sh'
    args:
      - '-c'
      - 'npm ci && npx prisma migrate deploy'
    secretEnv: ['DATABASE_URL']

  # Deploy to Cloud Run
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - '${_SERVICE}'
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${COMMIT_SHA}'
      - '--region=${_REGION}'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--set-env-vars=NODE_ENV=production'
      - '--set-secrets=DATABASE_URL=neon-db-url:latest,CLERK_SECRET_KEY=clerk-secret:latest,CLERK_JWT_KEY=clerk-jwt-key:latest,OPENAI_API_KEY=openai-key:latest,CLERK_WEBHOOK_SECRET=clerk-webhook-secret:latest,UPSTASH_REDIS_URL=upstash-url:latest,UPSTASH_REDIS_TOKEN=upstash-token:latest'
      - '--min-instances=0'
      - '--max-instances=10'
      - '--cpu=1'
      - '--memory=512Mi'
      - '--timeout=60s'

substitutions:
  _REGION: us-central1
  _REPO: consistency-app
  _SERVICE: consistency-api

availableSecrets:
  secretManager:
    - versionName: projects/${PROJECT_ID}/secrets/neon-db-url/versions/latest
      env: 'DATABASE_URL'
    - versionName: projects/${PROJECT_ID}/secrets/neon-db-url-test/versions/latest
      env: 'DATABASE_URL_TEST'
```

### 12.4 Rollback

Cloud Run supports instant rollback to any previous revision:

```bash
# List revisions
gcloud run revisions list --service=consistency-api --region=us-central1

# Rollback to a specific revision
gcloud run services update-traffic consistency-api \
  --to-revisions=consistency-api-00042-abc=100 \
  --region=us-central1
```

Database rollbacks require a Prisma migration revert or restoring from a Neon branch.
Neon supports **branching** — create a branch before each migration as a restore point.

### 12.5 Environment Variables

```env
# .env.example

# ─── Database (Neon) ──────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/consistency_app?sslmode=require

# ─── Cache (Upstash Redis) ───────────────────────────────
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=AXxx...

# ─── Clerk Auth ───────────────────────────────────────────
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY=...
CLERK_WEBHOOK_SECRET=whsec_...

# ─── AI ───────────────────────────────────────────────────
OPENAI_API_KEY=sk-...
AI_MODEL=gpt-4o

# ─── App ──────────────────────────────────────────────────
PORT=8080
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000
```

---

## 13. Swagger Configuration

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Structured logging
  app.useLogger(app.get(Logger));

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // API versioning prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['/health', '/health/ready', '/webhooks/clerk'],
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Consistency App API')
    .setDescription('Backend API for the Consistency habit-tracking application')
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
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
```

Swagger UI: `/api/docs`

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
| 40 | DELETE | /api/v1/ai/conversations/:id                     | AI Coach    | JWT        | Delete conversation        |
| 41 | POST   | /api/v1/ai/suggest/systems                       | AI Coach    | JWT        | Get system suggestions     |
| 42 | POST   | /api/v1/ai/suggest/actions                       | AI Coach    | JWT        | Get bundle suggestions     |
| 43 | POST   | /api/v1/ai/apply-suggestion                      | AI Coach    | JWT        | Apply AI suggestion        |

Total: 43 endpoints

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

Implementation: Service methods always filter by userId from JWT to implicitly
enforce ownership. A reusable `OwnershipGuard` provides defense-in-depth for
nested resources (areas, bundles) by resolving the ownership chain.

NEVER trust client-supplied userId — always derive it from the JWT.

---

## Appendix C: Recommended npm Dependencies

### Production Dependencies

```json
{
  "@nestjs/core": "^10",
  "@nestjs/common": "^10",
  "@nestjs/platform-express": "^10",
  "@nestjs/swagger": "^7",
  "@nestjs/config": "^3",
  "@nestjs/throttler": "^5",
  "@prisma/client": "^6",
  "@prisma/adapter-neon": "^6",
  "@neondatabase/serverless": "^0.10",
  "@clerk/backend": "^1",
  "@upstash/redis": "^1",
  "zod": "^3",
  "nestjs-zod": "^3",
  "nestjs-pino": "^4",
  "pino-http": "^10",
  "openai": "^4",
  "svix": "^1",
  "helmet": "^7",
  "compression": "^1",
  "rxjs": "^7",
  "ws": "^8"
}
```

### Dev Dependencies

```json
{
  "prisma": "^6",
  "@nestjs/cli": "^10",
  "@nestjs/testing": "^10",
  "jest": "^29",
  "@types/jest": "^29",
  "ts-jest": "^29",
  "supertest": "^6",
  "@types/supertest": "^6",
  "typescript": "^5",
  "eslint": "^8",
  "@typescript-eslint/eslint-plugin": "^7",
  "@typescript-eslint/parser": "^7",
  "prettier": "^3",
  "pino-pretty": "^11",
  "ts-node": "^10",
  "@types/compression": "^1",
  "@types/express": "^4",
  "@types/ws": "^8"
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
