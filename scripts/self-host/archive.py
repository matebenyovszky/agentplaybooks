#!/usr/bin/env python3
"""Validate backup contents before a restore can touch the target database.

Also authenticates encrypted archives. `openssl enc` has no authenticated
mode, so an archive encrypted with AES-256-CBC could be altered without the
restore noticing until the bytes were already decrypted. `seal` appends an
HMAC-SHA256 tag over the ciphertext (encrypt-then-MAC); `verify` checks it in
constant time before anything is decrypted and prints how many leading bytes
are ciphertext, so the restore can stream exactly those into openssl.

Trailer layout: ciphertext || b"APBMAC01" || salt (16 bytes) || tag (32 bytes).
The MAC key is PBKDF2-HMAC-SHA256(passphrase, b"apb-backup-mac" + salt,
310000 iterations), independent of the key openssl derives for encryption.
The passphrase is read from BACKUP_ENCRYPTION_PASSPHRASE, never argv.
"""
import hashlib
import hmac
import json
import os
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


MAC_MAGIC = b"APBMAC01"
MAC_SALT_BYTES = 16
MAC_TAG_BYTES = 32
MAC_TRAILER = len(MAC_MAGIC) + MAC_SALT_BYTES + MAC_TAG_BYTES
MAC_ITERATIONS = 310000
CHUNK = 1024 * 1024


def _mac_key(salt):
    passphrase = os.environ.get("BACKUP_ENCRYPTION_PASSPHRASE", "")
    if not passphrase:
        raise ValueError("BACKUP_ENCRYPTION_PASSPHRASE is required")
    return hashlib.pbkdf2_hmac("sha256", passphrase.encode(), b"apb-backup-mac" + salt, MAC_ITERATIONS)


def _tag(path, length, salt):
    mac = hmac.new(_mac_key(salt), MAC_MAGIC + salt, hashlib.sha256)
    remaining = length
    with path.open("rb") as stream:
        while remaining:
            chunk = stream.read(min(CHUNK, remaining))
            if not chunk:
                raise ValueError("Archive is shorter than expected")
            mac.update(chunk)
            remaining -= len(chunk)
    return mac.digest()


def seal(path):
    salt = os.urandom(MAC_SALT_BYTES)
    length = path.stat().st_size
    tag = _tag(path, length, salt)
    with path.open("ab") as stream:
        stream.write(MAC_MAGIC + salt + tag)


def verify(path):
    size = path.stat().st_size
    if size < MAC_TRAILER:
        raise ValueError("Archive has no authentication tag")
    with path.open("rb") as stream:
        stream.seek(size - MAC_TRAILER)
        trailer = stream.read(MAC_TRAILER)
    if trailer[: len(MAC_MAGIC)] != MAC_MAGIC:
        raise ValueError("Archive has no authentication tag (made before archives were sealed?)")
    salt = trailer[len(MAC_MAGIC): len(MAC_MAGIC) + MAC_SALT_BYTES]
    expected = trailer[-MAC_TAG_BYTES:]
    length = size - MAC_TRAILER
    if not hmac.compare_digest(_tag(path, length, salt), expected):
        raise ValueError("Archive authentication failed: wrong passphrase, or the archive was altered")
    print(length)


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
        elif mode == "seal":
            seal(pathlib.Path(args[0]))
        elif mode == "verify":
            verify(pathlib.Path(args[0]))
        else:
            raise ValueError("Unknown archive operation")
    except (ValueError, OSError, tarfile.TarError) as error:
        sys.exit(str(error))
