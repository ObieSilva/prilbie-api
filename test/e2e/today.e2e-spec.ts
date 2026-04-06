import { INestApplication } from '@nestjs/common';

import { authedRequest } from '../helpers/e2e-authed-request';
import {
  pickActionIdByLevel,
  provisionOnboardedUser,
} from '../helpers/e2e-onboarding-fixture';
import { createE2eApplication, TEST_CLERK_USER_ID } from '../helpers/test-app';
import { truncateAppTables } from '../helpers/truncate-app-tables';

function todayUtcDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Etc/UTC',
  }).format(new Date());
}

describe('Today aggregate (e2e)', () => {
  let app: INestApplication | undefined;

  beforeEach(async () => {
    app = await createE2eApplication();
  });

  afterEach(async () => {
    truncateAppTables();
    if (app !== undefined) {
      await app.close();
    }
  });

  it('returns a complete today payload after onboard, checkin, energy, and reflection', async () => {
    const onboardData = await provisionOnboardedUser(app!, TEST_CLERK_USER_ID);
    const actionId = pickActionIdByLevel(onboardData, 'normal');
    const server = app!.getHttpServer();
    const date = todayUtcDateString();

    await authedRequest(server)
      .post('/api/v1/checkins')
      .send({ actionId, date })
      .expect(201);

    await authedRequest(server)
      .put(`/api/v1/energy/${date}`)
      .send({ level: 'stretch' })
      .expect(200);

    const reflectionText = 'Today aggregate reflection';
    await authedRequest(server)
      .put(`/api/v1/reflections/${date}`)
      .send({ text: reflectionText })
      .expect(200);

    const todayResponse = await authedRequest(server)
      .get('/api/v1/today')
      .expect(200);

    expect(todayResponse.body.success).toBe(true);
    const payload = todayResponse.body.data as Record<string, unknown>;

    expect(payload.user).toMatchObject({
      userName: 'E2E User',
      onboarded: true,
      timezone: 'Etc/UTC',
    });
    expect(Array.isArray(payload.systems)).toBe(true);
    expect((payload.systems as unknown[]).length).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(payload.todayCheckins)).toBe(true);
    expect((payload.todayCheckins as unknown[]).length).toBe(1);

    expect(typeof payload.streak).toBe('number');
    expect(typeof payload.weeklyMomentum).toBe('number');
    expect(payload.momentumTier).toBeDefined();
    expect(payload.nextTier).toBeDefined();

    expect(payload.energy).toMatchObject({
      globalLevel: 'stretch',
    });
    expect(payload.reflection).toBe(reflectionText);
  });
});
