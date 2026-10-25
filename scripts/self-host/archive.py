#!/usr/bin/env python3
"""Validate backup contents before a restore can touch the target database."""
import hashlib
import json
import pathlib
import re
import sys
import tarfile


def safe_members(archive):
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError(f"Unsafe archive member: {member.name}")
    return archive.getmembers()


def extract(source, destination):
    with tarfile.open(source, "r:gz") as archive:
        archive.extractall(destination, members=safe_members(archive), filter="data")


def validate(root):
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("version") != 1 or manifest.get("encryption_master_key_included") is not False:
        raise ValueError("Unsupported manifest or master-key separation not declared")
    components = manifest.get("components", [])
    if "postgres" not in components:
        raise ValueError("Backup does not contain Postgres")
    for component, filename, key in [
        ("postgres", "db/postgres.dump", "postgres_dump_sha256"),
        ("storage", "storage/files.tar", "storage_tar_sha256"),
    ]:
        path = root / filename
        if component not in components:
            if path.exists():
                raise ValueError(f"Undeclared component: {component}")
            continue
        expected = manifest.get(key, "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise ValueError(f"Missing checksum: {filename}")
        with path.open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if actual != expected:
            raise ValueError(f"Checksum mismatch: {filename}")
    if "storage" in components:
        with tarfile.open(root / "storage/files.tar") as archive:
            safe_members(archive)
    print("Backup manifest and component checksums verified")


def inventory(source, destination):
    # Never copy values, comments or continuation lines: any may contain secrets.
    names = set(re.findall(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=", source.read_text(), re.M))
    destination.write_text("".join(f"{name}=<redacted>\n" for name in sorted(names)), newline="\n")


if __name__ == "__main__":
    try:
        mode, *args = sys.argv[1:]
        if mode == "extract":
            extract(*map(pathlib.Path, args))
        elif mode == "validate":
            validate(pathlib.Path(args[0]))
        elif mode == "inventory":
            inventory(*map(pathlib.Path, args))
        else:
            raise ValueError("Unknown archive operation")
    except (ValueError, OSError, tarfile.TarError) as error:
        sys.exit(str(error))
