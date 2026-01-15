/**
 * Smoke Suite Runner (TP 4.0)
 * - Runs: auth:smoke -> events:smoke -> mobile:smoke -> exports:smoke
 * - Windows/Git Bash safe: uses cmd.exe wrapper (avoids spawn EINVAL)
 */

import { spawn } from "node:child_process";

const steps = ["auth:smoke", "events:smoke", "mobile:smoke", "exports:smoke"];

function banner(title) {
  console.log("\n==============================");
  console.log(`RUN ${title}`);
  console.log("==============================\n");
}

function runOnWindows(scriptName) {
  return new Promise((resolve, reject) => {
    const comspec = process.env.comspec || "cmd.exe";
    const cmdLine = `npm run ${scriptName}`;

    const child = spawn(comspec, ["/d", "/s", "/c", cmdLine], {
      stdio: "inherit",
      shell: false,
      windowsHide: true
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

function runOnPosix(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", scriptName], {
      stdio: "inherit",
      shell: false
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

async function runStep(scriptName) {
  try {
    if (process.platform === "win32") {
      return await runOnWindows(scriptName);
    }
    return await runOnPosix(scriptName);
  } catch (e) {
    // Last-resort fallback: shell=true
    return await new Promise((resolve) => {
      const child = spawn(`npm run ${scriptName}`, {
        stdio: "inherit",
        shell: true
      });
      child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
    });
  }
}

async function main() {
  try {
    for (const s of steps) {
      banner(s);
      const code = await runStep(s);
      if (code !== 0) {
        console.error(`❌ Smoke suite FAILED at step: ${s} (exit=${code})`);
        process.exit(code);
      }
    }
    console.log("✅ Smoke suite PASSED (all steps).");
  } catch (e) {
    console.error("❌ smoke:all crashed:", e?.message || e);
    process.exit(1);
  }
}

main();
