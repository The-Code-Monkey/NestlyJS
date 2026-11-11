import {
  bestMatch,
  parseUrlSegments,
  type RouteParams,
} from "./routePatterns";
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
  const segments = parseUrlSegments(urlPath);
  if (!segments) return null;

  const best = bestMatch(
    manifest.routes.map((route) => ({ route, pattern: route.pattern })),
    segments
  );
  if (!best) return null;

  return { route: best.route, params: best.params, score: best.score };
}
