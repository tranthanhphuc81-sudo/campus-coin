/**
 * base.ts
 * Base seed for every environment: the 12 default categories and the system tip templates.
 * Idempotent – uses upserts on natural keys (owner_key+type+name, template code), so running
 * it again updates icons/colours/texts but never duplicates rows.
 * Main exports: seedBase, SeedBaseResult
 * Spec: docs/spec/06 §6.5 · docs/spec/05a §5.3 · docs/spec/05b §5.10
 */
import { SYSTEM_OWNER_KEY } from '@campuscoin/shared';
import type { AppPrismaClient } from '../../src/lib/prisma.js';
import { DEFAULT_CATEGORIES } from './data/categories.js';
import { TIP_TEMPLATES } from './data/tip-templates.js';

/** Counts of rows upserted by {@link seedBase}. */
export interface SeedBaseResult {
  categories: number;
  tipTemplates: number;
}

/**
 * Upserts default categories and tip templates.
 * @param prisma - Connected Prisma client (DML rights are enough).
 * @returns Number of categories and templates processed.
 */
export async function seedBase(prisma: AppPrismaClient): Promise<SeedBaseResult> {
  for (const c of DEFAULT_CATEGORIES) {
    const data = { icon: c.icon, color: c.color, sortOrder: c.sortOrder, isDefault: true };
    await prisma.category.upsert({
      where: { ownerKey_type_name: { ownerKey: SYSTEM_OWNER_KEY, type: c.type, name: c.name } },
      // isActive is left alone on update: an admin may have disabled a default (BR-CA-05).
      update: data,
      create: { ...data, name: c.name, type: c.type, ownerKey: SYSTEM_OWNER_KEY, userId: null },
    });
  }

  for (const t of TIP_TEMPLATES) {
    await prisma.tipTemplate.upsert({
      where: { code: t.code },
      // Only create: admins may edit template texts later, a re-seed must not overwrite them.
      update: {},
      create: { ...t, locale: 'en' },
    });
  }

  return { categories: DEFAULT_CATEGORIES.length, tipTemplates: TIP_TEMPLATES.length };
}
