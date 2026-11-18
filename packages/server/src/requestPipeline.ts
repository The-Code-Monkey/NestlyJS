import type { RouteParams } from "./routePatterns";
import {
  parseRequestPath,
  type ParsedRequestPath,
} from "./requestPath";

export interface RouteResolution<T> {
  route: T;
  params: RouteParams;
  hasPage: boolean;
  hasApi: boolean;
}

export type RouteLookup<T> = (
  request: ParsedRequestPath
) => RouteResolution<T> | null;

interface BaseDecision {
  url: string;
  path: string;
  segments: string[];
  method: string;
}

export type RequestDecision<T> =
  | (BaseDecision & {
      kind: "clientAsset";
      assetSegments: string[];
    })
  | (BaseDecision & { kind: "staticAsset" })
  | (BaseDecision & { kind: "page"; route: T; params: RouteParams })
  | (BaseDecision & { kind: "api"; route: T; params: RouteParams })
  | (BaseDecision & { kind: "notFound" });

/**
 * Turns a URL and method into one dispatch decision. URL path policy comes from
 * the request path module, and route precedence comes from the adapter's Route
 * Pattern lookup. Executors consume the decision without resolving again.
 */
export function decideRequest<T>(
  url: string,
  method: string,
  lookup: RouteLookup<T>
): RequestDecision<T> {
  const request = parseRequestPath(url);
  const upperMethod = method.toUpperCase();

  if (!request) {
    return {
      url,
      path: "/",
      segments: [],
      method: upperMethod,
      kind: "notFound",
    };
  }

  const base = {
    url,
    path: request.path,
    segments: request.segments,
    method: upperMethod,
  };

  if (request.clientAssetSegments) {
    if (upperMethod === "GET" || upperMethod === "HEAD") {
      return {
        ...base,
        kind: "clientAsset",
        assetSegments: request.clientAssetSegments,
      };
    }
    return { ...base, kind: "notFound" };
  }

  if (request.isStaticAsset) {
    if (upperMethod === "GET" || upperMethod === "HEAD") {
      return { ...base, kind: "staticAsset" };
    }
    return { ...base, kind: "notFound" };
  }

  const match = lookup(request);
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

export type NotFoundKind = "route" | "asset";

export function notFoundResponse(
  method: string,
  kind: NotFoundKind = "route"
) {
  return {
    status: 404,
    body:
      kind === "asset"
        ? "Not found"
        : method.toUpperCase() === "GET"
          ? "Page not found"
          : "API route not found",
  };
}
