/**
 * announcement.ts
 * DTO type for system announcements shown on the dashboard/public banner, plus the admin CRUD
 * Zod schemas + DTO (P15). Title/body are HTML-filtered (`noHtmlSchema`, docs/spec/05c Table 24)
 * and length-bounded to the DB `@db.VarChar` sizes.
 * Main exports: createAnnouncementSchema, updateAnnouncementSchema + inferred *Input types,
 *   AnnouncementDto, AdminAnnouncementDto
 * Spec: docs/spec/05c §5.13 · docs/spec/07 §7.3.3, §7.3.4
 */
import { z } from 'zod';
import type { AnnouncementLevel } from '../enums.js';
import { AnnouncementLevel as AnnouncementLevelEnum } from '../enums.js';
import { ANNOUNCEMENT_BODY_MAX_LENGTH, ANNOUNCEMENT_TITLE_MAX_LENGTH } from '../constants.js';
import { noHtmlSchema } from './common.js';

/** Shape of an active announcement as returned by `GET /announcements/active`. */
export interface AnnouncementDto {
  id: number;
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: string;
  endsAt: string | null;
}

/** Trimmed, length-bounded, HTML-free announcement title. */
const announcementTitleSchema = z
  .string()
  .trim()
  .min(1, 'Title is required.')
  .max(ANNOUNCEMENT_TITLE_MAX_LENGTH, `Title must be at most ${ANNOUNCEMENT_TITLE_MAX_LENGTH} characters.`)
  .pipe(noHtmlSchema);

/** Trimmed, length-bounded, HTML-free announcement body. */
const announcementBodySchema = z
  .string()
  .trim()
  .min(1, 'Body is required.')
  .max(ANNOUNCEMENT_BODY_MAX_LENGTH, `Body must be at most ${ANNOUNCEMENT_BODY_MAX_LENGTH} characters.`)
  .pipe(noHtmlSchema);

/** Body of `POST /admin/announcements`. */
export const createAnnouncementSchema = z
  .object({
    title: announcementTitleSchema,
    body: announcementBodySchema,
    level: z.enum(AnnouncementLevelEnum),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();
/** Inferred input type of {@link createAnnouncementSchema}. */
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

/** Body of `PATCH /admin/announcements/:id`. */
export const updateAnnouncementSchema = z
  .object({
    title: announcementTitleSchema.optional(),
    body: announcementBodySchema.optional(),
    level: z.enum(AnnouncementLevelEnum).optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided.');
/** Inferred input type of {@link updateAnnouncementSchema}. */
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

/** Shape of an announcement as returned by the admin CRUD endpoints (every field, incl. `isActive`). */
export interface AdminAnnouncementDto {
  id: number;
  title: string;
  body: string;
  level: AnnouncementLevel;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
