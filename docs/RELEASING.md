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

`publish.yml` runs `changeset publish`, pushes the git tag, and creates the GitHub release. npm authenticates the workflow with a short-lived OIDC token. The repository is public, so publishes carry provenance attestations from the next release onward; `0.2.0` and `0.2.1` predate that.

## What stops a deploy

GitHub runs the workflow file **from the ref being pushed**, so everything written inside a job is code that whoever pushes the branch can edit. A guard only counts when it is evaluated outside the workflow: by GitHub's trigger and environment machinery, or by npm. The table separates the two.

| Attempt | What stops it |
| --- | --- |
| Push any branch with `publish.yml` unmodified | The only trigger is `push` to `main`; the workflow does not run. |
| Push a branch with the trigger edited to include that branch | The job `if` also requires `github.ref == 'refs/heads/main'`. If that is deleted too, the environment branch policy rejects the ref before the job starts. If the `environment:` line is deleted as well, the OIDC token carries no `npm-publish` environment claim and npm's trusted publisher rejects it. |
| Add `workflow_dispatch` or `workflow_call` and run it on a branch | Same three checks, in that order: ref guard, environment policy, npm environment claim. |
| Push a fork and run its copy | `github.repository` fails immediately, and the OIDC token would identify the fork, which npm rejects. |
| Re-run a workflow against a commit that is not on `main` | The first step refuses unless the commit is an ancestor of `origin/main`. |
| Add an npm token instead of OIDC | The package disallows token publishing and no token exists. |
| Direct-push any commit to `main` | The `main` ruleset rejects the push; changes must arrive through a pull request. Belt and braces, the workflow also refuses commits that are not associated with a merged pull request. |
| **Edit `publish.yml` and push it directly to `main`** | **Blocked by the `main` ruleset.** The edit has to go through a pull request, so it is visible and reviewable before it runs. |

### Why the environment is load-bearing

Everything in the first five rows depends on a claim that the attacker cannot write into a file:

- **Repository and workflow filename** are in the OIDC token and checked by npm. Editing the workflow cannot change either claim.
- **`environment: npm-publish`** is in the OIDC token, and npm's trusted publisher is configured with that environment name. The environment's branch policy allows `main` only and administrators can no longer bypass it, so the claim cannot be minted for another ref.
- **Pull-request association** is recorded by GitHub when a commit reaches `main` through a merged pull request. The workflow queries it for the release commit and for the last commit that changed `publish.yml`. The *data* is out of band; the *query* is not, which is the limitation above.

That is the difference between `merge-base --is-ancestor` (a step the pusher can delete) and the environment binding (a value npm checks after the fact). Without the environment in npm's configuration, repository plus filename alone accept a push from any branch of this repository, which is exactly the "dodgy branch edits the workflow" case.

### What is still not protected

- **Self-merged pull requests.** The ruleset requires a pull request but no approving review, because a solo maintainer cannot approve their own. An edited `publish.yml` still cannot be pushed silently, but it can be merged by the person who wrote it. Adding a second maintainer and a required approval — or required reviewers on the `npm-publish` environment, now that the repository is public — closes that. Both add a human approval to every release.
- **A compromised workflow with approved changes.** If someone can merge a malicious `publish.yml` through a pull request, no in-repo check survives. Only npm staged publishing (`npm stage publish` plus a 2FA approval per release) or a trusted publisher in a separate repository survives a fully compromised workflow.
- **Anyone who can change repository settings** can remove the environment policy or bypass it, just as they could delete the workflow. Settings access is equivalent to publish access.
- **Unpublishing.** A published version cannot be reused. Fix forward with a patch release.

## npm configuration that must stay true

Package settings on npmjs.com for `@nestlyjs/server`:

- **Trusted publishing**: GitHub Actions, repository `The-Code-Monkey/NestlyJS`, workflow filename `publish.yml`, environment `npm-publish`, `npm publish` allowed. The environment is not optional: repository and filename alone accept a push from any branch in this repository, so an edited workflow on a side branch could publish. New configurations default to `npm stage publish` only, which this workflow cannot use.
- **Publishing access**: "Require two-factor authentication and disallow tokens".
- **No `NPM_TOKEN` or `NODE_AUTH_TOKEN`** in the repository. `publish.yml` authenticates with `id-token: write`; adding a token would only widen the attack surface.
- A trusted-publisher configuration expires if it does not complete a successful publish within two days of creation.

## Repository configuration that must stay true

- Actions must be allowed to create pull requests (`Settings → Actions → General → Allow GitHub Actions to create and approve pull requests`). Without it the version PR cannot be opened.
- The `npm-publish` environment must keep its branch policy limited to `main`, with administrator bypass disabled.
- `main` must stay protected by the `main` ruleset: pull requests required, no direct or force pushes, no deletion, the `test` check required, and no bypass actors so administrators are bound too.
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

   `npm audit signatures` in a project that has the package installed verifies the registry signature and the provenance attestation.

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
