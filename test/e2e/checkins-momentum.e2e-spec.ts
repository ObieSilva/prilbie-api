import { INestApplication } from '@nestjs/common';

import { subtractDays } from '../../src/common/utils/date.utils';
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

describe('Checkins and momentum streak (e2e)', () => {
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

  it('updates streak across checkins and resets when today checkin is removed', async () => {
    const onboardData = await provisionOnboardedUser(app!, TEST_CLERK_USER_ID);
    const actionId = pickActionIdByLevel(onboardData, 'baseline');
    const server = app!.getHttpServer();

    const today = todayUtcDateString();
    const yesterday = subtractDays(today, 1);

    await authedRequest(server)
      .post('/api/v1/checkins')
      .send({ actionId, date: yesterday })
      .expect(201);

    const todayCheckin = await authedRequest(server)
      .post('/api/v1/checkins')
      .send({ actionId, date: today })
      .expect(201);

    const checkinId = todayCheckin.body.data.checkin.id as string;

    const overviewBefore = await authedRequest(server)
      .get('/api/v1/momentum/overview')
      .expect(200);
    expect(overviewBefore.body.success).toBe(true);
    expect(overviewBefore.body.data.streak).toBe(2);

    await authedRequest(server)
      .delete(`/api/v1/checkins/${checkinId}`)
      .expect(200);

    const overviewAfter = await authedRequest(server)
      .get('/api/v1/momentum/overview')
      .expect(200);
    expect(overviewAfter.body.data.streak).toBe(1);
  });
});
