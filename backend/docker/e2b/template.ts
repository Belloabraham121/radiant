import { Template } from "e2b";

/**
 * Radiant E2B template — pre-bakes Next.js scaffold + node_modules for custom app builds.
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
    { src: "scaffold/next.config.ts", dest: "/opt/radiant-scaffold/next.config.ts" },
    { src: "scaffold/next-env.d.ts", dest: "/opt/radiant-scaffold/next-env.d.ts" },
    { src: "scaffold/postcss.config.mjs", dest: "/opt/radiant-scaffold/postcss.config.mjs" },
    { src: "scaffold/app/", dest: "/opt/radiant-scaffold/app/" },
    { src: "scaffold/lib/", dest: "/opt/radiant-scaffold/lib/" },
    { src: "scaffold/components/", dest: "/opt/radiant-scaffold/components/" },
  ])
  .runCmd("npm ci")
  .runCmd("mkdir -p /workspace && chown -R user:user /workspace", { user: "root" });
