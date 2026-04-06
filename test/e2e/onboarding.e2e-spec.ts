import { INestApplication } from '@nestjs/common';

import { authedRequest } from '../helpers/e2e-authed-request';
import { createE2eApplication, TEST_CLERK_USER_ID } from '../helpers/test-app';
import { truncateAppTables } from '../helpers/truncate-app-tables';
import { provisionOnboardedUserViaClerkWebhook } from '../helpers/e2e-onboarding-fixture';

describe('Onboarding flow (e2e)', () => {
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

  it('provisions user via webhook, onboards, and exposes system, area, bundle, and actions', async () => {
    await provisionOnboardedUserViaClerkWebhook(app!, TEST_CLERK_USER_ID);

    const systemsResponse = await authedRequest(app!.getHttpServer())
      .get('/api/v1/systems')
      .expect(200);

    expect(systemsResponse.body.success).toBe(true);
    const systems = systemsResponse.body.data as Array<{
      id: string;
      name: string;
    }>;
    expect(systems).toHaveLength(1);
    expect(systems[0].name).toBe('Health');

    const systemId = systems[0].id;

    const areasResponse = await authedRequest(app!.getHttpServer())
      .get(`/api/v1/systems/${systemId}/areas`)
      .expect(200);

    expect(areasResponse.body.success).toBe(true);
    const areas = areasResponse.body.data as Array<{
      id: string;
      name: string;
    }>;
    expect(areas).toHaveLength(1);
    expect(areas[0].name).toBe('General');

    const areaId = areas[0].id;

    const bundlesResponse = await authedRequest(app!.getHttpServer())
      .get(`/api/v1/areas/${areaId}/bundles`)
      .expect(200);

    expect(bundlesResponse.body.success).toBe(true);
    const bundles = bundlesResponse.body.data as Array<{
      actions: Array<{ effortLevel: string }>;
    }>;
    expect(bundles).toHaveLength(1);
    expect(bundles[0].actions).toHaveLength(3);
    const levels = new Set(
      bundles[0].actions.map((action) => action.effortLevel),
    );
    expect(levels.has('baseline')).toBe(true);
    expect(levels.has('normal')).toBe(true);
    expect(levels.has('stretch')).toBe(true);
  });
});
