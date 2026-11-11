import { parseUrlSegments, type RouteParams } from "./routePatterns";
import { cleanUrlPath, isStaticAssetPath } from "./staticAssets";

export const CLIENT_ASSET_PREFIX = "/_nestly/client/";

export interface RouteResolution<T> {
  route: T;
  params: RouteParams;
  hasPage: boolean;
  hasApi: boolean;
}

export type RouteLookup<T> = (path: string) => RouteResolution<T> | null;

interface BaseDecision {
  url: string;
  path: string;
  method: string;
}

export type RequestDecision<T> =
  | (BaseDecision & { kind: "clientAsset"; assetPath: string })
  | (BaseDecision & { kind: "staticAsset" })
  | (BaseDecision & { kind: "page"; route: T; params: RouteParams })
  | (BaseDecision & { kind: "api"; route: T; params: RouteParams })
  | (BaseDecision & { kind: "notFound" });

/**
 * Turns a URL and method into one dispatch decision. Route precedence comes
 * from the adapter's Route Pattern lookup; this module adds path policy and
 * chooses between client asset, static asset, Page, API route, and not found.
 */
export function decideRequest<T>(
  url: string,
  method: string,
  lookup: RouteLookup<T>
): RequestDecision<T> {
  const path = cleanUrlPath(url);
  const upperMethod = method.toUpperCase();
  const base = { url, path, method: upperMethod };

  if (!parseUrlSegments(path)) {
    return { ...base, kind: "notFound" };
  }

  if (path.startsWith(CLIENT_ASSET_PREFIX)) {
    if (upperMethod === "GET" || upperMethod === "HEAD") {
      return {
        ...base,
        kind: "clientAsset",
        assetPath: path.slice(CLIENT_ASSET_PREFIX.length),
      };
    }
    return { ...base, kind: "notFound" };
  }

  if (isStaticAssetPath(path)) {
    if (upperMethod === "GET" || upperMethod === "HEAD") {
      return { ...base, kind: "staticAsset" };
    }
    return { ...base, kind: "notFound" };
  }

  const match = lookup(path);
  if (match) {
    if (upperMethod === "GET" && match.hasPage) {
      return {
        ...base,
        kind: "page",
        params: match.params,
        route: match.route,
      };
    }
    if (match.hasApi) {
      return {
        ...base,
        kind: "api",
        params: match.params,
        route: match.route,
      };
    }
  }

  return { ...base, kind: "notFound" };
}

export function notFoundResponse(method: string) {
  return {
    status: 404,
    body:
      method.toUpperCase() === "GET"
        ? "Page not found"
        : "API route not found",
  };
}
