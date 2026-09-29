/**
 * tipTemplate.ts
 * Zod schemas + DTO for the admin portal's savings-tip-template CRUD (P15). `titleTpl`/`bodyTpl`
 * are HTML-filtered (`noHtmlSchema`), length-bounded to the DB column sizes, and may only contain
 * the 3 placeholders the render engine (`backend/src/modules/tips/tips.render.ts`) understands.
 * `locale` is never accepted from the client — always "en" (CLAUDE.md golden rule 1).
 * Main exports: createTipTemplateSchema, updateTipTemplateSchema, previewTipTemplateSchema
 *   + inferred *Input types, TipTemplateDto
 * Spec: docs/spec/05b §5.10 (Bảng 23/35) · docs/spec/05c §5.13 · docs/spec/07 §7.3.4
 */
import { z } from 'zod';
import { TipRuleType } from '../enums.js';
import { TIP_TEMPLATE_BODY_MAX_LENGTH, TIP_TEMPLATE_CODE_MAX_LENGTH, TIP_TEMPLATE_TITLE_MAX_LENGTH } from '../constants.js';
import { noHtmlSchema } from './common.js';

const CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
/** Every `{...}` placeholder in a template string. */
const PLACEHOLDER = /\{[^}]*\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['category', 'amount', 'percent']);

/** True when every `{...}` placeholder in `value` is exactly one of the 3 allowed names. */
function hasOnlyAllowedPlaceholders(value: string): boolean {
  const matches = value.match(PLACEHOLDER) ?? [];
  return matches.every((m) => ALLOWED_PLACEHOLDERS.has(m.slice(1, -1)));
}

/** Trimmed, length-bounded, HTML-free, placeholder-whitelisted template field. */
function templateFieldSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(maxLength, `Must be at most ${maxLength} characters.`)
    .pipe(noHtmlSchema)
    .refine(hasOnlyAllowedPlaceholders, 'Only {category}, {amount} and {percent} placeholders are allowed.');
}

const titleTplSchema = templateFieldSchema(TIP_TEMPLATE_TITLE_MAX_LENGTH);
const bodyTplSchema = templateFieldSchema(TIP_TEMPLATE_BODY_MAX_LENGTH);

/** Stable, admin-chosen code, e.g. `"R1_OVER_BUDGET_1"`. Immutable after creation. */
export const tipTemplateCodeSchema = z
  .string()
  .trim()
  .regex(CODE_PATTERN, `Must be 1-${TIP_TEMPLATE_CODE_MAX_LENGTH} uppercase letters, digits or underscores.`);

/** Body of `POST /admin/tip-templates`. `code`/`ruleType` are immutable once set. */
export const createTipTemplateSchema = z
  .object({
    code: tipTemplateCodeSchema,
    ruleType: z.enum(TipRuleType),
    titleTpl: titleTplSchema,
    bodyTpl: bodyTplSchema,
    isActive: z.boolean().default(true),
  })
  .strict();
/** Inferred input type of {@link createTipTemplateSchema}. */
export type CreateTipTemplateInput = z.infer<typeof createTipTemplateSchema>;

/** Body of `PATCH /admin/tip-templates/:id`. No `code`/`ruleType` field — immutable after creation. */
export const updateTipTemplateSchema = z
  .object({
    titleTpl: titleTplSchema.optional(),
    bodyTpl: bodyTplSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided.');
/** Inferred input type of {@link updateTipTemplateSchema}. */
export type UpdateTipTemplateInput = z.infer<typeof updateTipTemplateSchema>;

/** Body of `POST /admin/tip-templates/preview` — renders an in-progress edit before saving. */
export const previewTipTemplateSchema = z
  .object({
    titleTpl: titleTplSchema,
    bodyTpl: bodyTplSchema,
  })
  .strict();
/** Inferred input type of {@link previewTipTemplateSchema}. */
export type PreviewTipTemplateInput = z.infer<typeof previewTipTemplateSchema>;

/** Shape of a tip template as returned by the admin CRUD endpoints. */
export interface TipTemplateDto {
  id: number;
  code: string;
  ruleType: TipRuleType;
  titleTpl: string;
  bodyTpl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
