import fs from "fs";
import path from "path";
import {
  bestMatch,
  parseUrlSegments,
  toPatternSegment,
  type PatternSegment,
  type RouteParams,
} from "./routePatterns";

export interface RouteFiles {
  routeDir: string;
  pageFile: string;
  apiFile: string;
}

export interface ResolvedRoute extends RouteFiles {
  params: RouteParams;
}

interface RouteCandidate {
  routeDir: string;
  pattern: PatternSegment[];
}

function isDirectory(filePath: string) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function hasRouteFile(dir: string) {
  return (
    fs.existsSync(path.join(dir, "page.tsx")) ||
    fs.existsSync(path.join(dir, "api.ts"))
  );
}

function childDirectories(dir: string) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Filesystem adapter: collects route directories with their patterns in
 * directory-name order, then delegates matching and ranking to the Route
 * Pattern module.
 */
function collectCandidates(
  dir: string,
  pattern: PatternSegment[],
  candidates: RouteCandidate[]
) {
  if (!isDirectory(dir)) return;
  if (hasRouteFile(dir)) candidates.push({ routeDir: dir, pattern });

  for (const entry of childDirectories(dir)) {
    const segment = toPatternSegment(entry.name);
    collectCandidates(
      path.join(dir, entry.name),
      segment ? [...pattern, segment] : pattern,
      candidates
    );
  }
}

/**
 * Resolves a URL path to the closest route directory and its params.
 * Precedence comes from the Route Pattern module, so dev and production
 * rank segment kinds the same way.
 */
export function resolveRoute(urlPath: string): ResolvedRoute | null {
  const segments = parseUrlSegments(urlPath);
  if (!segments) return null;

  const candidates: RouteCandidate[] = [];
  collectCandidates(path.join(process.cwd(), "routes"), [], candidates);

  const best = bestMatch(candidates, segments);
  if (!best) return null;

  return {
    routeDir: best.routeDir,
    pageFile: path.join(best.routeDir, "page.tsx"),
    apiFile: path.join(best.routeDir, "api.ts"),
    params: best.params,
  };
}

/**
 * Determines if a GET request should be handled by page.tsx
 */
export function hasPageForGET(urlPath: string): boolean {
  const route = resolveRoute(urlPath);
  return !!route && fs.existsSync(route.pageFile);
}

export interface APIRoute {
  handler: Function;
  route: ResolvedRoute;
}

/**
 * Resolves the API handler and params for a method and URL.
 */
export function getAPIRoute(
  urlPath: string,
  method: string
): APIRoute | null {
  const route = resolveRoute(urlPath);
  if (!route || !fs.existsSync(route.apiFile)) return null;

  // GET requests prefer page.tsx if it exists
  if (method.toUpperCase() === "GET" && fs.existsSync(route.pageFile)) {
    return null;
  }

  const apiModule = require(route.apiFile);
  const handler = apiModule[method.toUpperCase()];
  return typeof handler === "function" ? { handler, route } : null;
}

/**
 * Returns the API method handler for a method and URL.
 */
export function getAPIMethod(urlPath: string, method: string): Function | null {
  return getAPIRoute(urlPath, method)?.handler ?? null;
}
