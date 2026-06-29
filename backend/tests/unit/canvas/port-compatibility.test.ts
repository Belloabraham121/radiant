import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arePortsCompatible,
  formatIncompatiblePortsMessage,
  getCompatibleInputPorts,
} from "../../../src/services/canvas/graph/port-compatibility.js";
import type { PortKind } from "../../../src/services/canvas/graph/canvas-graph.types.js";

describe("canvas port compatibility matrix", () => {
  it("allows trigger to trigger", () => {
    assert.equal(arePortsCompatible("trigger", "trigger"), true);
    assert.deepEqual(getCompatibleInputPorts("trigger"), ["trigger"]);
  });

  it("allows data to data and signal", () => {
    assert.equal(arePortsCompatible("data", "data"), true);
    assert.equal(arePortsCompatible("data", "signal"), true);
    assert.equal(arePortsCompatible("data", "trigger"), false);
  });

  it("allows market to market and data", () => {
    assert.equal(arePortsCompatible("market", "market"), true);
    assert.equal(arePortsCompatible("market", "data"), true);
    assert.equal(arePortsCompatible("market", "order_intent"), false);
  });

  it("restricts order_intent to order_intent", () => {
    assert.equal(arePortsCompatible("order_intent", "order_intent"), true);
    assert.equal(arePortsCompatible("order_intent", "data"), false);
  });

  it("allows signal to signal and trigger", () => {
    assert.equal(arePortsCompatible("signal", "signal"), true);
    assert.equal(arePortsCompatible("signal", "trigger"), true);
    assert.equal(arePortsCompatible("signal", "data"), false);
  });

  it("covers every output port kind", () => {
    const kinds: PortKind[] = ["trigger", "signal", "market", "order_intent", "data"];
    for (const kind of kinds) {
      assert.ok(getCompatibleInputPorts(kind).length > 0);
    }
  });

  it("suggests workflow-stop.signal when data is wired to trigger", () => {
    const message = formatIncompatiblePortsMessage("data", "trigger", ["trigger", "signal"]);
    assert.match(message, /workflow-stop\.signal/);
    assert.match(message, /target_port: signal/);
  });

  it("explains signal → data mistakes", () => {
    const message = formatIncompatiblePortsMessage("signal", "data", ["data", "signal"]);
    assert.match(message, /never feed a data input/);
    assert.match(message, /target\.signal/);
  });
});
