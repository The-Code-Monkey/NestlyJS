import fs from "fs";
import path from "path";

export interface RouteFiles {
  routeDir: string;
  pageFile: string;
  apiFile: string;
}

/**
 * Resolves the page.tsx and api.ts files for a given URL path.
 * Root path "/" resolves directly to routes folder.
 */
export function getRouteFiles(urlPath: string): RouteFiles {
  const routeDir = path.join(process.cwd(), "routes", urlPath === "/" ? "" : urlPath.slice(1));

  const pageFile = path.join(routeDir, "page.tsx");
  const apiFile = path.join(routeDir, "api.ts");

  return { routeDir, pageFile, apiFile };
}

/**
 * Determines if a GET request should be handled by page.tsx
 */
export function hasPageForGET(urlPath: string): boolean {
  const { pageFile } = getRouteFiles(urlPath);
  return fs.existsSync(pageFile);
}

/**
 * Determines if an API route exists for the given URL path and method
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
