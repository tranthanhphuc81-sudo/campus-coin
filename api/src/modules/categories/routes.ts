import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  createCategoryHandler,
  deleteCategoryHandler,
  listCategoriesHandler,
  patchCategoryHandler,
} from "./controller.js";
import {
  categoryIdParamsSchema,
  createCategoryBodySchema,
  deleteCategoryQuerySchema,
  listCategoriesQuerySchema,
  updateCategoryBodySchema,
} from "./schema.js";

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);
categoriesRouter.get("/", validate({ query: listCategoriesQuerySchema }), listCategoriesHandler);
categoriesRouter.post("/", validate({ body: createCategoryBodySchema }), createCategoryHandler);
categoriesRouter.patch(
  "/:id",
  validate({ params: categoryIdParamsSchema, body: updateCategoryBodySchema }),
  patchCategoryHandler,
);
categoriesRouter.delete(
  "/:id",
  validate({ params: categoryIdParamsSchema, query: deleteCategoryQuerySchema }),
  deleteCategoryHandler,
);
