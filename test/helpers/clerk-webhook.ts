import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import request from 'supertest';
import { Webhook } from 'svix';

export type PostClerkUserCreatedOptions = {
  clerkUserId: string;
  firstName?: string;
};

function buildUserCreatedPayload(options: PostClerkUserCreatedOptions): string {
  return JSON.stringify({
    type: 'user.created',
    data: {
      id: options.clerkUserId,
      first_name: options.firstName ?? 'E2E',
    },
  });
}

/**
 * Simulates Clerk `user.created` with a Svix-signed body so {@link AuthController} accepts it.
 * Sends the JSON as a UTF-8 string so `req.rawBody` matches the signed bytes (Supertest buffers
 * can differ slightly from `JSON.stringify` output).
 */
export async function postClerkUserCreated(
  app: INestApplication,
  options: PostClerkUserCreatedOptions,
): Promise<void> {
  const secret = app
    .get(ConfigService)
    .get<string>('CLERK_WEBHOOK_SECRET')
    ?.trim();
  if (!secret) {
    throw new Error(
      'CLERK_WEBHOOK_SECRET is missing. Set it in .env.test (see .env.test.example).',
    );
  }

  const webhook = new Webhook(secret);
  const payload = buildUserCreatedPayload(options);
  const msgId = `msg_e2e_${options.clerkUserId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const timestampSeconds = Math.floor(Date.now() / 1000);
  const timestamp = new Date(timestampSeconds * 1000);
  const svixSignature = webhook.sign(msgId, timestamp, payload);

  const httpServer = app.getHttpServer();
  await request(httpServer)
    .post('/webhooks/clerk')
    .set('Content-Type', 'application/json; charset=utf-8')
    .set('svix-id', msgId)
    .set('svix-timestamp', String(timestampSeconds))
    .set('svix-signature', svixSignature)
    .send(payload)
    .expect(201);
}
