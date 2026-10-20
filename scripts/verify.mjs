import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packagePhp } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.env.TARGET_PLATFORM ?? process.platform;
const phpVersion = process.env.PHP_VERSION ?? "8.3.32";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

const artifact = await packagePhp(platform, phpVersion);
const verifyRoot = path.join(repoRoot, "output", "verify", phpVersion, platform);
const serviceRoot = path.join(verifyRoot, "service");
const extractRoot = path.join(serviceRoot, ".state", "extracted", "current");
const serviceManifest = JSON.parse(await readFile(path.join(repoRoot, "service.json"), "utf8"));
const command = serviceManifest.artifact.platforms[platform].command;
const binaryPath = path.resolve(extractRoot, command);

if (serviceManifest.id !== "php" || serviceManifest.version !== phpVersion) {
  throw new Error(`Unexpected service manifest identity: ${JSON.stringify({ id: serviceManifest.id, version: serviceManifest.version })}`);
}

if (serviceManifest.role !== "provider") {
  throw new Error(`PHP service.json must declare role "provider", got ${JSON.stringify(serviceManifest.role)}`);
}

if (serviceManifest.provides?.php !== phpVersion) {
  throw new Error(`PHP service.json must provide php ${phpVersion}, got ${JSON.stringify(serviceManifest.provides)}`);
}

await rm(verifyRoot, { recursive: true, force: true });
await mkdir(extractRoot, { recursive: true });
run("tar", ["-xf", artifact, "-C", extractRoot]);

const metadataPath = path.join(extractRoot, "SERVICE-LASSO-PACKAGE.json");
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (
  metadata.serviceId !== "php" ||
  metadata.phpVersion !== phpVersion ||
  metadata.packagedBy !== "service-lasso/lasso-php" ||
  metadata.platform !== platform
) {
  throw new Error(`Unexpected package metadata: ${JSON.stringify(metadata)}`);
}

run(binaryPath, ["-v"]);

if (platform === "win32") {
  const cgiPath = path.join(extractRoot, "php-cgi.exe");
  if (!existsSync(cgiPath)) {
    throw new Error(`Expected php-cgi.exe was not found in ${extractRoot}`);
  }
  run(cgiPath, ["-v"]);
} else {
  const fpmPath = path.join(extractRoot, "php-fpm");
  if (!existsSync(fpmPath)) {
    throw new Error(`Expected php-fpm was not found in ${extractRoot}`);
  }
  run(fpmPath, ["-v"]);
}

console.log("[lasso-php] verification passed");
