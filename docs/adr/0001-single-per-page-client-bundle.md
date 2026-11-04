# Single per-page client bundle

Each page sends one JavaScript bundle containing all of its client components, with React and other shared dependencies included once. Bundling each client component separately duplicated React per component and caused hydration mismatches from multiple React instances. The alternative, externalizing React through an import map or a shared vendor script, adds delivery machinery the development-only version does not need. Consequence: any client component change invalidates the whole page bundle, and pages have no per-component code splitting.
