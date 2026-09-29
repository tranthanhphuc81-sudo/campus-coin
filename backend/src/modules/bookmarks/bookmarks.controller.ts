/**
 * bookmarks.controller.ts
 * HTTP <-> DTO glue for `/api/v1/bookmarks`. Reads parsed input from `req.validated` and the
 * caller's identity from `req.auth`. All business logic lives in `bookmarks.service.ts`.
 * Main exports: listBookmarks, createBookmark, updateBookmark, deleteBookmark
 * Spec: docs/spec/05c §5.12
 */
import type { RequestHandler } from 'express';
import type { BookmarkIdParamInput, CreateBookmarkInput, ListBookmarksQuery, UpdateBookmarkInput } from '@campuscoin/shared';
import * as bookmarksService from './bookmarks.service.js';

/** `GET /bookmarks?type=&q=&page=&limit=` — the caller's own bookmarks, newest first. */
export const listBookmarks: RequestHandler = async (req, res) => {
  const query = req.validated?.query as ListBookmarksQuery;
  const result = await bookmarksService.list(req.auth!.userId, query);
  res.status(200).json(result);
};

/** `POST /bookmarks` — bookmarks a tip, insight or report view. */
export const createBookmark: RequestHandler = async (req, res) => {
  const body = req.validated?.body as CreateBookmarkInput;
  const dto = await bookmarksService.create(req.auth!.userId, body);
  res.status(201).json(dto);
};

/** `PATCH /bookmarks/:id` — edits a bookmark's note. */
export const updateBookmark: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BookmarkIdParamInput;
  const body = req.validated?.body as UpdateBookmarkInput;
  const dto = await bookmarksService.update(req.auth!.userId, params.id, body);
  res.status(200).json(dto);
};

/** `DELETE /bookmarks/:id` — removes one of the caller's own bookmarks. */
export const deleteBookmark: RequestHandler = async (req, res) => {
  const params = req.validated?.params as BookmarkIdParamInput;
  await bookmarksService.remove(req.auth!.userId, params.id);
  res.status(204).end();
};
