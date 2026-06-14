import assert from "node:assert/strict";
import { homedir } from "node:os";
import { describe, it } from "node:test";
import { expandWalrusConfigPath } from "../../../src/config/walrus.js";

describe("expandWalrusConfigPath", () => {
  it("expands $HOME in config paths from .env", () => {
    assert.equal(
      expandWalrusConfigPath("$HOME/.config/walrus/sites-config.yaml"),
      `${homedir()}/.config/walrus/sites-config.yaml`,
    );
  });

  it("expands leading tilde", () => {
    assert.equal(
      expandWalrusConfigPath("~/.config/walrus/client_config.yaml"),
      `${homedir()}/.config/walrus/client_config.yaml`,
    );
  });
});
