import type { PatternSegment } from "./routePatterns";

export type { PatternSegment };

export interface PageAssets {
  entry: string;
  script?: string;
  style?: string;
}

export interface ApiAssets {
  entry: string;
}

export interface ManifestRoute {
  pattern: PatternSegment[];
  page?: PageAssets;
  api?: ApiAssets;
}

export interface Manifest {
  routes: ManifestRoute[];
}
