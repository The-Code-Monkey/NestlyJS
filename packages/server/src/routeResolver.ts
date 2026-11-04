import fs from "fs";
import path from "path";
import {
  classifySegment,
  compareScore,
  parseUrlSegments,
} from "./routePatterns";

export interface RouteFiles {
  routeDir: string;
  pageFile: string;
  apiFile: string;
}

export type RouteParams = Record<string, string | string[] | undefined>;

export interface ResolvedRoute extends RouteFiles {
  params: RouteParams;
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

interface Match {
  dir: string;
  params: RouteParams;
  score: number[];
}

/**
 * Collects every route that matches the URL. Groups consume no URL segment.
 * Score marks per-segment specificity so static routes beat dynamic ones,
 * dynamic beats catch-all, and catch-all beats optional catch-all.
 */
function collectMatches(
  dir: string,
  segments: string[],
  params: RouteParams,
  score: number[],
  matches: Match[]
) {
  if (!isDirectory(dir)) return;

  if (segments.length === 0) {
    if (hasRouteFile(dir)) matches.push({ dir, params, score });

    for (const entry of childDirectories(dir)) {
      const info = classifySegment(entry.name);
      const child = path.join(dir, entry.name);

      if (info.kind === "group") {
        collectMatches(child, segments, params, score, matches);
      } else if (info.kind === "optionalCatchAll") {
        collectMatches(
          child,
          segments,
          { ...params, [info.name!]: undefined },
          [...score, 3],
          matches
        );
      }
    }
    return;
  }

  const [segment, ...rest] = segments;

  for (const entry of childDirectories(dir)) {
    const info = classifySegment(entry.name);
    const child = path.join(dir, entry.name);

    if (info.kind === "group") {
      collectMatches(child, segments, params, score, matches);
    }
  }

  const staticChild = path.join(dir, segment);
  if (
    classifySegment(segment).kind === "static" &&
    isDirectory(staticChild)
  ) {
    collectMatches(staticChild, rest, params, [...score, 0], matches);
  }

  for (const entry of childDirectories(dir)) {
    const info = classifySegment(entry.name);
    const child = path.join(dir, entry.name);

    if (info.kind === "dynamic") {
      collectMatches(
        child,
        rest,
        { ...params, [info.name!]: segment },
        [...score, 1],
        matches
      );
    } else if (info.kind === "catchAll") {
      collectMatches(
        child,
        [],
        { ...params, [info.name!]: segments },
        [...score, 2],
        matches
      );
    } else if (info.kind === "optionalCatchAll") {
      collectMatches(
        child,
        [],
        { ...params, [info.name!]: segments },
        [...score, 3],
        matches
      );
    }
  }
}

/**
 * Resolves a URL path to the closest route directory and its params.
 * Follows Next.js-style precedence: static, dynamic `[param]`, catch-all
 * `[...param]`, then optional catch-all `[[...param]]`. Route groups `(name)`
 * organize files and layouts without adding a URL segment.
 */
export function resolveRoute(urlPath: string): ResolvedRoute | null {
  const segments = parseUrlSegments(urlPath);
  if (!segments) return null;

  const matches: Match[] = [];
  collectMatches(path.join(process.cwd(), "routes"), segments, {}, [], matches);
  if (matches.length === 0) return null;

  matches.sort((left, right) => compareScore(left.score, right.score));
  const best = matches[0];

  return {
    routeDir: best.dir,
    pageFile: path.join(best.dir, "page.tsx"),
    apiFile: path.join(best.dir, "api.ts"),
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
