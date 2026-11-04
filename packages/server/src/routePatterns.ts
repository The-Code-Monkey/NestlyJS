export type SegmentKind =
  | "static"
  | "dynamic"
  | "catchAll"
  | "optionalCatchAll"
  | "group";

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

export function compareScore(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
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
