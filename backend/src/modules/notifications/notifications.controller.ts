/**
 * notifications.controller.ts
 * HTTP <-> DTO glue for `/api/v1/notifications`. `createStreamTicket` is Bearer-authenticated like
 * every other route here; `streamNotifications` (`GET /stream`) is deliberately NOT behind the
 * `authenticate` middleware (EventSource cannot set an Authorization header) — it validates the
 * one-time ticket itself and opens a raw SSE feed for the request's lifetime.
 * Main exports: listNotifications, markRead, markAllRead, createStreamTicket, streamNotifications
 * Spec: docs/spec/05c §5.11 (notifications) · docs/spec/07 §7.3.3
 */
import type { Request, RequestHandler, Response } from 'express';
import { NOTIFICATION_STREAM_HEARTBEAT_SEC, type ListNotificationsQueryInput } from '@campuscoin/shared';
import { createRedisClient } from '../../lib/redis.js';
import { unauthenticated } from '../../lib/problem.js';
import type { BigIntIdParamInput } from './notifications.schema.js';
import * as notificationsService from './notifications.service.js';

const HEARTBEAT_MS = NOTIFICATION_STREAM_HEARTBEAT_SEC * 1000;

/** `GET /notifications` — a page of the caller's notifications, plus a fresh unread count. */
export const listNotifications: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListNotificationsQueryInput;
  const result = await notificationsService.list(req.auth!.userId, query);
  res.status(200).json(result);
};

/** `POST /notifications/:id/read` — marks one of the caller's own notifications read. */
export const markRead: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BigIntIdParamInput;
  const updated = await notificationsService.markRead(req.auth!.userId, params.id);
  res.status(200).json(updated);
};

/** `POST /notifications/read-all` — marks every unread notification of the caller as read. */
export const markAllRead: RequestHandler = async (req, res) => {
  await notificationsService.markAllRead(req.auth!.userId);
  res.status(204).end();
};

/** `POST /notifications/stream-ticket` — issues a one-time ticket to open the SSE stream. */
export const createStreamTicket: RequestHandler = async (req, res) => {
  const ticket = await notificationsService.createStreamTicket(req.auth!.userId);
  res.status(201).json(ticket);
};

/** Writes one SSE `data:` frame. */
function writeEvent(res: Response, data: string): void {
  res.write(`data: ${data}\n\n`);
}

/**
 * `GET /notifications/stream?ticket=` — validates the one-time ticket (401 if missing/expired/
 * already used), then subscribes a dedicated Redis connection to the caller's notification
 * channel and forwards every message as an SSE event until the client disconnects. A heartbeat
 * comment keeps intermediary proxies from closing an idle connection.
 */
export const streamNotifications: RequestHandler = async (req: Request, res: Response, next) => {
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : undefined;
  if (!ticket) {
    next(unauthenticated('Missing stream ticket'));
    return;
  }

  const userId = await notificationsService.consumeStreamTicket(ticket);
  if (!userId) {
    next(unauthenticated('Invalid or expired stream ticket'));
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disables response buffering on nginx/other reverse proxies in front of the API (infra/nginx).
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // SSE needs a SUBSCRIBE-mode connection, which ioredis dedicates to pub/sub only (it can no
  // longer issue GET/SET on it) — never the shared `redis` client used for everything else.
  const subscriber = createRedisClient();
  const channel = notificationsService.channelFor(userId);
  await subscriber.subscribe(channel);
  subscriber.on('message', (_channel: string, message: string) => {
    writeEvent(res, message);
  });

  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, HEARTBEAT_MS);

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.quit().catch(() => {});
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
};
