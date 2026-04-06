import type { INestApplication } from '@nestjs/common';

import type { EffortLevel } from '@prisma/client';

import { PrismaService } from '../../src/prisma/prisma.service';

import { authedRequest } from './e2e-authed-request';
import { postClerkUserCreated } from './clerk-webhook';

export type OnboardingAction = {
  id: string;
  effortLevel: EffortLevel;
};

export type OnboardingResult = {
  systems: Array<{
    id: string;
    name: string;
    areas: Array<{
      id: string;
      bundles: Array<{
        id: string;
        actions: OnboardingAction[];
      }>;
    }>;
  }>;
};

export function buildMinimalOnboardingBody() {
  return {
    userName: 'E2E User',
    timezone: 'Etc/UTC',
    system: {
      name: 'Health',
      icon: 'fitness' as const,
      replacedHabit: 'Scrolling',
    },
    bundle: {
      bundleTitle: 'Morning routine',
      baseline: { title: 'Walk 5m', anchor: 'morning' as const },
      normal: { title: 'Walk 15m', anchor: 'morning' as const },
      stretch: { title: 'Walk 30m', anchor: 'morning' as const },
    },
  };
}

export function pickActionIdByLevel(
  data: OnboardingResult,
  level: EffortLevel,
): string {
  const actions = data.systems[0]?.areas[0]?.bundles[0]?.actions;
  if (!actions?.length) {
    throw new Error('Onboarding response missing actions');
  }
  const match = actions.find((action) => action.effortLevel === level);
  if (!match) {
    throw new Error(`No action with effort level ${level}`);
  }
  return match.id;
}

/**
 * Inserts {@link UserProfile} (same outcome as Clerk `user.created` webhook) then completes onboard.
 * Most e2e specs use this to avoid coupling to HTTP webhook raw-body behavior.
 */
export async function provisionOnboardedUser(
  app: INestApplication,
  clerkUserId: string,
): Promise<OnboardingResult> {
  const prisma = app.get(PrismaService);
  await prisma.userProfile.create({
    data: { clerkUserId, userName: 'E2E' },
  });

  const server = app.getHttpServer();

  const onboardBody = buildMinimalOnboardingBody();
  const response = await authedRequest(server)
    .post('/api/v1/users/me/onboard')
    .send(onboardBody);
  expect(response.status).toBe(201);

  expect(response.body.success).toBe(true);
  return response.body.data as OnboardingResult;
}

/**
 * Full HTTP path: Svix-signed `user.created` webhook then onboard (for dedicated webhook coverage).
 */
export async function provisionOnboardedUserViaClerkWebhook(
  app: INestApplication,
  clerkUserId: string,
): Promise<OnboardingResult> {
  await postClerkUserCreated(app, { clerkUserId });

  const server = app.getHttpServer();
  const onboardBody = buildMinimalOnboardingBody();
  const response = await authedRequest(server)
    .post('/api/v1/users/me/onboard')
    .send(onboardBody);
  expect(response.status).toBe(201);

  expect(response.body.success).toBe(true);
  return response.body.data as OnboardingResult;
}
