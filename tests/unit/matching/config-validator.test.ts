import {
  ConfigValidationError,
  validateConfig,
} from '@core/services/matching/configValidator';
import { DEFAULT_CONFIG } from '@shared/types/matching';

describe('Algorithm configuration validation', () => {
  test('accepts the default configuration', () => {
    expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
  });

  test('reports the actual total when weights do not sum to one', () => {
    const config = { ...DEFAULT_CONFIG, weightCore: 0.5 };

    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('Weights must sum to exactly 1.0');
    expect(() => validateConfig(config)).toThrow('Got 1.1000000000');
  });

  test('rejects an individual weight outside the zero-to-one range', () => {
    const config = {
      ...DEFAULT_CONFIG,
      weightCore: 1.1,
      weightMajorCore: -0.4,
    };

    expect(() => validateConfig(config)).toThrow(
      'All weights must be between 0 and 1. Found invalid weight: 1.1',
    );
  });

  test.each([
    {
      field: 'wilExemptionCount',
      value: -1,
      message: 'wilExemptionCount must be >= 0',
    },
    {
      field: 'secondMajorThreshold',
      value: -0.1,
      message: 'secondMajorThreshold must be between 0 and 1',
    },
    {
      field: 'secondMajorThreshold',
      value: 1.1,
      message: 'secondMajorThreshold must be between 0 and 1',
    },
    {
      field: 'noMajorThreshold',
      value: -0.1,
      message: 'noMajorThreshold must be between 0 and 1',
    },
    {
      field: 'noMajorThreshold',
      value: 1.1,
      message: 'noMajorThreshold must be between 0 and 1',
    },
    {
      field: 'minorUnitThreshold',
      value: 0,
      message: 'minorUnitThreshold must be >= 1',
    },
  ] as const)('rejects $field=$value', ({ field, value, message }) => {
    const config = { ...DEFAULT_CONFIG, [field]: value };

    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow(message);
  });

  test('uses a distinct error name and stable prefix', () => {
    const error = new ConfigValidationError('invalid test configuration');

    expect(error.name).toBe('ConfigValidationError');
    expect(error.message).toBe('[SUMS ConfigValidation] invalid test configuration');
  });
});
