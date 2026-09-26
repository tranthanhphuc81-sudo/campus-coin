import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  listNotificationsHandler,
  readAllNotificationsHandler,
  readNotificationHandler,
} from "./controller.js";
import { listNotificationsQuerySchema, notificationIdParamsSchema } from "./schema.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get(
  "/",
  validate({ query: listNotificationsQuerySchema }),
  listNotificationsHandler,
);
notificationsRouter.post("/read-all", readAllNotificationsHandler);
notificationsRouter.post(
  "/:id/read",
  validate({ params: notificationIdParamsSchema }),
  readNotificationHandler,
);
