import fs from "fs";
import path from "path";

export interface RouteFiles {
  routeDir: string;
  pageFile: string;
  apiFile: string;
}

/**
 * Return the filesystem locations for the route directory, its page component, and its API module for a given URL path.
 *
 * The `urlPath` is expected to be an absolute URL path (leading `/`). A root path (`"/"`) maps to the `routes` folder itself;
 * other paths map to `routes/<path-without-leading-slash>`.
 *
 * @param urlPath - The request URL path (e.g., `/`, `/users`, `/posts/123`)
 * @returns An object with:
 *  - `routeDir`: the computed route directory on disk,
 *  - `pageFile`: the resolved path to `page.tsx` inside that directory,
 *  - `apiFile`: the resolved path to `api.ts` inside that directory.
 */
export function getRouteFiles(urlPath: string): RouteFiles {
  const routeDir = path.join(process.cwd(), "routes", urlPath === "/" ? "" : urlPath.slice(1));

  const pageFile = path.join(routeDir, "page.tsx");
  const apiFile = path.join(routeDir, "api.ts");

  return { routeDir, pageFile, apiFile };
}

/**
 * Returns whether a GET request for the given URL path should be handled by a route's `page.tsx`.
 *
 * This checks the filesystem for a `page.tsx` file under the route directory derived from `urlPath`
 * (where `"/"` maps to the `routes` root). If `page.tsx` exists, GET requests should be handled by it.
 *
 * @param urlPath - The request URL path (e.g., `/`, `/users`, `/posts/123`)
 * @returns `true` if a `page.tsx` exists for the route and therefore GET should be handled by the page; otherwise `false`
 */
export function hasPageForGET(urlPath: string): boolean {
  const { pageFile } = getRouteFiles(urlPath);
  return fs.existsSync(pageFile);
}

/**
 * Returns the API handler function for a given URL path and HTTP method, or `null` if none applies.
 *
 * This checks for a route's `api.ts` file and, unless the request is a GET with an existing `page.tsx`
 * (which takes precedence), returns the exported function matching the uppercased HTTP method
 * (e.g., `GET`, `POST`) from the `api.ts` module.
 *
 * @param urlPath - The request URL path (e.g., "/", "/users")
 * @param method - The HTTP method name (case-insensitive; will be uppercased)
 * @returns The handler function exported from the route's `api.ts` for the given method, or `null` if not found.
 * @throws If requiring the route's `api.ts` module fails, the underlying require error will propagate.
 */
export function getAPIMethod(urlPath: string, method: string): Function | null {
  const { pageFile, apiFile } = getRouteFiles(urlPath);

  if (!fs.existsSync(apiFile)) return null;

  // GET requests prefer page.tsx if it exists
  if (method.toUpperCase() === "GET" && fs.existsSync(pageFile)) return null;

  const apiModule = require(apiFile);
  return typeof apiModule[method.toUpperCase()] === "function"
    ? apiModule[method.toUpperCase()]
    : null;
}
