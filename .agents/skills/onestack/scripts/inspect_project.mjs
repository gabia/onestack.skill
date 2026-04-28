#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const ENV_FILE_NAMES = [".env", ".env.example", ".env.production", ".env.local", ".env.sample"];

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function detectPackageManager(root) {
  const lockfiles = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
  ];

  for (const [filename, manager] of lockfiles) {
    if (existsSync(path.join(root, filename))) {
      return manager;
    }
  }
  return null;
}

function packageInfo(root) {
  const packagePath = path.join(root, "package.json");
  if (!existsSync(packagePath)) {
    return null;
  }

  const pkg = readJson(packagePath);
  const dependencies = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  const scripts = pkg.scripts || {};
  const frameworks = [];

  for (const name of ["next", "vite", "react", "vue", "svelte", "astro", "nuxt", "express", "fastify", "nestjs"]) {
    if (dependencies.has(name) || (name === "nestjs" && dependencies.has("@nestjs/core"))) {
      frameworks.push(name);
    }
  }

  return {
    packageManager: detectPackageManager(root),
    scripts,
    frameworks,
    hasBuildScript: Object.prototype.hasOwnProperty.call(scripts, "build"),
    hasStartScript: Object.prototype.hasOwnProperty.call(scripts, "start"),
  };
}

function dockerExposePort(root) {
  const dockerfile = path.join(root, "Dockerfile");
  if (!existsSync(dockerfile)) {
    return null;
  }

  try {
    const text = readFileSync(dockerfile, "utf8");
    const match = text.match(/^\s*EXPOSE\s+(\d+)/im);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function redactRemote(remote) {
  if (!remote) {
    return remote;
  }
  return remote.replace(/^(https?:\/\/)[^/@]+@/i, "$1***@");
}

function gitInfo(root) {
  const inside = run("git", ["rev-parse", "--is-inside-work-tree"], root) === "true";
  if (!inside) {
    return { inside: false };
  }

  const status = run("git", ["status", "--porcelain"], root) || "";
  const branch = run("git", ["branch", "--show-current"], root);
  const remote = run("git", ["remote", "get-url", "origin"], root);
  const upstream = run("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);

  let ahead = null;
  let behind = null;
  if (upstream) {
    const counts = run("git", ["rev-list", "--left-right", "--count", `${upstream}...HEAD`], root);
    if (counts) {
      const [left, right] = counts.split(/\s+/).map(Number);
      behind = left;
      ahead = right;
    }
  }

  return {
    inside: true,
    branch,
    remote: redactRemote(remote),
    remoteHasCredentials: Boolean(remote && /^(https?:\/\/)[^/@]+@/i.test(remote)),
    upstream,
    dirty: Boolean(status),
    statusEntries: status ? status.split("\n").slice(0, 50) : [],
    ahead,
    behind,
  };
}

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function inferRecommendation(root, pkg, composeFile) {
  if (composeFile) {
    return {
      dokployResource: "compose",
      composePath: composeFile,
      composeType: "docker-compose",
      reason: "compose file detected",
    };
  }

  const exposed = dockerExposePort(root);
  if (existsSync(path.join(root, "Dockerfile"))) {
    return {
      dokployResource: "compose",
      sourceType: "raw-image",
      dockerfile: "Dockerfile",
      composeType: "docker-compose",
      dockerContextPath: ".",
      portHint: exposed,
      reason: "Dockerfile detected; build and push an image, then deploy it with raw Docker Compose",
    };
  }

  if (pkg) {
    const frameworks = new Set(pkg.frameworks || []);
    const hasServer = frameworks.has("express") || frameworks.has("fastify") || frameworks.has("nestjs");
    if (!hasServer && (frameworks.has("vite") || frameworks.has("astro") || frameworks.has("vue") || frameworks.has("svelte"))) {
      return {
        dokployResource: "application",
        buildType: "static",
        publishDirectory: "dist",
        isStaticSpa: frameworks.has("react") || frameworks.has("vue") || frameworks.has("svelte"),
        portHint: 80,
        reason: "frontend build tooling detected without a server framework",
      };
    }

    if (frameworks.has("next")) {
      return {
        dokployResource: "application",
        buildType: "nixpacks",
        portHint: 3000,
        reason: "Next.js app detected without Dockerfile",
      };
    }

    return {
      dokployResource: "application",
      buildType: "nixpacks",
      portHint: intFromEnv("PORT", 3000),
      reason: "Node package detected without Dockerfile",
    };
  }

  if (existsSync(path.join(root, "requirements.txt")) || existsSync(path.join(root, "pyproject.toml"))) {
    return {
      dokployResource: "application",
      buildType: "nixpacks",
      portHint: intFromEnv("PORT", 8000),
      reason: "Python project detected without Dockerfile",
    };
  }

  return {
    dokployResource: "unknown",
    reason: "No Dockerfile, compose file, package.json, requirements.txt, or pyproject.toml detected",
  };
}

function main() {
  const root = path.resolve(process.argv[2] || ".");
  if (!existsSync(root)) {
    console.error(JSON.stringify({ error: `Path does not exist: ${root}` }, null, 2));
    return 2;
  }

  const composeFile = COMPOSE_FILES.find((name) => existsSync(path.join(root, name))) || null;
  const pkg = packageInfo(root);
  const envFiles = ENV_FILE_NAMES.filter((name) => existsSync(path.join(root, name)));

  const result = {
    root,
    name: path.basename(root),
    git: gitInfo(root),
    detectedFiles: {
      dockerfile: existsSync(path.join(root, "Dockerfile")) ? "Dockerfile" : null,
      compose: composeFile,
      packageJson: existsSync(path.join(root, "package.json")) ? "package.json" : null,
      requirementsTxt: existsSync(path.join(root, "requirements.txt")) ? "requirements.txt" : null,
      pyprojectToml: existsSync(path.join(root, "pyproject.toml")) ? "pyproject.toml" : null,
      envFiles,
    },
    node: pkg,
    recommendation: inferRecommendation(root, pkg, composeFile),
  };

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

process.exitCode = main();
