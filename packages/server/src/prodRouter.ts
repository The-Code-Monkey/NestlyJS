import { compareScore, parseUrlSegments } from "./routePatterns";
import type { Manifest, ManifestRoute, PatternSegment } from "./manifest";
import type { RouteParams } from "./routeResolver";

export interface MatchedRoute {
  route: ManifestRoute;
  params: RouteParams;
  score: number[];
}

function matchPattern(
  pattern: PatternSegment[],
  segments: string[]
): { params: RouteParams; score: number[] } | null {
  const params: RouteParams = {};
  const score: number[] = [];
  let index = 0;

  for (const part of pattern) {
    if (part.kind === "static") {
      if (segments[index] !== part.value) return null;
      score.push(0);
      index++;
    } else if (part.kind === "dynamic") {
      if (index >= segments.length) return null;
      params[part.name] = segments[index];
      score.push(1);
      index++;
    } else if (part.kind === "catchAll") {
      if (index >= segments.length) return null;
      params[part.name] = segments.slice(index);
      score.push(2);
      index = segments.length;
    } else {
      params[part.name] =
        index >= segments.length ? undefined : segments.slice(index);
      score.push(3);
      index = segments.length;
    }
  }

  if (index !== segments.length) return null;
  return { params, score };
}

export function matchManifestRoute(
  manifest: Manifest,
  urlPath: string
): MatchedRoute | null {
  const segments = parseUrlSegments(urlPath);
  if (!segments) return null;

  const matches: MatchedRoute[] = [];
  for (const route of manifest.routes) {
    const matched = matchPattern(route.pattern, segments);
    if (matched) {
      matches.push({ route, params: matched.params, score: matched.score });
    }
  }

  if (matches.length === 0) return null;
  matches.sort((left, right) => compareScore(left.score, right.score));
  return matches[0];
}
