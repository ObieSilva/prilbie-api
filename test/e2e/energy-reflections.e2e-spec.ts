import { INestApplication } from '@nestjs/common';

import { authedRequest } from '../helpers/e2e-authed-request';
import { provisionOnboardedUser } from '../helpers/e2e-onboarding-fixture';
import { createE2eApplication, TEST_CLERK_USER_ID } from '../helpers/test-app';
import { truncateAppTables } from '../helpers/truncate-app-tables';

function todayUtcDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Etc/UTC',
  }).format(new Date());
}

describe('Energy and reflections CRUD (e2e)', () => {
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

  it('sets global energy and upserts reflection for a date', async () => {
    await provisionOnboardedUser(app!, TEST_CLERK_USER_ID);
    const server = app!.getHttpServer();
    const date = todayUtcDateString();

    await authedRequest(server)
      .put(`/api/v1/energy/${date}`)
      .send({ level: 'normal' })
      .expect(200);

    const energyGet = await authedRequest(server)
      .get(`/api/v1/energy/${date}`)
      .expect(200);
    expect(energyGet.body.success).toBe(true);
    expect(energyGet.body.data.globalLevel).toBe('normal');

    const reflectionText = 'E2E reflection line';
    await authedRequest(server)
      .put(`/api/v1/reflections/${date}`)
      .send({ text: reflectionText })
      .expect(200);

    const reflectionGet = await authedRequest(server)
      .get(`/api/v1/reflections/${date}`)
      .expect(200);
    expect(reflectionGet.body.success).toBe(true);
    expect(reflectionGet.body.data.text).toBe(reflectionText);
  });
});
