import { Template } from "e2b";

/**
 * Radiant E2B template — pre-bakes Vite scaffold + node_modules for custom app builds.
 *
 * Rebuild when: package-lock.json changes, Sui/Walrus CLI pins change, or scaffold structure changes.
 * Walrus Sites upload runs from the backend after sandbox kill (no Walrus CLI required at runtime).
 */
const SUI_CLI_RELEASE = process.env.RADIANT_SUI_CLI_RELEASE ?? "mainnet";
const WALRUS_CLI_RELEASE = process.env.RADIANT_WALRUS_CLI_RELEASE ?? "mainnet";

const SUIUP_BIN = "/usr/local/bin";

export const template = Template()
  .fromImage("node:22-bookworm")
  .aptInstall(["curl", "git", "ca-certificates", "build-essential"])
  .setEnvs({
    SUIUP_INSTALL_DIR: SUIUP_BIN,
    SUIUP_DEFAULT_BIN_DIR: SUIUP_BIN,
    PATH: `${SUIUP_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  })
  .runCmd(
    [
      "curl -sSfL https://raw.githubusercontent.com/Mystenlabs/suiup/main/install.sh | sh",
      `suiup install sui@${SUI_CLI_RELEASE} -y`,
      `suiup install walrus@${WALRUS_CLI_RELEASE} -y`,
      "sui --version",
      "walrus --version",
    ],
    { user: "root" },
  )
  .setWorkdir("/opt/radiant-scaffold")
  .copyItems([
    { src: "scaffold/package.json", dest: "/opt/radiant-scaffold/package.json" },
    { src: "scaffold/package-lock.json", dest: "/opt/radiant-scaffold/package-lock.json" },
    { src: "scaffold/tsconfig.json", dest: "/opt/radiant-scaffold/tsconfig.json" },
    { src: "scaffold/tsconfig.node.json", dest: "/opt/radiant-scaffold/tsconfig.node.json" },
    { src: "scaffold/vite.config.ts", dest: "/opt/radiant-scaffold/vite.config.ts" },
    { src: "scaffold/index.html", dest: "/opt/radiant-scaffold/index.html" },
    { src: "scaffold/src/", dest: "/opt/radiant-scaffold/src/" },
  ])
  .runCmd("npm ci")
  .runCmd("mkdir -p /workspace && chown -R user:user /workspace", { user: "root" });
