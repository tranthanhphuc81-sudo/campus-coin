import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createBookmarkHandler,
  deleteBookmarkHandler,
  listBookmarksHandler,
  patchBookmarkHandler,
} from "./controller.js";
import {
  createBookmarkBodySchema,
  deleteBookmarkBodySchema,
  listBookmarksQuerySchema,
  updateBookmarkBodySchema,
} from "./schema.js";

export const bookmarksRouter = Router();

bookmarksRouter.use(requireAuth);
bookmarksRouter.get("/", validate({ query: listBookmarksQuerySchema }), listBookmarksHandler);
bookmarksRouter.post("/", validate({ body: createBookmarkBodySchema }), createBookmarkHandler);
bookmarksRouter.patch("/", validate({ body: updateBookmarkBodySchema }), patchBookmarkHandler);
bookmarksRouter.delete("/", validate({ body: deleteBookmarkBodySchema }), deleteBookmarkHandler);
