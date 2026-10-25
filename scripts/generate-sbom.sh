#!/usr/bin/env bash
# Generate CycloneDX 1.6 JSON SBOMs for npm lockfiles and Python packages.
# Unsigned. Cosign signing happens in .github/workflows/sbom.yml on cli-v* tags only.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${SBOM_DIR:-$root/dist/sbom}"
mkdir -p "$out" "$root/.tmp/sbom-npx"
export PIP_DISABLE_PIP_VERSION_CHECK=1

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$node_major" -lt 22 ]; then
  echo "Node 22+ is required (found $(node -v))." >&2
  exit 1
fi

# Official CycloneDX generator. Copy the lockfile into an empty directory so a
# stale node_modules (npm ls ELSPROBLEMS) cannot poison --package-lock-only.
generate_npm() {
  local manifest="$1"
  local dest="$2"
  local dir lock tmp
  dir="$(cd "$(dirname "$manifest")" && pwd)"
  lock="$dir/package-lock.json"
  if [ ! -f "$lock" ]; then
    echo "Missing $lock" >&2
    exit 1
  fi
  tmp="$(mktemp -d)"
  echo "SBOM npm: $dir -> $dest"
  cp "$dir/package.json" "$lock" "$tmp/"
  # Run npx from the repo, not $tmp: otherwise npx's node_modules collide with
  # npm ls --package-lock-only against this lockfile.
  npx --yes --prefix "$root/.tmp/sbom-npx" @cyclonedx/cyclonedx-npm@4 \
    --package-lock-only \
    --ignore-npm-errors \
    --spec-version 1.6 \
    --output-format JSON \
    --output-file "$dest" \
    "$tmp/package.json"
  rm -rf "$tmp"
}

ensure_cyclonedx_py() {
  local tool="$root/.tmp/sbom-tools"
  if [ ! -x "$tool/bin/cyclonedx-py" ]; then
    python3 -m venv "$tool"
    "$tool/bin/python" -m pip install -q --upgrade pip
    "$tool/bin/python" -m pip install -q "cyclonedx-bom>=5,<7"
  fi
}

generate_python() {
  local project_dir="$1"
  local dest="$2"
  local tool="$root/.tmp/sbom-tools"
  local pkg_venv="$root/.tmp/sbom-pkg-$(basename "$project_dir")"
  echo "SBOM python: $project_dir -> $dest"
  ensure_cyclonedx_py
  rm -rf "$pkg_venv"
  python3 -m venv "$pkg_venv"
  "$pkg_venv/bin/python" -m pip install -q --upgrade pip
  "$pkg_venv/bin/python" -m pip install -q "$project_dir"
  # Freeze the product environment without pip/setuptools/wheel or the BOM tool.
  "$pkg_venv/bin/python" -m pip freeze \
    --exclude pip --exclude setuptools --exclude wheel \
    > "$pkg_venv/requirements.txt"
  "$tool/bin/cyclonedx-py" requirements \
    --pyproject "$project_dir/pyproject.toml" \
    --mc-type library \
    --spec-version 1.6 \
    --output-format JSON \
    --output-file "$dest" \
    "$pkg_venv/requirements.txt"
}

generate_npm "$root/package.json" "$out/sbom-npm.cdx.json"
generate_npm "$root/packages/cli/package.json" "$out/sbom-cli.cdx.json"
generate_python "$root/packages/python-secrets" "$out/sbom-python-secrets.cdx.json"
generate_python "$root/packages/hermes-memory" "$out/sbom-hermes-memory.cdx.json"

python3 - "$out" <<'PY'
import json, sys
from pathlib import Path
out = Path(sys.argv[1])
required = [
    "sbom-npm.cdx.json",
    "sbom-cli.cdx.json",
    "sbom-python-secrets.cdx.json",
    "sbom-hermes-memory.cdx.json",
]
for name in required:
    path = out / name
    data = json.loads(path.read_text())
    if data.get("bomFormat") != "CycloneDX":
        raise SystemExit(f"{name} is not CycloneDX")
    if not str(data.get("specVersion", "")).startswith("1."):
        raise SystemExit(f"{name} missing specVersion")
    print(f"ok {name} components={len(data.get('components') or [])}")
PY

echo "Wrote SBOMs under $out"
