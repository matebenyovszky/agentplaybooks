import { appendFileSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const projectRef = "bydcjwxfiiolmnddzbpy";
const root = resolve(import.meta.dirname, "..");
const versions = readFileSync(join(root, "supabase", "deploy-baseline-versions.txt"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

if (versions.length === 0 || versions.some((version) => !/^\d{14}$/.test(version))) {
  throw new Error("Invalid production migration baseline.");
}
if (new Set(versions).size !== versions.length || versions.some((version, index) => index > 0 && version <= versions[index - 1])) {
  throw new Error("Production migration baseline must be unique and sorted.");
}

const cutoff = versions.at(-1);
const migrationDir = join(root, "supabase", "migrations");
const forwardFiles = readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => ({ file, version: /^([0-9]{14})/.exec(file)?.[1] }))
  .filter(({ version }) => version && version > cutoff)
  .sort((a, b) => a.version.localeCompare(b.version));

if (forwardFiles.some(({ file }) => !/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(file))) {
  throw new Error("Forward migration filenames must use <timestamp>_<snake_case>.sql.");
}
if (forwardFiles.some((entry, index) => index > 0 && entry.version === forwardFiles[index - 1].version)) {
  throw new Error("Two forward migrations have the same version.");
}

const databaseUrl = process.env.SUPABASE_DB_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error("SUPABASE_DB_URL must be a PostgreSQL URL.");
  }
  const direct = url.hostname === `db.${projectRef}.supabase.co`;
  const pooler = url.hostname.endsWith(".pooler.supabase.com") && url.username === `postgres.${projectRef}`;
  if (!direct && !pooler) {
    throw new Error(`SUPABASE_DB_URL does not identify production project ${projectRef}.`);
  }
}

const workdir = mkdtempSync(join(tmpdir(), "agentplaybooks-supabase-deploy-"));
const stagedMigrations = join(workdir, "supabase", "migrations");
mkdirSync(stagedMigrations, { recursive: true });
writeFileSync(join(workdir, "supabase", "config.toml"), 'project_id = "agentplaybooks-production-deploy"\n');
for (const version of versions) {
  writeFileSync(join(stagedMigrations, `${version}_already_applied.sql`),
    `-- Version ${version} is already in this production project's migration history.\n`);
}
for (const { file } of forwardFiles) {
  copyFileSync(join(migrationDir, file), join(stagedMigrations, basename(file)));
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `workdir=${workdir}\n`);
}
console.log(`Prepared ${versions.length} historical versions and ${forwardFiles.length} forward migrations in ${workdir}.`);
console.log(`Forward migrations: ${forwardFiles.map(({ file }) => file).join(", ") || "none"}`);
