import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "e2b";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

const TEMPLATE = process.env.E2B_TEMPLATE_ALIAS ?? "radiant-build:v1";

async function main() {
  console.log(`Smoke test: Sandbox.create("${TEMPLATE}")`);
  const sandbox = await Sandbox.create(TEMPLATE, {
    timeoutMs: 600_000,
    lifecycle: { onTimeout: "kill", autoResume: false },
  });

  try {
    const node = await sandbox.commands.run("node -v", { timeoutMs: 30_000 });
    console.log("node -v:", node.stdout.trim());

    const sui = await sandbox.commands.run("sui --version", { timeoutMs: 30_000 });
    console.log("sui:", sui.stdout.trim());

    const prep = await sandbox.commands.run(
      "cp -a /opt/radiant-scaffold/. /workspace/",
      { cwd: "/", timeoutMs: 120_000 },
    );
    if (prep.exitCode !== 0) {
      throw new Error(`scaffold copy failed: ${prep.stderr}`);
    }

    const build = await sandbox.commands.run("npm run build", {
      cwd: "/workspace",
      timeoutMs: 300_000,
    });
    console.log("npm run build exit:", build.exitCode);
    if (build.exitCode !== 0) {
      console.error(build.stderr);
      process.exit(1);
    }

    const dist = await sandbox.commands.run("ls -la /workspace/dist", {
      timeoutMs: 30_000,
    });
    console.log(dist.stdout);
    console.log("Smoke test passed");
  } finally {
    await sandbox.kill();
    console.log("Sandbox killed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
