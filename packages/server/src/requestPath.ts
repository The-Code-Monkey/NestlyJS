export const CLIENT_ASSET_PREFIX = "/_nestly/client/";

export interface ParsedRequestPath {
  path: string;
  segments: string[];
  isStaticAsset: boolean;
  clientAssetSegments?: string[];
}

export function cleanUrlPath(urlPath: string) {
  return urlPath.split(/[?#]/)[0] || "/";
}

function hasFileExtension(segment: string | undefined) {
  return !!segment && /\.[A-Za-z0-9]+$/.test(segment);
}

/**
 * Owns URL path policy for dispatch: strip query and fragment, decode segments
 * once, reject traversal and malformed encodings, and classify client assets
 * and static-looking paths.
 */
export function parseRequestPath(urlPath: string): ParsedRequestPath | null {
  const path = cleanUrlPath(urlPath);

  let segments: string[];
  try {
    segments = path
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

  const isClientAsset = path.startsWith(CLIENT_ASSET_PREFIX);

  return {
    path,
    segments,
    isStaticAsset:
      !isClientAsset && hasFileExtension(segments[segments.length - 1]),
    ...(isClientAsset ? { clientAssetSegments: segments.slice(2) } : {}),
  };
}

export function isStaticAssetPath(urlPath: string) {
  return parseRequestPath(urlPath)?.isStaticAsset ?? false;
}
