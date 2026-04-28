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
- Before deploying, inspect git status. Dokploy deploys from remote sources; uncommitted or unpushed local changes usually are not deployed.
- If authentication is missing, ask for a Dokploy API key or tell the user how to create one in the console. Do not invent credentials.

## Fast Start

1. Inspect the project:

```bash
python .agent/skills/onestack/scripts/inspect_project.py .
```

2. Install or verify the CLI, then authenticate:

```bash
DOKPLOY_URL=http://211.47.74.86:3000 DOKPLOY_API_KEY="$DOKPLOY_API_KEY" \
  bash .agent/skills/onestack/scripts/bootstrap_dokploy.sh
```

3. Read the command guide when creating or updating Dokploy resources:

```bash
sed -n '1,220p' .agent/skills/onestack/references/dokploy-cli.md
```

## Deployment Workflow

1. Analyze the local project with `inspect_project.py`.
2. Confirm the remote source:
   - Require a usable git remote and branch for application or compose deployments.
   - If there are uncommitted changes, ask whether to commit/push before deploying.
   - If there are unpushed commits, push them or confirm they are intentionally excluded.
3. Authenticate with `bootstrap_dokploy.sh`.
4. Discover or create the Dokploy project and environment:
   - Use `dokploy project search --name <name> --json`.
   - Use `dokploy project create --name <name> --json` only when no suitable project exists.
   - Use `dokploy environment search --projectId <id> --name production --json`, then create it if needed.
5. Choose the Dokploy resource type:
   - Use `compose` when a root `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml` exists.
   - Use `application` with `buildType=dockerfile` when a `Dockerfile` exists.
   - Use `application` with `buildType=static` for Vite/SPA builds with a publish directory such as `dist`.
   - Use `application` with `buildType=nixpacks` or `railpack` for common Node/Python apps without a Dockerfile.
6. Configure source, build type, environment variables, ports, and domains.
7. Deploy with `dokploy application deploy --applicationId <id> --json` or `dokploy compose deploy --composeId <id> --json`.
8. Verify with `dokploy application one`, `dokploy compose one`, and `dokploy deployment all-by-type`.

## Authentication

Use the default URL unless the user names another server:

```bash
export DOKPLOY_URL="http://211.47.74.86:3000"
export DOKPLOY_API_KEY="<token from Dokploy dashboard>"
bash .agent/skills/onestack/scripts/bootstrap_dokploy.sh
```

The CLI also accepts `DOKPLOY_AUTH_TOKEN`. `dokploy auth -u <url> -t <token>` persists credentials for later CLI calls, but environment variables are preferable in automation because they make the target server explicit.

## References

Load these only when needed:

- `references/dokploy-cli.md`: practical Dokploy CLI commands, deployment recipes, and status checks.
- `scripts/inspect_project.py`: local project detector that outputs JSON for deployment planning.
- `scripts/bootstrap_dokploy.sh`: CLI installer/authenticator/verifier.

**Examples from other skills:**
- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
