# npm publishing uses OIDC trusted publishing

Releases publish from `.github/workflows/publish.yml` through npm trusted publishing (OIDC). No npm token is stored in the repository, and the package is configured to disallow token publishing. Version bumps and changelogs are produced separately by `.github/workflows/release.yml`, which holds no OIDC permission.

A long-lived `NPM_TOKEN` secret is simpler to configure, but it is the highest-value credential in the release pipeline and nothing here requires it. Splitting versioning from publishing means the job that can open pull requests can never publish. Consequences: the first publish must be done by hand as a prerelease, because npm only accepts trusted-publisher configuration for a package that already exists; the publishing workflow filename is part of the registry configuration, so renaming it requires updating the npm package settings; and npm's two-day validation window applies to every new trusted-publisher configuration.
