import { Router } from "express";
import multer from "multer";
import type { Request, Response, NextFunction } from "express";

import { payloadTooLarge, unsupportedMediaType } from "../../lib/problem.js";
import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  commitImportHandler,
  deleteImportBatchHandler,
  downloadImportErrorReportHandler,
  getImportBatchHandler,
  getImportTemplateHandler,
  patchImportRowsHandler,
  uploadImportHandler,
} from "./controller.js";
import { importBatchIdParamsSchema, importRowsPatchBodySchema } from "./schema.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const filename = file.originalname.toLowerCase();
    const allowedMimeTypes = new Set(["text/csv", "text/plain", "application/vnd.ms-excel"]);

    if (!filename.endsWith(".csv")) {
      callback(unsupportedMediaType("Only .csv files are supported."));
      return;
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(unsupportedMediaType("Only CSV files are supported."));
      return;
    }

    callback(null, true);
  },
});

function uploadCsvMiddleware(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(payloadTooLarge("CSV file size must be 2 MB or smaller."));
      return;
    }

    next(error);
  });
}

export const importsRouter = Router();

importsRouter.use(requireAuth);
importsRouter.get("/template", getImportTemplateHandler);
importsRouter.post("/", uploadCsvMiddleware, uploadImportHandler);
importsRouter.get("/:id", validate({ params: importBatchIdParamsSchema }), getImportBatchHandler);
importsRouter.patch(
  "/:id/rows",
  validate({ params: importBatchIdParamsSchema, body: importRowsPatchBodySchema }),
  patchImportRowsHandler,
);
importsRouter.post(
  "/:id/commit",
  validate({ params: importBatchIdParamsSchema }),
  commitImportHandler,
);
importsRouter.get(
  "/:id/error-report",
  validate({ params: importBatchIdParamsSchema }),
  downloadImportErrorReportHandler,
);
importsRouter.delete(
  "/:id",
  validate({ params: importBatchIdParamsSchema }),
  deleteImportBatchHandler,
);
