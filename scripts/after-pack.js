/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function runCodesign(args) {
  execFileSync("codesign", args, {
    stdio: "pipe",
    timeout: 30000,
  });
}

function tryCodesign(targetPath, extraArgs = []) {
  try {
    runCodesign(["--force", "--sign", "-", ...extraArgs, targetPath]);
    return true;
  } catch (error) {
    const message =
      error && typeof error === "object" && "stderr" in error && error.stderr
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    console.warn(`[afterPack] Failed to sign ${targetPath}: ${message.trim()}`);
    return false;
  }
}

function isMachOBinary(filePath) {
  try {
    const output = execFileSync("file", [filePath], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: 10000,
    });
    return output.includes("Mach-O");
  } catch {
    return false;
  }
}

function collectFiles(dir, extensions) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app") || entry.name.endsWith(".framework")) {
        continue;
      }
      results.push(...collectFiles(fullPath, extensions));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name);
    const executable = (fs.statSync(fullPath).mode & 0o111) !== 0;
    if (extensions.includes(ext) || (executable && isMachOBinary(fullPath))) {
      results.push(fullPath);
    }
  }

  return results;
}

function collectBundles(dir, extension) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(extension))
    .map((entry) => path.join(dir, entry.name));
}

module.exports = async function afterPack(context) {
  if (context.packager.platform.name !== "mac") {
    return;
  }

  if (process.env.CSC_LINK || process.env.CSC_NAME) {
    console.log("[afterPack] Signing certificate detected, skipping ad-hoc fallback.");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  if (!fs.existsSync(appPath)) {
    console.warn(`[afterPack] App bundle not found at ${appPath}, skipping ad-hoc signing.`);
    return;
  }

  const contentsPath = path.join(appPath, "Contents");
  const frameworksPath = path.join(contentsPath, "Frameworks");
  const entitlements = path.join(process.cwd(), "build", "entitlements.mac.plist");

  console.log(`[afterPack] Applying ad-hoc signing fallback to ${appPath}`);

  let signed = 0;

  for (const file of collectFiles(contentsPath, [".node", ".dylib", ".so"])) {
    if (tryCodesign(file)) {
      signed += 1;
    }
  }

  for (const framework of collectBundles(frameworksPath, ".framework")) {
    if (tryCodesign(framework)) {
      signed += 1;
    }
  }

  for (const helperApp of collectBundles(frameworksPath, ".app")) {
    if (tryCodesign(helperApp, fs.existsSync(entitlements) ? ["--entitlements", entitlements] : [])) {
      signed += 1;
    }
  }

  if (tryCodesign(appPath, fs.existsSync(entitlements) ? ["--entitlements", entitlements] : [])) {
    signed += 1;
  }

  console.log(`[afterPack] Ad-hoc signing complete, signed ${signed} component(s).`);

  try {
    runCodesign(["--verify", "--deep", "--strict", appPath]);
    console.log("[afterPack] Signature verification passed.");
  } catch (error) {
    const message =
      error && typeof error === "object" && "stderr" in error && error.stderr
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    console.warn(`[afterPack] Signature verification failed: ${message.trim()}`);
  }
};
