#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_URL = "http://211.47.74.86:3000";
const DEFAULT_DOMAIN_SUFFIX = "onestack.run";

function usage() {
  console.error(`Usage:
  deploy_raw_compose.mjs --project NAME --compose-file FILE --service NAME --port PORT [options]

Options:
  --app-name SLUG          Dokploy app slug and default domain prefix. Defaults to project.
  --environment NAME       Defaults to production.
  --description TEXT       Resource description.
  --host HOST              Domain host. Defaults to <app-name>.onestack.run.
  --no-domain              Do not create a Dokploy domain route.
  --no-deploy              Create/update resources without queueing a deployment.
  --wait-ms NUMBER         Wait for queued deployment. Defaults to 600000.
`);
}

function take(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  args.splice(index, 2);
  return value;
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function assertSlug(value, label) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, dot, underscore, or dash: ${value}`);
  }
}

function assertHost(value) {
  if (!/^[a-zA-Z0-9.-]+$/.test(value) || !value.includes(".")) {
    throw new Error(`Invalid host: ${value}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readAuth() {
  const token = process.env.DOKPLOY_API_KEY || process.env.DOKPLOY_AUTH_TOKEN;
  const url = process.env.DOKPLOY_URL || DEFAULT_URL;
  if (token) return { token, url };

  try {
    const npmRoot = run("npm", ["root", "-g"]);
    const configPath = path.join(npmRoot, "@dokploy", "cli", "config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.token && config.url) {
        return { token: config.token, url: config.url };
      }
    }
  } catch {
    // Fall through to the explicit error below.
  }

  throw new Error("Dokploy auth is missing. Run bootstrap_dokploy.sh or set DOKPLOY_URL and DOKPLOY_API_KEY.");
}

async function request(method, endpoint, payload) {
  const auth = readAuth();
  const url = new URL(`${auth.url.replace(/\/$/, "")}/api/trpc/${endpoint}`);
  const options = {
    method,
    headers: {
      "x-api-key": auth.token,
      "content-type": "application/json",
    },
  };

  if (method === "GET") {
    url.searchParams.set("input", JSON.stringify({ json: payload || {} }));
  } else {
    options.body = JSON.stringify({ json: payload || {} });
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = body?.error?.json?.message || body?.message || text || response.statusText;
    throw new Error(`${endpoint} failed (${response.status}): ${message}`);
  }

  return body?.result?.data?.json ?? body;
}

async function getProjects() {
  return request("GET", "project.all", {});
}

function findProject(projects, name) {
  return projects.find((project) => project.name === name);
}

function findEnvironment(project, name) {
  return project?.environments?.find((environment) => environment.name === name);
}

function findCompose(environment, name) {
  return environment?.compose?.find((compose) => compose.name === name);
}

async function ensureProjectAndEnvironment({ projectName, environmentName, description }) {
  let projects = await getProjects();
  let project = findProject(projects, projectName);
  if (!project) {
    const created = await request("POST", "project.create", {
      name: projectName,
      description,
    });
    return {
      projectId: created.project.projectId,
      environmentId: created.environment.environmentId,
      createdProject: true,
    };
  }

  let environment = findEnvironment(project, environmentName);
  if (!environment) {
    environment = await request("POST", "environment.create", {
      name: environmentName,
      description: environmentName,
      projectId: project.projectId,
    });
  }

  return {
    projectId: project.projectId,
    environmentId: environment.environmentId,
    createdProject: false,
  };
}

async function ensureCompose({ projectName, environmentName, environmentId, appName, composeFile, description }) {
  let projects = await getProjects();
  let project = findProject(projects, projectName);
  let environment = findEnvironment(project, environmentName);
  let compose = findCompose(environment, appName);
  let createdCompose = false;

  if (!compose) {
    compose = await request("POST", "compose.create", {
      name: appName,
      appName,
      description,
      environmentId,
      composeType: "docker-compose",
      composeFile,
    });
    createdCompose = true;
  }

  const composeId = compose.composeId;
  await request("POST", "compose.update", {
    composeId,
    name: appName,
    description,
    sourceType: "raw",
    composeType: "docker-compose",
    composeFile,
  });

  return { composeId, createdCompose };
}

async function ensureDomain({ composeId, host, service, port }) {
  const domains = await request("GET", "domain.byComposeId", { composeId });
  const existing = domains.find((domain) => domain.host === host && domain.serviceName === service);
  if (existing) {
    return { domainId: existing.domainId, host: existing.host, createdDomain: false };
  }

  const domain = await request("POST", "domain.create", {
    host,
    path: "/",
    port,
    composeId,
    serviceName: service,
    domainType: "compose",
    certificateType: "none",
    internalPath: "/",
  });
  return { domainId: domain.domainId, host: domain.host, createdDomain: true };
}

async function deploy(composeId, imageDescription) {
  return request("POST", "compose.deploy", {
    composeId,
    title: "Deploy raw image compose",
    description: imageDescription,
  });
}

async function waitForDeployment({ composeId, projectName, appName, waitMs }) {
  const deadline = Date.now() + waitMs;
  let last = null;

  while (Date.now() < deadline) {
    const queue = await request("GET", "deployment.queueList", {});
    const queued = queue.find((item) => item.data?.composeId === composeId);
    const projects = await getProjects();
    const project = findProject(projects, projectName);
    const environment = project?.environments?.find((item) => findCompose(item, appName));
    const compose = findCompose(environment, appName);
    last = {
      queueState: queued?.state || "not_in_queue",
      failedReason: queued?.failedReason || null,
      composeStatus: compose?.composeStatus || null,
    };

    if (!queued && (last.composeStatus === "done" || last.composeStatus === "error")) {
      return last;
    }
    await sleep(5000);
  }

  return { ...last, timedOut: true };
}

function firstImage(composeFile) {
  const match = composeFile.match(/^\s*image:\s*["']?([^"'\s]+)["']?/m);
  return match ? match[1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return 0;
  }

  const projectName = take(args, "--project");
  const composeFilePath = take(args, "--compose-file");
  const service = take(args, "--service");
  const port = Number(take(args, "--port"));
  const environmentName = take(args, "--environment") || "production";
  const appName = slug(take(args, "--app-name") || projectName || "");
  const description = take(args, "--description") || "Raw Docker Compose deployment";
  const noDomain = flag(args, "--no-domain");
  const noDeploy = flag(args, "--no-deploy");
  const host = take(args, "--host") || `${appName}.${DEFAULT_DOMAIN_SUFFIX}`;
  const waitMs = Number(take(args, "--wait-ms") || 600000);

  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
  if (!projectName) throw new Error("--project is required");
  if (!composeFilePath) throw new Error("--compose-file is required");
  if (!service) throw new Error("--service is required");
  if (!existsSync(composeFilePath)) throw new Error(`Compose file does not exist: ${composeFilePath}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(waitMs) || waitMs < 0) throw new Error("--wait-ms must be a positive integer");
  assertSlug(appName, "app name");
  assertSlug(service, "service");
  assertHost(host);

  const composeFile = readFileSync(composeFilePath, "utf8");
  const image = firstImage(composeFile);

  const project = await ensureProjectAndEnvironment({ projectName, environmentName, description });
  const compose = await ensureCompose({
    projectName,
    environmentName,
    environmentId: project.environmentId,
    appName,
    composeFile,
    description,
  });
  const domain = noDomain ? null : await ensureDomain({ composeId: compose.composeId, host, service, port });
  const deployment = noDeploy ? null : await deploy(compose.composeId, image ? `Image ${image}` : "Raw compose");
  const finalStatus = noDeploy ? null : await waitForDeployment({
    composeId: compose.composeId,
    projectName,
    appName,
    waitMs,
  });

  console.log(JSON.stringify({
    projectId: project.projectId,
    environmentId: project.environmentId,
    composeId: compose.composeId,
    domain,
    deployment,
    finalStatus,
  }, null, 2));

  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error.message);
  usage();
  process.exitCode = 1;
});
