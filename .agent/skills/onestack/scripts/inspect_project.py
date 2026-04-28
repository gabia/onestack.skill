#!/usr/bin/env python3
"""Inspect a local project and emit deployment hints for Dokploy."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


COMPOSE_FILES = ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml")
ENV_FILE_NAMES = (
    ".env",
    ".env.example",
    ".env.production",
    ".env.local",
    ".env.sample",
)


def run(cmd: list[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return result.stdout.strip()


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def detect_package_manager(root: Path) -> str | None:
    lockfiles = (
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
        ("bun.lockb", "bun"),
        ("bun.lock", "bun"),
    )
    for filename, manager in lockfiles:
        if (root / filename).exists():
            return manager
    return None


def package_info(root: Path) -> dict[str, Any] | None:
    package_path = root / "package.json"
    if not package_path.exists():
        return None
    package = read_json(package_path)
    deps = set(package.get("dependencies", {})) | set(package.get("devDependencies", {}))
    scripts = package.get("scripts", {})
    frameworks = []
    for name in ("next", "vite", "react", "vue", "svelte", "astro", "nuxt", "express", "fastify", "nestjs"):
        if name in deps or (name == "nestjs" and "@nestjs/core" in deps):
            frameworks.append(name)
    return {
        "packageManager": detect_package_manager(root),
        "scripts": scripts,
        "frameworks": frameworks,
        "hasBuildScript": "build" in scripts,
        "hasStartScript": "start" in scripts,
    }


def docker_expose_port(root: Path) -> int | None:
    dockerfile = root / "Dockerfile"
    if not dockerfile.exists():
        return None
    try:
        text = dockerfile.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    match = re.search(r"(?im)^\s*EXPOSE\s+(\d+)", text)
    return int(match.group(1)) if match else None


def git_info(root: Path) -> dict[str, Any]:
    inside = run(["git", "rev-parse", "--is-inside-work-tree"], root) == "true"
    if not inside:
        return {"inside": False}

    status = run(["git", "status", "--porcelain"], root) or ""
    branch = run(["git", "branch", "--show-current"], root)
    remote = run(["git", "remote", "get-url", "origin"], root)
    upstream = run(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root)

    ahead = behind = None
    if upstream:
        counts = run(["git", "rev-list", "--left-right", "--count", f"{upstream}...HEAD"], root)
        if counts:
            left, right = counts.split()
            behind, ahead = int(left), int(right)

    return {
        "inside": True,
        "branch": branch,
        "remote": remote,
        "upstream": upstream,
        "dirty": bool(status),
        "statusEntries": status.splitlines()[:50],
        "ahead": ahead,
        "behind": behind,
    }


def infer_recommendation(root: Path, pkg: dict[str, Any] | None, compose_file: str | None) -> dict[str, Any]:
    if compose_file:
        return {
            "dokployResource": "compose",
            "composePath": compose_file,
            "composeType": "docker-compose",
            "reason": "compose file detected",
        }

    exposed = docker_expose_port(root)
    if (root / "Dockerfile").exists():
        return {
            "dokployResource": "application",
            "buildType": "dockerfile",
            "dockerfile": "Dockerfile",
            "dockerContextPath": ".",
            "portHint": exposed,
            "reason": "Dockerfile detected",
        }

    if pkg:
        frameworks = set(pkg.get("frameworks", []))
        if "vite" in frameworks or "astro" in frameworks or "vue" in frameworks or "svelte" in frameworks:
            return {
                "dokployResource": "application",
                "buildType": "static",
                "publishDirectory": "dist",
                "isStaticSpa": "react" in frameworks or "vue" in frameworks or "svelte" in frameworks,
                "portHint": 80,
                "reason": "frontend build tooling detected",
            }
        if "next" in frameworks:
            return {
                "dokployResource": "application",
                "buildType": "nixpacks",
                "portHint": 3000,
                "reason": "Next.js app detected without Dockerfile",
            }
        return {
            "dokployResource": "application",
            "buildType": "nixpacks",
            "portHint": int(os.environ.get("PORT", "3000")),
            "reason": "Node package detected without Dockerfile",
        }

    if (root / "requirements.txt").exists() or (root / "pyproject.toml").exists():
        return {
            "dokployResource": "application",
            "buildType": "nixpacks",
            "portHint": int(os.environ.get("PORT", "8000")),
            "reason": "Python project detected without Dockerfile",
        }

    return {
        "dokployResource": "unknown",
        "reason": "No Dockerfile, compose file, package.json, requirements.txt, or pyproject.toml detected",
    }


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not root.exists():
        print(json.dumps({"error": f"Path does not exist: {root}"}, indent=2), file=sys.stderr)
        return 2

    compose_file = next((name for name in COMPOSE_FILES if (root / name).exists()), None)
    pkg = package_info(root)
    env_files = [name for name in ENV_FILE_NAMES if (root / name).exists()]

    result = {
        "root": str(root),
        "name": root.name,
        "git": git_info(root),
        "detectedFiles": {
            "dockerfile": "Dockerfile" if (root / "Dockerfile").exists() else None,
            "compose": compose_file,
            "packageJson": "package.json" if (root / "package.json").exists() else None,
            "requirementsTxt": "requirements.txt" if (root / "requirements.txt").exists() else None,
            "pyprojectToml": "pyproject.toml" if (root / "pyproject.toml").exists() else None,
            "envFiles": env_files,
        },
        "node": pkg,
        "recommendation": infer_recommendation(root, pkg, compose_file),
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
