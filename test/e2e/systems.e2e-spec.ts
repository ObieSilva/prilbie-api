import { INestApplication } from '@nestjs/common';

import { authedRequest } from '../helpers/e2e-authed-request';
import { provisionOnboardedUser } from '../helpers/e2e-onboarding-fixture';
import { createE2eApplication, TEST_CLERK_USER_ID } from '../helpers/test-app';
import { truncateAppTables } from '../helpers/truncate-app-tables';

describe('Systems CRUD (e2e)', () => {
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

  it('creates, updates, reorders, and soft-deletes systems', async () => {
    await provisionOnboardedUser(app!, TEST_CLERK_USER_ID);
    const server = app!.getHttpServer();

    const initialList = await authedRequest(server)
      .get('/api/v1/systems')
      .expect(200);
    expect(initialList.body.data).toHaveLength(1);
    const firstSystemId = initialList.body.data[0].id as string;

    const created = await authedRequest(server)
      .post('/api/v1/systems')
      .send({
        name: 'Learning',
        icon: 'book',
      })
      .expect(201);

    expect(created.body.success).toBe(true);
    const secondSystemId = created.body.data.id as string;

    const twoSystems = await authedRequest(server)
      .get('/api/v1/systems')
      .expect(200);
    expect(twoSystems.body.data).toHaveLength(2);

    await authedRequest(server)
      .patch(`/api/v1/systems/${secondSystemId}`)
      .send({ name: 'Learning (updated)' })
      .expect(200);

    const afterPatch = await authedRequest(server)
      .get(`/api/v1/systems/${secondSystemId}`)
      .expect(200);
    expect(afterPatch.body.data.name).toBe('Learning (updated)');

    await authedRequest(server)
      .patch('/api/v1/systems/reorder')
      .send({ orderedIds: [secondSystemId, firstSystemId] })
      .expect(200);

    const reordered = await authedRequest(server)
      .get('/api/v1/systems')
      .expect(200);
    const orderedIds = (reordered.body.data as Array<{ id: string }>).map(
      (row) => row.id,
    );
    expect(orderedIds[0]).toBe(secondSystemId);
    expect(orderedIds[1]).toBe(firstSystemId);

    await authedRequest(server)
      .delete(`/api/v1/systems/${secondSystemId}`)
      .expect(200);

    const afterDelete = await authedRequest(server)
      .get('/api/v1/systems')
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(1);
    expect(afterDelete.body.data[0].id).toBe(firstSystemId);

    await authedRequest(server)
      .get(`/api/v1/systems/${secondSystemId}`)
      .expect(404);
  });
});
