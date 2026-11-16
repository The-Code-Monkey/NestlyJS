import { bestMatch, type RouteParams } from "./routePatterns";
import { parseRequestPath } from "./requestPath";
import type { Manifest, ManifestRoute } from "./manifest";

export interface MatchedRoute {
  route: ManifestRoute;
  params: RouteParams;
  score: number[];
}

/**
 * Manifest adapter: supplies patterns to the Route Pattern module and ranks
 * the matches the same way the filesystem resolver does.
 */
export function matchManifestRoute(
  manifest: Manifest,
  urlPath: string
): MatchedRoute | null {
  const segments = parseRequestPath(urlPath)?.segments;
  if (!segments) return null;
  return matchManifestSegments(manifest, segments);
}

export function matchManifestSegments(
  manifest: Manifest,
  segments: string[]
): MatchedRoute | null {
  const best = bestMatch(
    manifest.routes.map((route) => ({ route, pattern: route.pattern })),
    segments
  );
  if (!best) return null;

  return { route: best.route, params: best.params, score: best.score };
}
