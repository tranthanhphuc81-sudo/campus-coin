/**
 * index.ts (mailer)
 * Public surface of the mailer integration.
 * Spec: docs/spec/04 §4.2 (integrations)
 */
export { queueEmail, type QueueEmailInput } from './mailer.service.js';
export { sendMail, type SendMailInput } from './transport.js';
