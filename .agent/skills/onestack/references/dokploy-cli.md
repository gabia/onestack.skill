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

Update source and compose path for git-backed compose deployments:

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
  --title "Deploy from agent" \
  --description "<git branch and commit>" \
  --json
```

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
```

## Local Project Readiness Checklist

Before deploy:

- Confirm `git remote get-url origin` points to the intended repository.
- Confirm `git branch --show-current` matches the deploy branch.
- Confirm `git status --porcelain` is clean, or explicitly handle local changes.
- Confirm commits are pushed to the remote branch.
- Confirm required env vars are present in Dokploy, not just in local `.env`.
- Confirm the app exposes the port used by the Dokploy domain route.

After deploy:

- Read the deploy command JSON response and save the resource ID in notes for the final response.
- Query the application or compose resource again.
- Query deployment history and summarize the newest status.
- Provide the console URL and any public domain URL that was configured.
