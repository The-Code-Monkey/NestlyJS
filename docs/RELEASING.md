# Releasing

`@nestlyjs/server` publishes to npm over OIDC trusted publishing from GitHub Actions. No npm token is stored in this repository, and the package is configured to reject token publishing.

## How a release runs

1. A pull request that changes `packages/server` includes a changeset. (Repository docs and CI-only changes do not need one.)
2. Merging it runs `.github/workflows/release.yml`: tests, builds, checks the package contents, then opens or updates the `chore: release packages` pull request carrying the version bump and changelog.
3. Merging that version pull request runs `.github/workflows/publish.yml`. The tree now has no pending changesets and is not in prerelease mode, so the workflow publishes over OIDC, pushes the git tag, and creates the GitHub release.

`publish.yml` publishes only when `.changeset/` holds no pending changesets and `.changeset/pre.json` is absent. That is deliberate: CI publishes only versions produced by `changeset version`, and it never publishes a prerelease.

## Setup that must stay true

- npm package settings, Trusted publishing: GitHub Actions, repository `The-Code-Monkey/NestlyJS`, workflow filename `publish.yml`, allow `npm publish`.
- npm package settings, Publishing access: "Require two-factor authentication and disallow tokens".
- Repository settings, Actions: "Allow GitHub Actions to create and approve pull requests". Without it the version workflow cannot open its pull request.
- The publishing workflow must stay named `publish.yml`. npm matches the filename exactly, and a new trusted-publisher configuration must complete a successful publish within two days or it expires.
- No `NPM_TOKEN` or `NODE_AUTH_TOKEN`. Do not add one; the workflow authenticates with `id-token: write`.

## Prereleases

Prereleases are published by hand, because trusted publishing cannot publish them automatically and npm's prerelease rules would put a first-ever version on `latest`.

```sh
pnpm exec changeset pre enter next
pnpm exec changeset version            # 0.2.0 -> 0.2.0-next.0
pnpm --filter @nestlyjs/server build
cd packages/server && npm publish --tag next   # 2FA prompt
```

Publish the tarball before merging the version commit, so the post-merge `publish.yml` run finds the version on the registry and does nothing. Do not use `changeset publish` for this step: in prerelease mode it publishes a first release under `latest` rather than `next`.

To return to stable releases:

```sh
pnpm exec changeset pre exit
pnpm exec changeset version            # 0.2.0-next.0 -> 0.2.0
```

then merge. CI publishes the stable version.

## If a release fails

- `ENEEDAUTH`: the trusted publisher is missing, the workflow filename does not match the npm setting, or `id-token: write` was removed.
- No version pull request: the repository setting above is off.
- Nothing publishes: confirm `.changeset/` has no pending changesets and `.changeset/pre.json` does not exist.
- Wrong version published: versions cannot be reused. Fix forward with a patch release; unpublishing requires npm support.
