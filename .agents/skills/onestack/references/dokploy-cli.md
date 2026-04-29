# Dokploy CLI Guide

Use this reference when creating, updating, deploying, or inspecting Dokploy resources for Onestack.

## CLI Setup

Install or update:

```bash
npm install -g @dokploy/cli@latest
```

Authenticate against the default Onestack console:

```bash
export DOKPLOY_URL="http://211.47.74.86:3000"
export DOKPLOY_API_KEY="<api key>"
dokploy auth -u "$DOKPLOY_URL" -t "$DOKPLOY_API_KEY"
```

The CLI accepts either `DOKPLOY_API_KEY` or `DOKPLOY_AUTH_TOKEN` together with `DOKPLOY_URL`.

Before discovery, deployment, or resource changes, run the auth preflight and stop to request a Dokploy API key if it fails:

```bash
bash .agents/skills/onestack/scripts/bootstrap_dokploy.sh --require-auth
```

## Discovery Commands

```bash
dokploy project all --json
dokploy project search --name "<project>" --json
dokploy environment search --projectId "<projectId>" --name "production" --json
dokploy application search --projectId "<projectId>" --environmentId "<environmentId>" --name "<app>" --json
dokploy compose search --projectId "<projectId>" --environmentId "<environmentId>" --name "<app>" --json
dokploy server all --json
```

Prefer search before create. Use existing resources when names and ownership match the user's intent.

Some generated CLI GET commands can return `400` even when the API is healthy because the underlying TRPC input wrapper differs by Dokploy version. For compose/domain checks, prefer the helper scripts in `scripts/` or direct TRPC calls when the CLI behaves this way.

## Project And Environment

Create a project:

```bash
dokploy project create --name "<project>" --description "<description>" --json
```

Create an environment:

```bash
dokploy environment create \
  --name "production" \
  --description "Production" \
  --projectId "<projectId>" \
  --json
```

## Application Deployment

Create an application:

```bash
dokploy application create \
  --name "<app>" \
  --appName "<app-slug>" \
  --description "<description>" \
  --environmentId "<environmentId>" \
  --json
```

Attach a plain git remote:

```bash
dokploy application save-git-provider \
  --applicationId "<applicationId>" \
  --customGitUrl "<git-url>" \
  --customGitBranch "<branch>" \
  --customGitBuildPath "." \
  --json
```

Configure build type:

```bash
dokploy application save-build-type \
  --applicationId "<applicationId>" \
  --buildType dockerfile \
  --dockerfile Dockerfile \
  --dockerContextPath "." \
  --json
```

Other common build types:

```bash
dokploy application save-build-type --applicationId "<id>" --buildType nixpacks --json
dokploy application save-build-type --applicationId "<id>" --buildType railpack --json
dokploy application save-build-type --applicationId "<id>" --buildType static --publishDirectory dist --isStaticSpa --json
```

Save runtime environment variables. Do not print secret values in chat or logs:

```bash
dokploy application save-environment \
  --applicationId "<applicationId>" \
  --env "$ENV_TEXT" \
  --json
```

Create a domain route:

```bash
dokploy domain create \
  --host "<domain>" \
  --path "/" \
  --port "<container-port>" \
  --https \
  --applicationId "<applicationId>" \
  --certificateType letsencrypt \
  --domainType application \
  --json
```

Deploy:

```bash
dokploy application deploy \
  --applicationId "<applicationId>" \
  --title "Deploy from agent" \
  --description "<git branch and commit>" \
  --json
```

## Compose Deployment

Compose is the default deployment path for Onestack. Prefer it over application deployments unless the project is a pure static frontend or the user explicitly asks for another mode.

Create a compose resource:

```bash
dokploy compose create \
  --name "<app>" \
  --appName "<app-slug>" \
  --description "<description>" \
  --environmentId "<environmentId>" \
  --composeType docker-compose \
  --composeFile "$(cat docker-compose.yml)" \
  --json
```

### Raw Image Compose

Use raw image compose when git providers are unavailable. Build and push the image first:

```bash
TAG="ttl.sh/<app-slug>-$(date +%s):24h"
docker buildx build --builder desktop-linux --platform linux/amd64 -t "$TAG" --push .
docker buildx imagetools inspect "$TAG"
```

If a custom buildx builder fails with TLS/CA verification while pulling base images, retry with the Docker Desktop/default builder. If Docker is not running locally, start Docker Desktop before building.

Render an image-only compose file. Prefer `expose` and a Dokploy domain route; host `ports` can be blocked externally or conflict with other services.

```bash
node .agents/skills/onestack/scripts/render_image_compose.mjs \
  --image "$TAG" \
  --service "<service-name>" \
  --port "<container-port>" \
  --health-path /api/health \
  --volume "<app-slug>-data:/app/data" \
  --output /tmp/<app-slug>.compose.yml
```

Create/update the raw compose, register the domain, deploy, and wait:

```bash
node .agents/skills/onestack/scripts/deploy_raw_compose.mjs \
  --project "<project>" \
  --app-name "<app-slug>" \
  --compose-file /tmp/<app-slug>.compose.yml \
  --service "<service-name>" \
  --port "<container-port>"
```

The helper creates `<app-slug>.onestack.run` unless `--host` is supplied. It creates the domain before queueing the deployment so Traefik labels are present on first container creation.

### Git-Backed Compose

Use this only when the user confirms the git provider/source is available. Update source and compose path for git-backed compose deployments:

```bash
dokploy compose update \
  --composeId "<composeId>" \
  --sourceType git \
  --customGitUrl "<git-url>" \
  --customGitBranch "<branch>" \
  --composePath "docker-compose.yml" \
  --json
```

Deploy:

```bash
dokploy compose deploy \
  --composeId "<composeId>" \
  --title "Deploy raw image compose" \
  --description "<image tag or source revision>" \
  --json
```

## Domain Routing

Default public domains must use the Onestack wildcard:

```bash
<app-slug>.onestack.run
```

Create the domain before deploying compose:

```bash
dokploy domain create \
  --host "<app-slug>.onestack.run" \
  --path "/" \
  --port "<container-port>" \
  --composeId "<composeId>" \
  --serviceName "<service-name>" \
  --domainType compose \
  --certificateType none \
  --json
```

If the domain is added after a successful deployment, redeploy the compose. Dokploy adds Traefik labels to the converted compose, but already-running containers do not receive new labels until they are recreated.

Diagnosis for `404 page not found`:

- If the container is `running` and `healthy`, the app is probably fine.
- Check `domain.byComposeId` and `compose.getConvertedCompose`; the host should appear in `traefik.http.routers.*.rule`.
- If the converted compose has the labels but the public host still returns 404, redeploy the compose to recreate the container with the labels.

## Databases

Create managed services only when the application needs them and the user approves generated credentials.

```bash
dokploy postgres create --name "<name>" --appName "<slug>" --databaseName "<db>" --databaseUser "<user>" --databasePassword "<password>" --environmentId "<environmentId>" --json
dokploy mysql create --name "<name>" --appName "<slug>" --databaseName "<db>" --databaseUser "<user>" --databasePassword "<password>" --databaseRootPassword "<root-password>" --environmentId "<environmentId>" --json
dokploy redis create --name "<name>" --appName "<slug>" --databasePassword "<password>" --environmentId "<environmentId>" --json
dokploy mongo create --name "<name>" --appName "<slug>" --databaseUser "<user>" --databasePassword "<password>" --environmentId "<environmentId>" --json
```

Deploy or restart databases with the matching service command:

```bash
dokploy postgres deploy --postgresId "<id>" --json
dokploy mysql deploy --mysqlId "<id>" --json
dokploy redis deploy --redisId "<id>" --json
dokploy mongo deploy --mongoId "<id>" --json
```

Run `dokploy <service> deploy --help` first because generated command option names can differ between CLI versions.

## Status And Verification

Inspect the deployed resource:

```bash
dokploy application one --applicationId "<applicationId>" --json
dokploy compose one --composeId "<composeId>" --json
```

Inspect deployment history:

```bash
dokploy deployment all-by-type --id "<applicationId>" --type application --json
dokploy deployment all-by-type --id "<composeId>" --type compose --json
```

For failures, check the newest deployment item first, then use targeted commands such as:

```bash
dokploy application read-traefik-config --applicationId "<applicationId>" --json
dokploy compose get-converted-compose --composeId "<composeId>" --json
dokploy deployment queue-list --json
dokploy deployment all-centralized --json
```

## Local Project Readiness Checklist

Before deploy:

- Prefer compose. Use static only for frontend-only projects with no server/API/persistence.
- Confirm the Docker image is pushed to a registry the Dokploy host can pull.
- Confirm compose uses the correct internal service port.
- Confirm the Dokploy domain is `<app-slug>.onestack.run`.
- Confirm required env vars are present in Dokploy, not just in local `.env`.
- Confirm the app exposes the port used by the Dokploy domain route.

After deploy:

- Read the deploy command JSON response and save the resource ID in notes for the final response.
- Poll `dokploy deployment queue-list --json` until the deployment is no longer queued.
- Query `dokploy project all --json` and confirm `composeStatus` is `done`.
- Curl `http://<app-slug>.onestack.run/` and a health endpoint if one exists.
- If a domain was created after deployment, redeploy before final verification.
