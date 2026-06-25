import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLARIFICATION_CHIP_LAYOUT_THRESHOLD,
  useChipLayoutForClarificationOptions,
} from "../../src/components/app/ClarificationBar";

describe("useChipLayoutForClarificationOptions", () => {
  it("uses stacked list below threshold", () => {
    assert.equal(CLARIFICATION_CHIP_LAYOUT_THRESHOLD, 5);
    assert.equal(useChipLayoutForClarificationOptions(4), false);
  });

  it("uses chip layout at threshold and above", () => {
    assert.equal(useChipLayoutForClarificationOptions(5), true);
    assert.equal(useChipLayoutForClarificationOptions(9), true);
  });
});
