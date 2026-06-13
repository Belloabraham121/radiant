/** DeepBook order size/price step helpers (avoid IEEE-754 modulo bugs). */

function decimalPlaces(value: number): number {
  const text = String(value);
  if (!text.includes(".")) {
    return 0;
  }
  return text.split(".")[1]?.replace(/0+$/, "").length ?? 0;
}

function scaleToInteger(value: number, decimals: number): bigint {
  const factor = 10 ** decimals;
  return BigInt(Math.round(value * factor));
}

/** Round `value` to the nearest multiple of `step`. */
export function snapToStep(
  value: number,
  step: number,
  mode: "nearest" | "down" | "up" = "nearest",
): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value;
  }
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  const decimals = Math.max(decimalPlaces(value), decimalPlaces(step));
  const scaledValue = scaleToInteger(value, decimals);
  const scaledStep = scaleToInteger(step, decimals);
  if (scaledStep === 0n) {
    return value;
  }

  let ticks: bigint;
  if (mode === "down") {
    ticks = scaledValue / scaledStep;
  } else if (mode === "up") {
    ticks = (scaledValue + scaledStep - 1n) / scaledStep;
  } else {
    const half = scaledStep / 2n;
    ticks = (scaledValue + half) / scaledStep;
  }

  const factor = 10 ** decimals;
  return Number(ticks * scaledStep) / factor;
}

export function isMultipleOfStep(value: number, step: number): boolean {
  if (!Number.isFinite(step) || step <= 0) {
    return true;
  }
  const snapped = snapToStep(value, step, "nearest");
  return Math.abs(value - snapped) <= step / 10_000;
}

export function formatConstraintNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const text = value.toPrecision(12);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
