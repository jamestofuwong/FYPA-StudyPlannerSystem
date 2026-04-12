// ============================================================
// MM-01 – Config Validator
// Validates AlgorithmConfig at load time.
// Rejects any config where weights do not sum to exactly 1.0.
// ============================================================

import { AlgorithmConfig } from "../../shared/types/matching";

const WEIGHT_PRECISION = 1e-9; // tolerance for floating-point rounding

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`[SUMS ConfigValidation] ${message}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * validateConfig
 *
 * Throws ConfigValidationError if any invariant is violated.
 * Must be called before any algorithm execution.
 */
export function validateConfig(config: AlgorithmConfig): void {
  const sum =
    config.weightCore +
    config.weightMajorCore +
    config.weightPrescribedElective +
    config.weightFreeElective +
    config.weightWIL;

  if (Math.abs(sum - 1.0) > WEIGHT_PRECISION) {
    throw new ConfigValidationError(
      `Weights must sum to exactly 1.0. Got ${sum.toFixed(10)}. ` +
      `(core=${config.weightCore}, majorCore=${config.weightMajorCore}, ` +
      `prescribed=${config.weightPrescribedElective}, free=${config.weightFreeElective}, ` +
      `wil=${config.weightWIL})`
    );
  }

  const weights = [
    config.weightCore,
    config.weightMajorCore,
    config.weightPrescribedElective,
    config.weightFreeElective,
    config.weightWIL,
  ];

  for (const w of weights) {
    if (w < 0 || w > 1) {
      throw new ConfigValidationError(
        `All weights must be between 0 and 1. Found invalid weight: ${w}`
      );
    }
  }

  if (config.wilExemptionCount < 0) {
    throw new ConfigValidationError(
      `wilExemptionCount must be >= 0. Got ${config.wilExemptionCount}`
    );
  }

  if (config.secondMajorThreshold < 0 || config.secondMajorThreshold > 1) {
    throw new ConfigValidationError(
      `secondMajorThreshold must be between 0 and 1. Got ${config.secondMajorThreshold}`
    );
  }

  if (config.noMajorThreshold < 0 || config.noMajorThreshold > 1) {
    throw new ConfigValidationError(
      `noMajorThreshold must be between 0 and 1. Got ${config.noMajorThreshold}`
    );
  }

  if (config.minorUnitThreshold < 1) {
    throw new ConfigValidationError(
      `minorUnitThreshold must be >= 1. Got ${config.minorUnitThreshold}`
    );
  }
}
