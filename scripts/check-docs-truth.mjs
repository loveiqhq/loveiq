#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const EXCLUDED_DOC_PREFIXES = [".agents/", ".claude/", ".codeium/"];
// Historical planning snapshots: their prose intentionally references the repo state
// at creation time, so they are exempt from the dead-tree / display-text checks below.
// Their links are still validated for existence.
const HISTORICAL_DOC_PREFIXES = ["docs/plans/"];
const ENV_DOC_FILES = [
  "README.md",
  "DEVELOPMENT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CLAUDE.md",
  ".github/README.md",
  ".github/SECURITY_CHECKLIST.md",
  "docs/api.md",
  "docs/admin-api.md",
];
const ENV_ALLOWLIST = new Set(["NODE_ENV"]);
const REQUIRED_DOC_PATHS = [
  "app/admin/AGENT_README.md",
  "app/api/admin/AGENT_README.md",
  "features/admin/AGENT_README.md",
  "features/admin/ui/AGENT_README.md",
  "features/admin/server/AGENT_README.md",
  "docs/admin/AGENT_README.md",
  "docs/admin/domains/AGENT_README.md",
  "docs/admin/domains/command-center.md",
  "docs/admin/domains/submissions.md",
  "docs/admin/domains/scoring.md",
  "docs/admin/domains/growth.md",
  "docs/admin/domains/research.md",
  "docs/admin/domains/health.md",
];

// Directory trees removed by the lib/->shared and components/->features refactor.
// Any committed doc (outside historical snapshots) that still references them in a
// code span is stale and must be updated.
const DEAD_TREE_SPAN = /`((?:lib|components|\.planning)\/[A-Za-z0-9_./*-]+)`/g;
const DEAD_IMPORT_ALIAS = /@\/(lib|components)\//g;
const DISPLAY_TOPDIR =
  /^(app|features|shared|data|docs|scripts|supabase|public|e2e|load-tests|__tests__)\//;
const DISPLAY_EXT = /\.(ts|tsx|js|mjs|cjs|sql|md|css|json|png|svg|webp|ico)$/;
// Per-line escape hatch for the rare intentional dead-path mention.
const ALLOW_MARKER = "docs-truth-allow";

const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function readFile(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function normalizeRepoPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isHistoricalDoc(filePath) {
  return HISTORICAL_DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function stripVersionPrefix(version) {
  return version.replace(/^[^\d]*/, "");
}

function getTrackedMarkdownFiles() {
  const output = execSync('git ls-files --cached --others --exclude-standard -- "*.md"', {
    encoding: "utf8",
  }).trim();
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => normalizeRepoPath(line.trim()))
    .filter(Boolean)
    .filter((filePath) => !EXCLUDED_DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix)));
}

function resolveRelativeTarget(markdownFile, linkTarget) {
  const withoutAnchor = linkTarget.split("#")[0]?.split("?")[0] ?? "";
  if (!withoutAnchor) return null;
  // Skip protocol URLs, anchors, template tokens, and site-absolute ("/...") URLs.
  // Deliberately do NOT skip "../../" or "C:/"-style targets: they were skipped
  // historically, which let broken deep-relative links and corrupted absolute
  // filesystem paths pass CI. Those now fall through to the existence check and fail.
  if (/^(https?:|mailto:|#|\/|\{|app:\/\/|plugin:\/\/|vscode:\/\/)/i.test(withoutAnchor)) {
    return null;
  }

  const markdownDir = path.dirname(markdownFile);
  return path.normalize(path.join(markdownDir, withoutAnchor));
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath) || fs.existsSync(`${targetPath}.md`);
}

function checkRequiredDocs() {
  for (const filePath of REQUIRED_DOC_PATHS) {
    if (!fs.existsSync(path.join(process.cwd(), filePath))) {
      addError(`required documentation file is missing: ${filePath}`);
    }
  }
}

function checkMarkdownLinks(markdownFiles) {
  const inlineLinkPattern = /\[[^\]]*]\(([^)]+)\)/g;
  const referenceLinkPattern = /^\[[^\]]+]:\s+(\S+)/gm;

  for (const markdownFile of markdownFiles) {
    const absoluteFile = path.join(process.cwd(), markdownFile);
    const content = fs.readFileSync(absoluteFile, "utf8");
    const discoveredLinks = [];

    for (const match of content.matchAll(inlineLinkPattern)) {
      discoveredLinks.push(match[1]);
    }
    for (const match of content.matchAll(referenceLinkPattern)) {
      discoveredLinks.push(match[1]);
    }

    for (const link of discoveredLinks) {
      const resolved = resolveRelativeTarget(markdownFile, link);
      if (!resolved) continue;

      const absoluteResolved = path.isAbsolute(resolved)
        ? resolved
        : path.join(process.cwd(), resolved);

      if (!pathExists(absoluteResolved)) {
        addError(`${markdownFile}: broken relative link "${link}"`);
      }
    }
  }
}

// Flags references to directory trees removed by the refactor, plus the dead
// "@/lib" / "@/components" import aliases. This is the check that would have caught
// the stale link display-text and prose that slipped past target-only validation.
function checkDeadTreeReferences(markdownFiles) {
  for (const markdownFile of markdownFiles) {
    if (isHistoricalDoc(markdownFile)) continue;
    const lines = readFile(markdownFile).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const match of line.matchAll(DEAD_TREE_SPAN)) {
        addError(
          `${markdownFile}:${index + 1}: references removed path \`${match[1]}\` ` +
            `(lib/ -> shared/*, components/ -> features/*/ui, .planning/ -> docs/architecture/*)`
        );
      }
      for (const match of line.matchAll(DEAD_IMPORT_ALIAS)) {
        addError(
          `${markdownFile}:${index + 1}: uses removed import alias "@/${match[1]}/" ` +
            `(use @shared/* or @features/*)`
        );
      }
    });
  }
}

// Flags inline links whose code-span display text is a repo file path that no longer
// matches its (valid) target — e.g. [`components/admin/X.tsx`](../features/admin/ui/X.tsx).
function checkLinkDisplayText(markdownFiles) {
  const inlineLinkPattern = /\[([^\]]*)]\(([^)]+)\)/g;
  for (const markdownFile of markdownFiles) {
    if (isHistoricalDoc(markdownFile)) continue;
    const content = readFile(markdownFile);
    for (const match of content.matchAll(inlineLinkPattern)) {
      const display = match[1];
      const target = match[2];
      const hadBackticks = display.startsWith("`") && display.endsWith("`");
      const inner = hadBackticks ? display.slice(1, -1) : display;
      // Only consider path-like, file-extension display text (avoids prose/dir links).
      if (!inner.includes("/") || !DISPLAY_TOPDIR.test(inner) || !DISPLAY_EXT.test(inner)) {
        continue;
      }
      const resolved = resolveRelativeTarget(markdownFile, target);
      if (!resolved) continue;
      const absoluteResolved = path.isAbsolute(resolved)
        ? resolved
        : path.join(process.cwd(), resolved);
      const real = fs.existsSync(absoluteResolved)
        ? absoluteResolved
        : fs.existsSync(`${absoluteResolved}.md`)
          ? `${absoluteResolved}.md`
          : null;
      if (!real) continue; // broken link is reported by checkMarkdownLinks
      const repoRel = normalizeRepoPath(path.relative(process.cwd(), real));
      if (inner !== repoRel) {
        addError(
          `${markdownFile}: link display text "${inner}" does not match its target "${repoRel}"`
        );
      }
    }
  }
}

function checkDocumentedScripts(markdownFiles) {
  const packageJson = JSON.parse(readFile("package.json"));
  const actualScripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const builtIns = new Set(["install", "ci"]);

  for (const markdownFile of markdownFiles) {
    const content = readFile(markdownFile);
    const referencedScripts = new Set();

    for (const match of content.matchAll(/\bnpm\s+run\s+([a-zA-Z0-9:_-]+)/g)) {
      referencedScripts.add(match[1]);
    }
    for (const match of content.matchAll(/\bnpm\s+(test|start)\b/g)) {
      referencedScripts.add(match[1]);
    }

    for (const scriptName of referencedScripts) {
      if (builtIns.has(scriptName)) continue;
      if (!actualScripts.has(scriptName)) {
        addError(`${markdownFile}: references missing npm script "${scriptName}"`);
      }
    }
  }
}

function checkEnvironmentVariables() {
  const envExampleVars = new Set(
    readFile(".env.example")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*#?\s*([A-Z][A-Z0-9_]+)=/)?.[1] ?? null)
      .filter(Boolean)
  );

  const documentedVars = new Map();

  for (const markdownFile of ENV_DOC_FILES) {
    if (!fs.existsSync(path.join(process.cwd(), markdownFile))) continue;

    const content = readFile(markdownFile);
    for (const match of content.matchAll(/`([A-Z][A-Z0-9_]*_[A-Z0-9_]+)`/g)) {
      const envVar = match[1];
      if (ENV_ALLOWLIST.has(envVar) || envVar.endsWith("_")) continue;
      if (!documentedVars.has(envVar)) documentedVars.set(envVar, new Set());
      documentedVars.get(envVar).add(markdownFile);
    }
  }

  for (const [envVar, files] of documentedVars.entries()) {
    if (!envExampleVars.has(envVar)) {
      addError(
        `${[...files].join(", ")}: references env var "${envVar}" missing from .env.example`
      );
    }
  }

  for (const envVar of envExampleVars) {
    if (!documentedVars.has(envVar)) {
      addWarning(`.env.example: "${envVar}" is not documented in the canonical docs set`);
    }
  }
}

function parseVersionsTable() {
  const versionsFile = "docs/versions.md";
  if (!fs.existsSync(path.join(process.cwd(), versionsFile))) {
    addError("docs/versions.md is missing");
    return new Map();
  }

  const table = new Map();
  const content = readFile(versionsFile);
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/);
    if (match) {
      table.set(match[1], match[2]);
    }
  }
  return table;
}

function extractCiNodeVersion() {
  const ciContent = readFile(".github/workflows/ci.yml");
  const match = ciContent.match(/node-version:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function checkVersions() {
  const packageJson = JSON.parse(readFile("package.json"));
  const documented = parseVersionsTable();

  const expectedVersions = new Map([
    ["node", extractCiNodeVersion()],
    ["next", stripVersionPrefix(packageJson.dependencies?.next ?? "")],
    ["react", stripVersionPrefix(packageJson.dependencies?.react ?? "")],
    ["react-dom", stripVersionPrefix(packageJson.dependencies?.["react-dom"] ?? "")],
    ["typescript", stripVersionPrefix(packageJson.devDependencies?.typescript ?? "")],
    ["tailwindcss", stripVersionPrefix(packageJson.devDependencies?.tailwindcss ?? "")],
    ["vitest", stripVersionPrefix(packageJson.devDependencies?.vitest ?? "")],
    ["playwright", stripVersionPrefix(packageJson.devDependencies?.["@playwright/test"] ?? "")],
    ["eslint", stripVersionPrefix(packageJson.devDependencies?.eslint ?? "")],
  ]);

  for (const [key, expectedValue] of expectedVersions.entries()) {
    const documentedValue = documented.get(key);
    if (!expectedValue) {
      addError(`Unable to determine expected version for "${key}"`);
      continue;
    }
    if (!documentedValue) {
      addError(`docs/versions.md: missing "${key}" entry`);
      continue;
    }
    if (documentedValue !== expectedValue) {
      addError(
        `docs/versions.md: "${key}" is "${documentedValue}" but source of truth says "${expectedValue}"`
      );
    }
  }
}

function walkRoutes(dirPath) {
  const routes = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      routes.push(...walkRoutes(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      routes.push(fullPath);
    }
  }
  return routes;
}

function collectActualRoutes() {
  const root = path.join(process.cwd(), "app/api");
  const routes = walkRoutes(root).map((filePath) => {
    const routePath =
      "/api/" +
      normalizeRepoPath(path.relative(root, filePath))
        .replace(/\/route\.ts$/, "")
        .replace(/^$/, "");
    const content = fs.readFileSync(filePath, "utf8");
    const methods = [
      ...content.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g),
    ]
      .map((match) => match[1])
      .sort();

    return { routePath, methods };
  });

  return {
    publicRoutes: routes.filter((route) => !route.routePath.startsWith("/api/admin/")),
    adminRoutes: routes.filter((route) => route.routePath.startsWith("/api/admin/")),
  };
}

function parseDocumentedRoutes(markdownFile) {
  const documentedRoutes = new Map();
  if (!fs.existsSync(path.join(process.cwd(), markdownFile))) {
    addError(`${markdownFile} is missing`);
    return documentedRoutes;
  }

  const content = readFile(markdownFile);
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`?(\/api\/[^|`]+)`?\s*\|\s*`?([A-Z,\s]+)`?\s*\|/);
    if (!match) continue;

    const routePath = match[1].trim();
    const methods = match[2]
      .split(",")
      .map((method) => method.trim())
      .filter(Boolean)
      .sort();

    documentedRoutes.set(routePath, methods);
  }

  return documentedRoutes;
}

function compareRouteCoverage(actualRoutes, documentedRoutes, docFile) {
  for (const route of actualRoutes) {
    const documentedMethods = documentedRoutes.get(route.routePath);
    if (!documentedMethods) {
      addError(`${docFile}: missing route ${route.routePath}`);
      continue;
    }

    const actualSet = route.methods.join(",");
    const documentedSet = documentedMethods.join(",");
    if (actualSet !== documentedSet) {
      addError(
        `${docFile}: ${route.routePath} documents methods "${documentedSet}" but source has "${actualSet}"`
      );
    }
  }

  for (const routePath of documentedRoutes.keys()) {
    if (!actualRoutes.some((route) => route.routePath === routePath)) {
      addError(`${docFile}: documents nonexistent route ${routePath}`);
    }
  }
}

function checkApiCoverage() {
  const { publicRoutes, adminRoutes } = collectActualRoutes();
  compareRouteCoverage(publicRoutes, parseDocumentedRoutes("docs/api.md"), "docs/api.md");
  compareRouteCoverage(
    adminRoutes,
    parseDocumentedRoutes("docs/admin-api.md"),
    "docs/admin-api.md"
  );
}

function main() {
  const markdownFiles = getTrackedMarkdownFiles();
  checkRequiredDocs();
  checkMarkdownLinks(markdownFiles);
  checkDeadTreeReferences(markdownFiles);
  checkLinkDisplayText(markdownFiles);
  checkDocumentedScripts(markdownFiles);
  checkEnvironmentVariables();
  checkVersions();
  checkApiCoverage();

  if (warnings.length > 0) {
    console.log("Documentation warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.error("Documentation truth check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Documentation truth check passed for ${markdownFiles.length} markdown files.`);
}

main();
