import { diagnosticsFromAjv, validateConfigSchema } from '../schemas/index.js';
import type { RmpConfig, ValidationDiagnostic } from '../types/index.js';
import { defaultConfig } from './defaults.js';

export type ConfigLoadResult =
  | { valid: true; config: RmpConfig; diagnostics: [] }
  | { valid: false; diagnostics: ValidationDiagnostic[]; config?: undefined };

export function loadConfig(value: unknown): ConfigLoadResult {
  if (!validateConfigSchema(value)) {
    return { valid: false, diagnostics: diagnosticsFromAjv(validateConfigSchema.errors) };
  }

  const input = value as Partial<RmpConfig>;
  return {
    valid: true,
    diagnostics: [],
    config: {
      ...defaultConfig,
      ...input,
      authority: { ...defaultConfig.authority, ...input.authority },
      views: { ...defaultConfig.views, ...input.views },
      adapters: { ...defaultConfig.adapters, ...input.adapters },
      extensions: { ...defaultConfig.extensions, ...input.extensions },
    },
  };
}
