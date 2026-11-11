export type SegmentKind =
  | "static"
  | "dynamic"
  | "catchAll"
  | "optionalCatchAll"
  | "group";

export type PatternSegment =
  | { kind: "static"; value: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catchAll"; name: string }
  | { kind: "optionalCatchAll"; name: string };

export type RouteParams = Record<string, string | string[] | undefined>;

const SPECIFICITY: Record<PatternSegment["kind"], number> = {
  static: 0,
  dynamic: 1,
  catchAll: 2,
  optionalCatchAll: 3,
};

function specificityOf(kind: PatternSegment["kind"]) {
  return SPECIFICITY[kind];
}

export interface SegmentInfo {
  kind: SegmentKind;
  name?: string;
}

const DYNAMIC_SEGMENT = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/;
const CATCH_ALL_SEGMENT = /^\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]$/;
const OPTIONAL_CATCH_ALL_SEGMENT =
  /^\[\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]\]$/;
const GROUP_SEGMENT = /^\((.+)\)$/;

export function classifySegment(name: string): SegmentInfo {
  const optional = name.match(OPTIONAL_CATCH_ALL_SEGMENT);
  if (optional) return { kind: "optionalCatchAll", name: optional[1] };

  const catchAll = name.match(CATCH_ALL_SEGMENT);
  if (catchAll) return { kind: "catchAll", name: catchAll[1] };

  const dynamic = name.match(DYNAMIC_SEGMENT);
  if (dynamic) return { kind: "dynamic", name: dynamic[1] };

  if (GROUP_SEGMENT.test(name)) return { kind: "group" };

  return { kind: "static" };
}

export function toPatternSegment(name: string): PatternSegment | null {
  const info = classifySegment(name);
  if (info.kind === "group") return null;
  if (info.kind === "static") return { kind: "static", value: name };
  return { kind: info.kind, name: info.name! };
}

/**
 * Matches decoded URL segments against a route pattern, capturing params and
 * per-segment specificity.
 */
export function matchPattern(
  pattern: PatternSegment[],
  segments: string[]
): { params: RouteParams; score: number[] } | null {
  const params: RouteParams = {};
  const score: number[] = [];
  let index = 0;

  for (const part of pattern) {
    score.push(specificityOf(part.kind));

    if (part.kind === "static") {
      if (segments[index] !== part.value) return null;
      index++;
    } else if (part.kind === "dynamic") {
      if (index >= segments.length) return null;
      params[part.name] = segments[index];
      index++;
    } else if (part.kind === "catchAll") {
      if (index >= segments.length) return null;
      params[part.name] = segments.slice(index);
      index = segments.length;
    } else {
      params[part.name] =
        index >= segments.length ? undefined : segments.slice(index);
      index = segments.length;
    }
  }

  if (index !== segments.length) return null;
  return { params, score };
}

export function compareScore(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

export function patternKey(pattern: PatternSegment[]) {
  return pattern
    .map((part) =>
      part.kind === "static"
        ? `static:${part.value}`
        : `${part.kind}:${part.name}`
    )
    .join("/");
}

export function rankMatches<
  T extends { score: number[]; pattern: PatternSegment[] }
>(matches: T[]): T[] {
  return [...matches].sort(
    (left, right) =>
      compareScore(left.score, right.score) ||
      patternKey(left.pattern).localeCompare(patternKey(right.pattern))
  );
}

export function bestMatch<T extends { pattern: PatternSegment[] }>(
  candidates: T[],
  segments: string[]
): (T & { params: RouteParams; score: number[] }) | null {
  const matches = candidates.flatMap((candidate) => {
    const matched = matchPattern(candidate.pattern, segments);
    return matched ? [{ ...candidate, ...matched }] : [];
  });
  return rankMatches(matches)[0] ?? null;
}

export function parseUrlSegments(urlPath: string): string[] | null {
  const cleanPath = urlPath.split(/[?#]/)[0] || "/";

  let segments: string[];
  try {
    segments = cleanPath
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\")
    )
  ) {
    return null;
  }

  return segments;
}
