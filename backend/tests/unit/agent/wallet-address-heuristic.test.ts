import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  looksLikeWalletAddress,
  messageContainsWalletAddress,
  tokenizeMessage,
} from "../../../src/services/agent/swap/text-tokenize.js";

describe("looksLikeWalletAddress", () => {
  it("recognizes EVM addresses (lowercased tokens)", () => {
    assert.equal(
      looksLikeWalletAddress("0x28482b1279e442f49ee76351801232d58f341cb9"),
      true,
    );
  });

  it("recognizes Sui addresses", () => {
    assert.equal(
      looksLikeWalletAddress(
        "0x7fbcb50e56e40b45c69eb75d5b5f34b1a3d5a4d7c2b8e6f1a2c3d4e5f6a7b8c9",
      ),
      true,
    );
  });

  it("recognizes Solana base58 addresses", () => {
    assert.equal(
      looksLikeWalletAddress("epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v"),
      true,
    );
  });

  it("recognizes Stellar account ids", () => {
    assert.equal(
      looksLikeWalletAddress("ga5zsejy2yzn5omre3kk6qanrt6wk463fhai3byt5pbshh5bykhary24"),
      true,
    );
  });

  it("ignores trailing punctuation", () => {
    assert.equal(
      looksLikeWalletAddress("0x28482b1279e442f49ee76351801232d58f341cb9."),
      true,
    );
  });

  it("rejects ordinary words, symbols, and short hex", () => {
    assert.equal(looksLikeWalletAddress("usdc"), false);
    assert.equal(looksLikeWalletAddress("base"), false);
    assert.equal(looksLikeWalletAddress("arbitrum"), false);
    assert.equal(looksLikeWalletAddress("0x1234"), false);
    assert.equal(looksLikeWalletAddress("6.097209"), false);
  });

  it("messageContainsWalletAddress scans tokenized messages", () => {
    assert.equal(
      messageContainsWalletAddress(
        tokenizeMessage("Send 6.097209 usdc on base to 0x28482b1279e442f49ee76351801232d58f341cb9"),
      ),
      true,
    );
    assert.equal(
      messageContainsWalletAddress(tokenizeMessage("send 5 usdc from base to arbitrum")),
      false,
    );
  });
});
