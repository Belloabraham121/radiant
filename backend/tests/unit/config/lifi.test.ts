import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getLifiConfig,
  lifiFeeSdkParam,
  lifiIntegratorSdkFields,
  parseLifiIntegratorFee,
} from "../../../src/config/lifi.js";

describe("lifi config", () => {
  it("parseLifiIntegratorFee defaults to 0.001", () => {
    assert.equal(parseLifiIntegratorFee("0.001"), 0.001);
  });

  it("parseLifiIntegratorFee accepts zero fee", () => {
    assert.equal(parseLifiIntegratorFee("0"), 0);
  });

  it("parseLifiIntegratorFee rejects values above 5%", () => {
    assert.throws(() => parseLifiIntegratorFee("0.06"), /LIFI_INTEGRATOR_FEE/);
  });

  it("parseLifiIntegratorFee rejects negative values", () => {
    assert.throws(() => parseLifiIntegratorFee("-0.001"), /LIFI_INTEGRATOR_FEE/);
  });

  it("lifiFeeSdkParam omits fee when zero", () => {
    assert.deepEqual(lifiFeeSdkParam(0), {});
    assert.deepEqual(lifiFeeSdkParam(0.001), { fee: 0.001 });
  });

  it("lifiIntegratorSdkFields merges integrator and fee", () => {
    assert.deepEqual(
      lifiIntegratorSdkFields({ integrator: "radiant", integratorFee: 0.001 }),
      { integrator: "radiant", fee: 0.001 },
    );
    assert.deepEqual(
      lifiIntegratorSdkFields({ integrator: "radiant", integratorFee: 0 }, "partner"),
      { integrator: "partner" },
    );
  });

  it("getLifiConfig exposes integratorFee from env", () => {
    process.env.LIFI_INTEGRATOR_FEE = "0.002";
    assert.equal(getLifiConfig().integratorFee, 0.002);
    delete process.env.LIFI_INTEGRATOR_FEE;
  });
});
