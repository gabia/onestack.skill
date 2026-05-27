---
name: onestack
description: Deploy and operate user-coded projects through Dokploy using the local @dokploy/cli and the Onestack Dokploy console at http://211.47.74.86:3000. Use when the user asks to deploy, publish, redeploy, configure domains, manage environment variables, provision Dokploy apps/compose services/databases, inspect deployment status, or make an agent automatically ship a local coding project.
---

# Onestack

## Overview

Use Dokploy as the default deployment control plane for local projects. Prefer the CLI for repeatable work, use JSON output for parsing, and open the Dokploy console only when the CLI cannot complete a step or an API key must be created manually.

Default console URL:

```bash
http://211.47.74.86:3000
```

## Core Rules

- Run commands from the project root unless a different path is explicit.
- Prefer `dokploy ... --json` and parse the result instead of relying on formatted text.
- Never print API tokens, database passwords, `.env` values, or full secret-bearing command lines in the final response.
- Do not delete applications, databases, domains, volumes, or deployments without explicit user approval.
- If the project already ships a `docker-compose.yml`/`compose.yml` and intends to stay compose-managed, keep Compose as the first choice.
- Otherwise prefer Dokploy `application` deployments so users do not need local Docker.
- For git-provider-disabled deployments, prefer `application + drop` over local Docker builds.
- Use `application + drop + static` for prebuilt static assets.
- Use `application + drop + nixpacks` plus `publishDirectory` for frontend source builds that should be served as static output.
- Use `application + drop + nixpacks` or `application + drop + dockerfile` for server apps.
- Prefer Dokploy managed databases for app-plus-database projects. Do not default to bundling the database into app Compose files.
- Use raw Compose for image-based or otherwise self-contained Compose stacks. Do not assume raw Compose can handle local build-context Compose when git/source access is unavailable.
- Do not depend on GitHub/GitLab/Bitbucket/Gitea providers unless the user explicitly says that provider is available.
- If a generated CLI mutation rejects irrelevant missing options, use the Dokploy HTTP API or tRPC endpoint directly with the same authenticated session or API key.
- Register the domain before queueing the deploy so Traefik labels are present on the created container. If a domain is added after a successful deploy, redeploy the compose.
- Default public domains must use `*.onestack.run`, usually `<app-slug>.onestack.run`. Do not use `*.traefik.me` except as an explicit temporary diagnostic fallback.
- Before git-backed deployments, inspect git status. Git-backed Dokploy deploys from remote sources; uncommitted or unpushed local changes usually are not deployed.
- Before any remote Dokploy lookup, deployment, image push for deployment, or resource mutation, run the Dokploy auth preflight. If no API key or persisted CLI auth is available, ask for a Dokploy API key or tell the user how to create one in the console. Do not invent credentials.

## Fast Start

1. Inspect the project:

```bash
node .agents/skills/onestack/scripts/inspect_project.mjs .
```

2. Install or verify the CLI, then run the required Dokploy auth preflight:

```bash
DOKPLOY_URL=http://211.47.74.86:3000 \
  bash .agents/skills/onestack/scripts/bootstrap_dokploy.sh --require-auth
```

If the preflight reports missing authentication, stop before remote Dokploy work and ask the user for `DOKPLOY_API_KEY` or give console API-key creation steps.

3. Read the command guide when creating or updating Dokploy resources:

```bash
sed -n '1,220p' .agents/skills/onestack/references/dokploy-cli.md
```

## Deployment Workflow

1. Analyze the local project with `inspect_project.mjs`.
2. Authenticate with `bootstrap_dokploy.sh --require-auth`; stop and request a Dokploy API key if the preflight fails.
3. Choose the deployment mode:
   - Use existing `docker-compose.yml`/`compose.yml` first when present.
   - For Compose, prefer raw Compose only when the file is image-based or otherwise self-contained.
   - For frontend source projects without a server framework, prefer `application + drop + nixpacks` with `publishDirectory`.
   - For prebuilt static directories, prefer `application + drop + static`.
   - For server apps, prefer `application + drop + nixpacks` unless the repository already relies on a curated Dockerfile build.
   - For app-plus-database systems, create the app as an `application`, create the database as a managed Dokploy service, and connect over the internal service hostname.
   - Use local Docker image builds only as an explicit fallback when the validated Dokploy-native paths cannot fit the project.
4. Discover or create the Dokploy project and environment:
   - Use `dokploy project search --name <name> --json`.
   - Use `dokploy project create --name <name> --json` only when no suitable project exists.
   - Use `dokploy environment search --projectId <id> --name production --json`, then create it if needed.
5. Configure the chosen resource:
   - For `application`, save build type, environment, and domain before the upload or deploy trigger.
   - For Compose, use `expose` plus a Dokploy domain route instead of relying on externally reachable host ports.
   - Register `<app-slug>.onestack.run` with `domainType=application` or `domainType=compose` and the app's internal port.
6. Deploy:
   - For `application + drop`, upload a ZIP to `application.dropDeployment`.
   - For Compose, deploy with `dokploy compose deploy --composeId <id> --json` or the helper script.
7. Wait for the queue and verify:
   - `dokploy deployment queue-list --json`
   - `dokploy project all --json` and inspect `applicationStatus` or `composeStatus`
   - `curl http://<app-slug>.onestack.run/` and any health endpoint.
   - If the public host returns `502` immediately after the resource reports `done`, retry for a short window before declaring failure.

## Live-Validated Paths

- `application + drop + static`: validated against a live Dokploy instance with a ZIP upload and public `200 OK`.
- `application + drop + nixpacks` plus managed Postgres: validated end to end with a live Dokploy Postgres service and successful DB-backed HTTP response.
- `compose + raw`: validated for an image-based multi-service Compose stack with public `200 OK`.

These are the preferred paths for Onestack until a different path is revalidated.

## Raw Image Compose Path

Use this path only when Compose must remain the deployment model and the validated `application + drop` paths do not fit.

1. Build and push a Linux image to a registry the Dokploy host can pull. For temporary deployments, `ttl.sh/<name>:24h` works but expires; use a durable registry for production.

```bash
TAG="ttl.sh/<app-slug>-$(date +%s):24h"
docker buildx build --builder desktop-linux --platform linux/amd64 -t "$TAG" --push .
```

If a custom `buildx` builder fails with CA/TLS errors, try the Docker Desktop/default builder. Confirm the image exists with `docker buildx imagetools inspect "$TAG"`.

2. Render raw compose from the image:

```bash
node .agents/skills/onestack/scripts/render_image_compose.mjs \
  --image "$TAG" \
  --service "<service-name>" \
  --port 3000 \
  --health-path /api/health \
  --volume "<app-slug>-data:/app/data" \
  --output /tmp/<app-slug>.compose.yml
```

3. Create/update Dokploy resources, register `<app-slug>.onestack.run`, deploy, and wait:

```bash
node .agents/skills/onestack/scripts/deploy_raw_compose.mjs \
  --project "<project-name>" \
  --app-name "<app-slug>" \
  --compose-file /tmp/<app-slug>.compose.yml \
  --service "<service-name>" \
  --port 3000
```

The helper uses direct Dokploy TRPC calls for commands where the generated CLI can return misleading `400` errors for GET input wrapping.

## Domain Rules

- Default host: `<app-slug>.onestack.run`.
- `*.onestack.run` wildcard DNS is already registered for Onestack.
- Create the domain before deployment. Dokploy injects Traefik labels into the converted compose; running containers do not receive new labels until redeployed.
- A healthy container with `404 page not found` from the public host usually means Traefik did not match the host. Check `domain.byComposeId`, `compose.getConvertedCompose`, and redeploy after domain registration.
- A fresh deployment can briefly return `502 Bad Gateway` before the container is ready behind Traefik or Cloudflare. Recheck before treating it as a hard failure.
- Use `certificateType=none` unless HTTPS is explicitly configured for the route; Cloudflare or upstream TLS may still serve HTTPS depending on the wildcard setup.

## Authentication

Use the default URL unless the user names another server:

```bash
export DOKPLOY_URL="http://211.47.74.86:3000"
export DOKPLOY_API_KEY="<token from Dokploy dashboard>"
bash .agents/skills/onestack/scripts/bootstrap_dokploy.sh
```

The CLI also accepts `DOKPLOY_AUTH_TOKEN`. `dokploy auth -u <url> -t <token>` persists credentials for later CLI calls, but environment variables are preferable in automation because they make the target server explicit.

For deployment automation, verify auth before remote work:

```bash
bash .agents/skills/onestack/scripts/bootstrap_dokploy.sh --require-auth
```

`--require-auth` succeeds with a supplied `DOKPLOY_API_KEY`/`DOKPLOY_AUTH_TOKEN` or an existing Dokploy CLI auth config. If it fails, ask the user for a Dokploy API key or explain how to create one in the Dokploy console.

## References

Load these only when needed:

- `references/dokploy-cli.md`: practical Dokploy CLI commands, deployment recipes, and status checks.
- `scripts/inspect_project.mjs`: local project detector that outputs JSON for deployment planning.
- `scripts/bootstrap_dokploy.sh`: CLI installer/authenticator/verifier.
- `scripts/render_image_compose.mjs`: renders image-based raw Docker Compose YAML.
- `scripts/deploy_raw_compose.mjs`: creates/updates raw compose, registers `<app-slug>.onestack.run`, deploys, and waits for status.
