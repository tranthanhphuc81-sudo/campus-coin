import { Router } from "express";

import { requireAuth, requireRole } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  activeAnnouncementsHandler,
  adminAuditLogsHandler,
  adminCategoriesUsageHandler,
  adminCreateAnnouncementHandler,
  adminCreateDefaultCategoryHandler,
  adminCreateTipTemplateHandler,
  adminDeleteAnnouncementHandler,
  adminDeleteDefaultCategoryHandler,
  adminDeleteTipTemplateHandler,
  adminDisableUserHandler,
  adminEnableUserHandler,
  adminListAnnouncementsHandler,
  adminListDefaultCategoriesHandler,
  adminListTipTemplatesHandler,
  adminOverviewStatsHandler,
  adminPreviewAnnouncementHandler,
  adminPreviewTipTemplateHandler,
  adminSendResetHandler,
  adminUpdateAnnouncementHandler,
  adminUpdateDefaultCategoryHandler,
  adminUpdateTipTemplateHandler,
  adminUserByIdHandler,
  adminUsersHandler,
} from "./controller.js";
import {
  adminAnnouncementBodySchema,
  adminAnnouncementIdParamsSchema,
  adminAnnouncementPreviewBodySchema,
  adminAnnouncementUpdateBodySchema,
  adminAuditLogsQuerySchema,
  adminCategoryIdParamsSchema,
  adminDefaultCategoryBodySchema,
  adminDefaultCategoryUpdateBodySchema,
  adminTipTemplateBodySchema,
  adminTipTemplatePreviewBodySchema,
  adminTipTemplateUpdateBodySchema,
  adminUserIdParamsSchema,
  adminUsersQuerySchema,
} from "./schema.js";

export const adminRouter = Router();
export const announcementsRouter = Router();

announcementsRouter.get("/active", requireAuth, activeAnnouncementsHandler);

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/stats/overview", adminOverviewStatsHandler);
adminRouter.get("/stats/categories-usage", adminCategoriesUsageHandler);

adminRouter.get("/users", validate({ query: adminUsersQuerySchema }), adminUsersHandler);
adminRouter.get("/users/:id", validate({ params: adminUserIdParamsSchema }), adminUserByIdHandler);
adminRouter.post(
  "/users/:id/disable",
  validate({ params: adminUserIdParamsSchema }),
  adminDisableUserHandler,
);
adminRouter.post(
  "/users/:id/enable",
  validate({ params: adminUserIdParamsSchema }),
  adminEnableUserHandler,
);
adminRouter.post(
  "/users/:id/send-reset",
  validate({ params: adminUserIdParamsSchema }),
  adminSendResetHandler,
);

adminRouter.get("/categories", adminListDefaultCategoriesHandler);
adminRouter.post(
  "/categories",
  validate({ body: adminDefaultCategoryBodySchema }),
  adminCreateDefaultCategoryHandler,
);
adminRouter.patch(
  "/categories/:id",
  validate({ params: adminCategoryIdParamsSchema, body: adminDefaultCategoryUpdateBodySchema }),
  adminUpdateDefaultCategoryHandler,
);
adminRouter.delete(
  "/categories/:id",
  validate({ params: adminCategoryIdParamsSchema }),
  adminDeleteDefaultCategoryHandler,
);

adminRouter.get("/tip-templates", adminListTipTemplatesHandler);
adminRouter.post(
  "/tip-templates",
  validate({ body: adminTipTemplateBodySchema }),
  adminCreateTipTemplateHandler,
);
adminRouter.post(
  "/tip-templates/preview",
  validate({ body: adminTipTemplatePreviewBodySchema }),
  adminPreviewTipTemplateHandler,
);
adminRouter.patch(
  "/tip-templates/:id",
  validate({ params: adminCategoryIdParamsSchema, body: adminTipTemplateUpdateBodySchema }),
  adminUpdateTipTemplateHandler,
);
adminRouter.delete(
  "/tip-templates/:id",
  validate({ params: adminCategoryIdParamsSchema }),
  adminDeleteTipTemplateHandler,
);

adminRouter.get("/announcements", adminListAnnouncementsHandler);
adminRouter.post(
  "/announcements",
  validate({ body: adminAnnouncementBodySchema }),
  adminCreateAnnouncementHandler,
);
adminRouter.post(
  "/announcements/preview",
  validate({ body: adminAnnouncementPreviewBodySchema }),
  adminPreviewAnnouncementHandler,
);
adminRouter.patch(
  "/announcements/:id",
  validate({ params: adminAnnouncementIdParamsSchema, body: adminAnnouncementUpdateBodySchema }),
  adminUpdateAnnouncementHandler,
);
adminRouter.delete(
  "/announcements/:id",
  validate({ params: adminAnnouncementIdParamsSchema }),
  adminDeleteAnnouncementHandler,
);

adminRouter.get(
  "/audit-logs",
  validate({ query: adminAuditLogsQuerySchema }),
  adminAuditLogsHandler,
);
