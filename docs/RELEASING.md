# Releasing

`@nestlyjs/server` publishes to npm over OIDC trusted publishing. There is no npm token in this repository, and the package rejects token publishing. Publishing is the most dangerous thing this repository does, so it is confined to one workflow, one branch, and one repository.

## The two workflows

| Workflow | Trigger | Permissions | Can publish |
| --- | --- | --- | --- |
| `.github/workflows/release.yml` | `push` to `main` | `contents: write`, `pull-requests: write` | No: no OIDC, no token, no publish step |
| `.github/workflows/publish.yml` | `push` to `main` | `contents: write`, `id-token: write` | Yes, and only `publish.yml` can |

```
PR with a changeset ──merge──▶ release.yml ──▶ version PR (version + CHANGELOG)
                                                   │
                                                 merge
                                                   ▼
                                            publish.yml ──OIDC──▶ npm
                                                   │
                                                   ├──▶ git tag
                                                   └──▶ GitHub release
```

`release.yml` runs `changeset version`, which consumes changesets, bumps `packages/server/package.json`, and opens or updates the `chore: release packages` pull request. It never contacts npm.

`publish.yml` runs `changeset publish`, pushes the git tag, and creates the GitHub release. npm authenticates the workflow with a short-lived OIDC token. Provenance attestations are not generated while this repository is private; npm only attests publishes from public repositories, so publishing the repository would add them without touching the workflow.

## Why a deploy cannot happen from anywhere else

Publishing is blocked at five independent layers. A change has to defeat all of them to reach npm.

1. **Trigger.** `publish.yml` declares `on: push: branches: [main]` and nothing else. There is no `workflow_dispatch`, `workflow_call`, `pull_request`, `schedule`, `release`, or tag trigger, so pushing a branch, naming a tag, or calling it from another workflow does not start it.
2. **Job guards.** The job is skipped unless `github.repository` is `The-Code-Monkey/NestlyJS`, `github.ref` is `refs/heads/main`, and the event is `push`. A copy of this workflow in a fork runs under the fork's identity and fails immediately.
3. **Environment.** The job runs in the `npm-publish` environment, whose deployment branch policy allows `main` only. GitHub refuses to start the job from any other ref, before any step executes. Repository admins can bypass this; nobody else can.
4. **History check.** The first step fetches `origin/main` and refuses to continue unless the commit is an ancestor of it, so a re-run or dispatch against a commit that is not on `main` stops there.
5. **npm.** The trusted publisher is bound to this repository and to the filename `publish.yml`. npm validates those claims and also that `repository.url` in `package.json` matches. A fork, a renamed workflow file, or a different repository is rejected by the registry even if it somehow obtains an OIDC token. Token publishing is disabled on the package, so a leaked `NPM_TOKEN` would not help either.

`release.yml` deliberately holds no OIDC permission, and `scripts/check-release-workflow.mjs` fails CI if a publish step or publish script appears in it.

### What is not protected

- **This repository has no branch protection.** It is private on a plan without rulesets, so a maintainer with write access can push anything to `main`, including a changed `publish.yml`. The controls for that are review, the environment audit log, and npm 2FA. Making the repository public or upgrading the plan to enable branch protection and required reviews would close the gap.
- **The trusted publisher's environment claim is not configured on npm.** npm does not check it today. The `npm-publish` environment still enforces the branch policy on the GitHub side.
- **Unpublishing.** A published version cannot be reused. Fix forward with a patch release.

## npm configuration that must stay true

Package settings on npmjs.com for `@nestlyjs/server`:

- **Trusted publishing**: GitHub Actions, repository `The-Code-Monkey/NestlyJS`, workflow filename `publish.yml`, `npm publish` allowed. New configurations default to `npm stage publish` only, which this workflow cannot use.
- **Publishing access**: "Require two-factor authentication and disallow tokens".
- **No `NPM_TOKEN` or `NODE_AUTH_TOKEN`** in the repository. `publish.yml` authenticates with `id-token: write`; adding a token would only widen the attack surface.
- A trusted-publisher configuration expires if it does not complete a successful publish within two days of creation.

## Repository configuration that must stay true

- Actions must be allowed to create pull requests (`Settings → Actions → General → Allow GitHub Actions to create and approve pull requests`). Without it the version PR cannot be opened.
- The `npm-publish` environment must keep its branch policy limited to `main`.
- The publish workflow must stay named `publish.yml`. npm matches the filename exactly.

## A normal release

1. Add a changeset to any pull request that changes `packages/server`:

   ```sh
   pnpm exec changeset
   ```

2. Merge the pull request. `release.yml` runs tests, builds, checks the package contents, and opens or updates `chore: release packages` with the new version and changelog.
3. Approve the version PR's `Test Test-App` run if GitHub marked it `action_required` (see below), then merge it.
4. `publish.yml` publishes over OIDC, writes the git tag `@nestlyjs/server@X.Y.Z`, and creates the GitHub release.
5. Verify:

   ```sh
   npm view @nestlyjs/server dist-tags versions
   ```

   `npm audit signatures` in a project that has the package installed verifies the registry signature. Provenance is absent until the repository is public.

### Why the version PR needs an approval click

`changesets/action` opens the version PR with `GITHUB_TOKEN`. GitHub treats pull requests created that way cautiously and parks their workflow runs in `action_required` until someone with write access approves them. Approving is a one-click action on the run page or:

```sh
gh api -X POST repos/The-Code-Monkey/NestlyJS/actions/runs/<run-id>/approve
```

The alternative is a fine-grained token in `github-token`, which reintroduces a stored secret for no security gain.

## Patch releases

The same flow. The changeset is `patch`, the version PR bumps the patch number, and `publish.yml` publishes it. Deprecate a broken version rather than unpublishing it:

```sh
npm deprecate @nestlyjs/server@0.2.0 "Use 0.2.1 or newer"
```

## Prereleases

Prereleases are published by hand. CI refuses to publish while `.changeset/pre.json` exists, and npm cannot be configured for trusted publishing until a package already exists.

```sh
pnpm exec changeset pre enter next
pnpm exec changeset version                        # 0.2.0 -> 0.2.0-next.0
pnpm --filter @nestlyjs/server build
cd packages/server && npm publish --tag next       # 2FA prompt
```

Publish the tarball before merging the version commit so the post-merge `publish.yml` run finds the version on the registry and does nothing.

Do not use `changeset publish` for this step: in prerelease mode it publishes a first release under `latest` rather than `next`. For the same reason, note that npm assigns `latest` to a package's first version even when `--tag next` is passed, because `latest` must exist for `npm install @nestlyjs/server` to resolve. Publish the stable release in the same session so that window stays short.

To return to stable releases:

```sh
pnpm exec changeset pre exit
pnpm exec changeset version                        # 0.2.0-next.0 -> 0.2.0
```

then merge. CI publishes the stable version over OIDC.

## If a release fails

| Symptom | Cause |
| --- | --- |
| `ENEEDAUTH` or a 403 from npm | Trusted publisher missing, workflow filename mismatch, `id-token: write` removed, or the environment claim does not match the npm configuration |
| Job skipped with no logs | A job guard failed: wrong repository, ref, or event |
| Job cannot start | The ref is not allowed by the `npm-publish` environment branch policy |
| No version PR | The repository setting that allows Actions to create pull requests is off |
| Version PR exists but nothing publishes | Pending changesets exist or `.changeset/pre.json` is present |
| Wrong version published | Fix forward with a patch release; versions cannot be reused |

## Guard checks

`scripts/check-release-workflow.mjs` runs in CI on every pull request and again inside `publish.yml` before publishing. It fails when:

- `publish.yml` is triggered by anything other than `push` to `main`
- a second trigger such as `workflow_dispatch` or `pull_request` is added
- the repository, ref, or event guards are removed
- the `npm-publish` environment is dropped
- `id-token: write` disappears, `pull-requests: write` appears, or an npm token is referenced
- `release.yml` gains a publish step or publish script

If a guard genuinely needs to change, update the script in the same pull request so the change is explicit.
