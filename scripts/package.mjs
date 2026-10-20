import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phpVersion = process.env.PHP_VERSION ?? "8.3.32";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;

const windowsZip = `php-${phpVersion}-nts-Win32-vs16-x64.zip`;
const windowsUrl = `https://windows.php.net/downloads/releases/archives/${windowsZip}`;
const staticBase = "https://dl.static-php.dev/static-php-cli/common";

const targets = {
  win32: {
    archiveType: "zip",
    command: ".\\php.exe",
    copyExtractedRoot: true,
    upstreams: [{ name: windowsZip, url: windowsUrl }],
    expected: ["php.exe", "php-cgi.exe"],
  },
  linux: {
    archiveType: "tar.gz",
    command: "./php",
    upstreams: [
      { name: `php-${phpVersion}-fpm-linux-x86_64.tar.gz`, url: `${staticBase}/php-${phpVersion}-fpm-linux-x86_64.tar.gz` },
      { name: `php-${phpVersion}-cli-linux-x86_64.tar.gz`, url: `${staticBase}/php-${phpVersion}-cli-linux-x86_64.tar.gz` },
    ],
    expected: ["php", "php-fpm"],
  },
  darwin: {
    archiveType: "tar.gz",
    command: "./php",
    upstreams: [
      { name: `php-${phpVersion}-fpm-macos-x86_64.tar.gz`, url: `${staticBase}/php-${phpVersion}-fpm-macos-x86_64.tar.gz` },
      { name: `php-${phpVersion}-cli-macos-x86_64.tar.gz`, url: `${staticBase}/php-${phpVersion}-cli-macos-x86_64.tar.gz` },
    ],
    expected: ["php", "php-fpm"],
  },
};

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

function versionedAssetName(version, platform, archiveType) {
  return `lasso-php-${version}-${platform}.${archiveType === "zip" ? "zip" : "tar.gz"}`;
}

async function download(url, destination) {
  if (existsSync(destination)) {
    return;
  }

  console.log(`[lasso-php] downloading ${url}`);
  const response = await fetch(url, {
    headers: { "user-agent": "service-lasso-lasso-php-packager" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function compressPackage(packageRoot, outputPath, archiveType) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  if (archiveType === "zip") {
    run("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${JSON.stringify(packageRoot)}, ${JSON.stringify(outputPath)})`,
    ]);
    return outputPath;
  }

  run("tar", ["-czf", outputPath, "-C", packageRoot, "."]);
  return outputPath;
}

export async function packagePhp(platform = targetPlatform, version = phpVersion) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform: ${platform}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected PHP version like "8.3.32", got "${version}".`);
  }

  const vendorRoot = path.join(repoRoot, "vendor", version, platform);
  const outputRoot = path.join(repoRoot, "output", "package", version, platform);
  const payloadRoot = path.join(outputRoot, "payload");
  const extractRoot = path.join(outputRoot, "extract");
  const assetName = versionedAssetName(version, platform, target.archiveType);
  const outputPath = path.join(repoRoot, "dist", assetName);

  await mkdir(vendorRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(payloadRoot, { recursive: true });
  await mkdir(extractRoot, { recursive: true });

  for (const upstream of target.upstreams) {
    const archivePath = path.join(vendorRoot, upstream.name);
    await download(upstream.url, archivePath);

    if (target.copyExtractedRoot) {
      run("tar", ["-xf", archivePath, "-C", extractRoot]);
    } else {
      run("tar", ["-xzf", archivePath, "-C", payloadRoot]);
    }
  }

  if (target.copyExtractedRoot) {
    await cp(extractRoot, payloadRoot, { recursive: true });
  }

  for (const expected of target.expected) {
    if (!existsSync(path.join(payloadRoot, expected))) {
      throw new Error(`Expected PHP artifact "${expected}" was not found in ${payloadRoot}`);
    }
  }

  if (target.archiveType !== "zip") {
    for (const expected of target.expected) {
      await chmod(path.join(payloadRoot, expected), 0o755);
    }
  }

  await writeFile(
    path.join(payloadRoot, "SERVICE-LASSO-PACKAGE.json"),
    `${JSON.stringify(
      {
        serviceId: "php",
        phpVersion: version,
        upstream: {
          windows: platform === "win32" ? { asset: windowsZip, url: windowsUrl } : undefined,
          staticPhp: platform === "win32" ? undefined : target.upstreams.map((upstream) => upstream.name),
        },
        packagedBy: "service-lasso/lasso-php",
        platform,
        arch: "amd64",
        command: target.command,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await compressPackage(payloadRoot, outputPath, target.archiveType);
  console.log(`[lasso-php] packaged ${outputPath}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packagePhp();
}
