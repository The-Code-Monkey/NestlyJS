#!/usr/bin/env node
// The publish workflow is the only path to npm, so its trigger surface and
// guards are checked here. This catches accidental widening (a new trigger, a
// different branch, a token, a publish step in the version workflow) during
// review instead of at release time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const workflows = path.join(repoRoot, ".github", "workflows");
const publish = fs.readFileSync(path.join(workflows, "publish.yml"), "utf8");
const version = fs.readFileSync(path.join(workflows, "release.yml"), "utf8");

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

// Triggers: `push` to `main` and nothing else.
const triggerEnd = publish.indexOf("\npermissions:");
const trigger = publish.slice(publish.indexOf("on:"), triggerEnd);
check(
  /^on:\s*\n\s*push:\s*\n\s*branches:\s*\[\s*['"]?main['"]?\s*\]\s*$/m.test(trigger),
  "publish.yml must be triggered only by `push` to `main`"
);
for (const forbidden of [
  "pull_request",
  "workflow_dispatch",
  "workflow_call",
  "schedule",
  "release",
  "tag",
]) {
  check(
    !new RegExp(`\\b${forbidden}\\b`).test(trigger),
    `publish.yml must not declare \`${forbidden}\` as a trigger`
  );
}

// Job-level guards.
for (const guard of [
  "github.repository == 'The-Code-Monkey/NestlyJS'",
  "github.ref == 'refs/heads/main'",
  "github.event_name == 'push'",
]) {
  check(publish.includes(guard), `publish.yml is missing the guard: ${guard}`);
}

check(
  /^\s*environment:\s*npm-publish\s*$/m.test(publish),
  "the publish job must run in the npm-publish environment"
);

// Permissions and credentials.
check(publish.includes("id-token: write"), "publish.yml must request id-token: write");
check(
  !publish.includes("pull-requests: write"),
  "publish.yml must not request pull-requests: write"
);
check(
  !/NPM_TOKEN|NODE_AUTH_TOKEN/.test(publish),
  "publish.yml must not reference an npm token"
);

// The version workflow must never publish.
check(
  !/changesets\/action\/publish|publish-script|changeset publish/.test(version),
  "release.yml must not publish; publishing belongs to publish.yml"
);

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("release workflow guards ok");
