#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function usage() {
  console.error(`Usage:
  render_image_compose.mjs --image IMAGE --service NAME --port PORT [options]

Options:
  --output FILE              Write compose YAML to FILE. Defaults to stdout.
  --env KEY=VALUE            Add an environment variable. Repeatable.
  --volume NAME:/container   Add a named volume mount. Repeatable.
  --publish                  Publish HOST:CONTAINER port. Default is expose only.
  --health-path PATH         Add a Node fetch healthcheck for http://127.0.0.1:PORT/PATH.
  --no-default-env           Do not add NODE_ENV, PORT, and HOST defaults.
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

function takeAll(args, name) {
  const values = [];
  for (;;) {
    const value = take(args, name);
    if (value === null) return values;
    values.push(value);
  }
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function assertSlug(value, label) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`${label} must contain only letters, numbers, dot, underscore, or dash: ${value}`);
  }
}

function quote(value) {
  return JSON.stringify(String(value));
}

function parseEnv(values) {
  const env = new Map();
  for (const item of values) {
    const index = item.indexOf("=");
    if (index <= 0) {
      throw new Error(`--env must be KEY=VALUE: ${item}`);
    }
    const key = item.slice(0, index);
    const value = item.slice(index + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid environment key: ${key}`);
    }
    env.set(key, value);
  }
  return env;
}

function parseVolumes(values) {
  return values.map((item) => {
    const index = item.indexOf(":");
    if (index <= 0 || index === item.length - 1) {
      throw new Error(`--volume must be NAME:/container/path: ${item}`);
    }
    const name = item.slice(0, index);
    const target = item.slice(index + 1);
    assertSlug(name, "volume name");
    if (!target.startsWith("/")) {
      throw new Error(`volume target must be an absolute container path: ${item}`);
    }
    return { name, target };
  });
}

function render({ image, service, port, env, volumes, publish, healthPath, defaultEnv }) {
  if (defaultEnv) {
    if (!env.has("NODE_ENV")) env.set("NODE_ENV", "production");
    if (!env.has("PORT")) env.set("PORT", String(port));
    if (!env.has("HOST")) env.set("HOST", "0.0.0.0");
  }

  const lines = [
    "services:",
    `  ${service}:`,
    `    image: ${image}`,
    "    restart: unless-stopped",
  ];

  if (env.size > 0) {
    lines.push("    environment:");
    for (const [key, value] of env) {
      lines.push(`      ${key}: ${quote(value)}`);
    }
  }

  lines.push("    expose:");
  lines.push(`      - ${quote(port)}`);

  if (publish) {
    lines.push("    ports:");
    lines.push(`      - ${quote(`${port}:${port}`)}`);
  }

  if (volumes.length > 0) {
    lines.push("    volumes:");
    for (const volume of volumes) {
      lines.push(`      - ${volume.name}:${volume.target}`);
    }
  }

  if (healthPath) {
    const normalized = healthPath.startsWith("/") ? healthPath : `/${healthPath}`;
    const command = `node -e "fetch('http://127.0.0.1:${port}${normalized}').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"`;
    lines.push("    healthcheck:");
    lines.push(`      test: ["CMD-SHELL", ${quote(command)}]`);
    lines.push("      interval: 30s");
    lines.push("      timeout: 5s");
    lines.push("      retries: 3");
    lines.push("      start_period: 20s");
  }

  if (volumes.length > 0) {
    lines.push("");
    lines.push("volumes:");
    for (const volume of volumes) {
      lines.push(`  ${volume.name}:`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    return 0;
  }

  const image = take(args, "--image");
  const service = take(args, "--service");
  const port = Number(take(args, "--port"));
  const output = take(args, "--output");
  const healthPath = take(args, "--health-path");
  const env = parseEnv(takeAll(args, "--env"));
  const volumes = parseVolumes(takeAll(args, "--volume"));
  const publish = flag(args, "--publish");
  const noDefaultEnv = flag(args, "--no-default-env");

  if (args.length > 0) {
    throw new Error(`Unknown arguments: ${args.join(" ")}`);
  }
  if (!image) throw new Error("--image is required");
  if (!service) throw new Error("--service is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  assertSlug(service, "service");

  const yaml = render({
    image,
    service,
    port,
    env,
    volumes,
    publish,
    healthPath,
    defaultEnv: !noDefaultEnv,
  });

  if (output && output !== "-") {
    const target = resolve(output);
    if (!existsSync(dirname(target))) {
      throw new Error(`Output directory does not exist: ${dirname(target)}`);
    }
    writeFileSync(target, yaml);
  } else {
    process.stdout.write(yaml);
  }

  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = 64;
}
