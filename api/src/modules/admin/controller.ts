import type { Request, Response } from "express";

import { unauthenticated } from "../../lib/problem.js";
import {
  createAnnouncementItem,
  createDefaultCategoryItem,
  createTipTemplateItem,
  deleteAnnouncementItem,
  deleteDefaultCategoryItem,
  deleteTipTemplateItem,
  disableUser,
  enableUser,
  getActiveAnnouncements,
  getAuditLogs,
  getCategoriesUsage,
  getOverviewStats,
  getUserDetail,
  getUsers,
  listAnnouncementItems,
  listDefaultCategoryItems,
  listTipTemplateItems,
  previewAnnouncement,
  previewTipTemplate,
  sendResetLinkByAdmin,
  updateAnnouncementItem,
  updateDefaultCategoryItem,
  updateTipTemplateItem,
} from "./service.js";

function requireActorId(req: Request): string {
  const actorId = req.user?.id;
  if (!actorId) {
    throw unauthenticated();
  }

  return actorId;
}

export async function adminOverviewStatsHandler(req: Request, res: Response): Promise<void> {
  const stats = await getOverviewStats({
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  });

  res.status(200).json(stats);
}

export async function adminCategoriesUsageHandler(_req: Request, res: Response): Promise<void> {
  const data = await getCategoriesUsage();
  res.status(200).json(data);
}

export async function adminUsersHandler(req: Request, res: Response): Promise<void> {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;

  const data = await getUsers({
    q,
    page,
    pageSize,
  });

  res.status(200).json(data);
}

export async function adminUserByIdHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const detail = await getUserDetail(id);
  res.status(200).json(detail);
}

export async function adminDisableUserHandler(req: Request, res: Response): Promise<void> {
  const actorId = requireActorId(req);
  const { id } = req.params as { id: string };

  await disableUser({
    actorId,
    targetUserId: id,
    req,
  });

  res.status(200).json({ disabled: true });
}

export async function adminEnableUserHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  await enableUser({
    targetUserId: id,
    req,
  });

  res.status(200).json({ enabled: true });
}

export async function adminSendResetHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const result = await sendResetLinkByAdmin({
    targetUserId: id,
    req,
  });

  res.status(200).json(result);
}

export async function adminListDefaultCategoriesHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const rows = await listDefaultCategoryItems();
  res.status(200).json({ data: rows });
}

export async function adminCreateDefaultCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const created = await createDefaultCategoryItem({
    req,
    input: req.body,
  });

  res.status(201).json(created);
}

export async function adminUpdateDefaultCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };
  const updated = await updateDefaultCategoryItem({
    req,
    categoryId: Number(id),
    input: req.body,
  });

  res.status(200).json(updated);
}

export async function adminDeleteDefaultCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params as { id: string };

  await deleteDefaultCategoryItem({
    req,
    categoryId: Number(id),
  });

  res.status(204).send();
}

export async function adminListTipTemplatesHandler(_req: Request, res: Response): Promise<void> {
  const rows = await listTipTemplateItems();
  res.status(200).json({ data: rows });
}

export async function adminCreateTipTemplateHandler(req: Request, res: Response): Promise<void> {
  const actorId = requireActorId(req);
  const created = await createTipTemplateItem({
    req,
    actorId,
    input: req.body,
  });

  res.status(201).json(created);
}

export async function adminUpdateTipTemplateHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const updated = await updateTipTemplateItem({
    req,
    id: Number(id),
    input: req.body,
  });

  res.status(200).json(updated);
}

export async function adminDeleteTipTemplateHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await deleteTipTemplateItem({
    req,
    id: Number(id),
  });
  res.status(204).send();
}

export async function adminPreviewTipTemplateHandler(req: Request, res: Response): Promise<void> {
  const preview = previewTipTemplate(req.body);
  res.status(200).json(preview);
}

export async function adminListAnnouncementsHandler(_req: Request, res: Response): Promise<void> {
  const rows = await listAnnouncementItems();
  res.status(200).json({ data: rows });
}

export async function adminCreateAnnouncementHandler(req: Request, res: Response): Promise<void> {
  const actorId = requireActorId(req);
  const created = await createAnnouncementItem({
    req,
    actorId,
    input: req.body,
  });
  res.status(201).json(created);
}

export async function adminUpdateAnnouncementHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const updated = await updateAnnouncementItem({
    req,
    id: Number(id),
    input: req.body,
  });

  res.status(200).json(updated);
}

export async function adminDeleteAnnouncementHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  await deleteAnnouncementItem({
    req,
    id: Number(id),
  });
  res.status(204).send();
}

export async function adminPreviewAnnouncementHandler(req: Request, res: Response): Promise<void> {
  const preview = previewAnnouncement(req.body);
  res.status(200).json(preview);
}

export async function adminAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 20);

  const data = await getAuditLogs({
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
    action: typeof req.query.action === "string" ? req.query.action : undefined,
    actorId: typeof req.query.actorId === "string" ? req.query.actorId : undefined,
    page,
    pageSize,
  });

  res.status(200).json(data);
}

export async function activeAnnouncementsHandler(_req: Request, res: Response): Promise<void> {
  const rows = await getActiveAnnouncements();
  res.status(200).json({ data: rows });
}
