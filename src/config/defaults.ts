import type { RmpConfig } from '../types/index.js';

export const defaultConfig: RmpConfig = {
  schemaVersion: '1.0.0',
  authority: {
    deterministic: 'automatic',
    corroborated: 'automatic',
    observedOutcome: 'automatic',
    inferred: 'recommendation',
    strategic: 'recommendation',
  },
  views: {
    default: 'outcome',
  },
  adapters: {
    enabled: ['local', 'git'],
  },
  extensions: {},
};
