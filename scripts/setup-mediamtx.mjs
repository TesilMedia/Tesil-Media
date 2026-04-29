#!/usr/bin/env node
// One-shot installer for the MediaMTX binary.
//
// Downloads the right release for this platform from GitHub and extracts it
// into ./bin/mediamtx/. media-server.mjs prefers an on-PATH `mediamtx` and
// falls back to this directory.
//
// Run via:  npm run setup:mediamtx
// Or:       node scripts/setup-mediamtx.mjs

import { execFileSync, spawnSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "v1.10.0";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_DIR = path.join(REPO_ROOT, "bin", "mediamtx");

function pickAsset() {
  const p = process.platform;
  const a = process.arch;
  // Asset names follow the pattern at https://github.com/bluenviron/mediamtx/releases
  if (p === "win32" && a === "x64") return { name: `mediamtx_${VERSION}_windows_amd64.zip`, archive: "zip" };
  if (p === "darwin" && a === "x64") return { name: `mediamtx_${VERSION}_darwin_amd64.tar.gz`, archive: "tar.gz" };
  if (p === "darwin" && a === "arm64") return { name: `mediamtx_${VERSION}_darwin_arm64.tar.gz`, archive: "tar.gz" };
  if (p === "linux" && a === "x64") return { name: `mediamtx_${VERSION}_linux_amd64.tar.gz`, archive: "tar.gz" };
  if (p === "linux" && a === "arm64") return { name: `mediamtx_${VERSION}_linux_arm64v8.tar.gz`, archive: "tar.gz" };
  throw new Error(`Unsupported platform/arch: ${p}/${a}. Install MediaMTX manually from https://github.com/bluenviron/mediamtx/releases.`);
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const get = (u) => {
      https
        .get(u, { headers: { "User-Agent": "tesil-media-setup" } }, (res) => {
          // GitHub release downloads redirect through several CDNs.
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    };
    get(url);
  });
}

function extract(archivePath, archiveType, destDir) {
  // bsdtar (Windows tar.exe since Windows 10 1803) understands both zip and
  // tar.gz, so we shell out to `tar` on every platform. POSIX tar handles
  // tar.gz natively; if a user's POSIX tar somehow lacks zip support we'd
  // surface the error here.
  mkdirSync(destDir, { recursive: true });
  const args = ["-xf", archivePath, "-C", destDir];
  const result = spawnSync("tar", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `tar failed to extract ${archivePath} (exit ${result.status}). On Windows you may need Windows 10 1803+ which ships tar.exe by default.`,
    );
  }
}

async function main() {
  const asset = pickAsset();
  const url = `https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/${asset.name}`;

  mkdirSync(TARGET_DIR, { recursive: true });
  const exeName = process.platform === "win32" ? "mediamtx.exe" : "mediamtx";
  const exePath = path.join(TARGET_DIR, exeName);

  if (existsSync(exePath)) {
    try {
      const out = execFileSync(exePath, ["--version"], { encoding: "utf8" });
      console.log(`[setup] MediaMTX already installed: ${out.trim()}`);
      return;
    } catch {
      // Re-download if the binary is corrupt.
    }
  }

  const archivePath = path.join(TARGET_DIR, asset.name);
  console.log(`[setup] downloading ${url}`);
  await download(url, archivePath);

  console.log(`[setup] extracting to ${TARGET_DIR}`);
  extract(archivePath, asset.archive, TARGET_DIR);
  rmSync(archivePath, { force: true });

  if (!existsSync(exePath)) {
    throw new Error(`Extraction did not produce ${exePath}. Check the archive contents manually.`);
  }
  if (process.platform !== "win32") {
    try {
      execFileSync("chmod", ["+x", exePath]);
    } catch {
      // chmod failures are non-fatal — tar usually preserves the executable bit.
    }
  }

  const ver = execFileSync(exePath, ["--version"], { encoding: "utf8" }).trim();
  console.log(`[setup] installed ${ver} at ${exePath}`);
}

main().catch((err) => {
  console.error("[setup] failed:", err.message);
  process.exit(1);
});
