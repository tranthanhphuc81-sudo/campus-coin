/**
 * routeIntrospection.ts
 * Monkey-patches the `router` package that Express 5 re-exports as `Router`
 * (`Router.prototype.use`/`.route`) so every route/mount registration is recorded as it happens,
 * then walks the resulting tree from a live `Express` app to produce a flat `{ method, path }`
 * list of every registered route with its FULL mounted path resolved (mount prefixes joined).
 * Express 5's new path-to-regexp-based `Layer` no longer keeps the raw path string around after
 * construction (only a compiled matcher closure), so reconstructing full paths after the fact by
 * inspecting the router tree is not possible — recording the raw string arguments as they are
 * passed to `.use()`/`.route()` is the reliable way to do this dynamically.
 * `patchRouterIntrospection()` MUST run before `../../src/app.js` (or anything importing it, since
 * every `*.routes.ts` module calls `.get()`/`.post()`/etc. at import time) is first imported in the
 * same module graph — see cross-tenant-sweep.test.ts for the required import order. Vitest isolates
 * each test file's module registry by default, so this only ever patches within one test file.
 * Main exports: patchRouterIntrospection, discoverRoutes, DiscoveredRoute
 * Spec: docs/spec/12 (testing plan) — P18 dynamic cross-tenant sweep
 */
import { Router } from 'express';
import type { Express } from 'express';

/** Loosened shape covering both a `Router()` instance and Express 5's internal `Route` object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRouter = any;

/** One `{path}` -> `Route` registration recorded from a patched `Router.prototype.route` call. */
interface RouteRecord {
  path: string;
  route: { methods: Record<string, boolean> };
}

/** One `{path, handler}` mount recorded from a patched `Router.prototype.use` call. */
interface UseRecord {
  path: string;
  handler: unknown;
}

/** Router instance -> every `.route(path)` call made directly on it. */
const routeRegistry = new WeakMap<object, RouteRecord[]>();
/** Router instance -> every `.use(path, handler)` call made directly on it. */
const useRegistry = new WeakMap<object, UseRecord[]>();

let patched = false;

/**
 * Patches `Router.prototype.use`/`.route` (idempotent) to record every future registration.
 * Behaviour is unchanged — the originals are still called with the same arguments/`this`/return
 * value; only bookkeeping is added. Call this before importing `src/app.ts`.
 */
export function patchRouterIntrospection(): void {
  if (patched) return;
  patched = true;

  const proto = Router.prototype as AnyRouter;
  const originalUse = proto.use as (...args: unknown[]) => unknown;
  const originalRoute = proto.route as (path: string) => AnyRouter;

  proto.use = function patchedUse(this: AnyRouter, ...args: unknown[]): unknown {
    const [maybePath, ...rest] = args;
    const hasExplicitPath = typeof maybePath === 'string';
    const path = hasExplicitPath ? (maybePath as string) : '/';
    const handlers = (hasExplicitPath ? rest : args).flat(Infinity as 20);
    const list = useRegistry.get(this) ?? [];
    for (const handler of handlers) list.push({ path, handler });
    useRegistry.set(this, list);
    return originalUse.apply(this, args);
  };

  proto.route = function patchedRoute(this: AnyRouter, path: string): AnyRouter {
    const route = originalRoute.call(this, path);
    const list = routeRegistry.get(this) ?? [];
    list.push({ path, route });
    routeRegistry.set(this, list);
    return route;
  };
}

/** True when `fn` looks like a `Router()` instance (has its own `.stack`/`.use`/`.route`). */
function isRouterInstance(fn: unknown): fn is AnyRouter {
  return (
    typeof fn === 'function' &&
    Array.isArray((fn as AnyRouter).stack) &&
    typeof (fn as AnyRouter).route === 'function' &&
    typeof (fn as AnyRouter).use === 'function'
  );
}

/** Joins a mount prefix and a route's own path the way Express would (no double/missing slashes). */
function joinPaths(prefix: string, path: string): string {
  if (path === '/' || path === '') return prefix === '' ? '/' : prefix;
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanPrefix}${cleanPath}`;
}

/** One discovered route: lower-case HTTP method + its full mounted path (e.g. `/api/v1/transactions/:id`). */
export interface DiscoveredRoute {
  method: string;
  path: string;
}

/** Recursively walks `router`'s recorded `.route()`/`.use()` calls, resolving full paths. */
function collect(router: AnyRouter, prefix: string, out: DiscoveredRoute[], seen: Set<AnyRouter>): void {
  if (seen.has(router)) return; // guards against a (currently nonexistent) mount cycle
  seen.add(router);

  for (const { path, route } of routeRegistry.get(router) ?? []) {
    const full = joinPaths(prefix, path);
    for (const method of Object.keys(route.methods)) {
      if (method === '_all') continue; // `.all()` is not used anywhere in this codebase
      out.push({ method, path: full });
    }
  }

  for (const { path, handler } of useRegistry.get(router) ?? []) {
    if (isRouterInstance(handler)) collect(handler, joinPaths(prefix, path), out, seen);
  }
}

/**
 * Walks the live `app`'s router tree (built by {@link patchRouterIntrospection}) and returns every
 * registered `{method, path}` pair with its full mounted path resolved.
 * @throws {Error} if `app` has no router yet (no route was ever registered on it).
 */
export function discoverRoutes(app: Express): DiscoveredRoute[] {
  const root = (app as AnyRouter).router ?? (app as AnyRouter)._router;
  if (!root) throw new Error('Express app has no router — was createApp() called?');
  const out: DiscoveredRoute[] = [];
  collect(root, '', out, new Set());
  return out;
}
