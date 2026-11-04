export type PatternSegment =
  | { kind: "static"; value: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catchAll"; name: string }
  | { kind: "optionalCatchAll"; name: string };

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
