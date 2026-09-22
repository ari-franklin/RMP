import { describe, expect, it } from 'vitest';

import { defaultConfig } from '../../../src/config/index.js';
import { evaluateAuthority } from '../../../src/core/index.js';
import type { EvidenceClass } from '../../../src/types/index.js';
import { evidence, item } from './helpers.js';

describe('evaluateAuthority', () => {
  it.each([
    ['deterministic', 'automatic'],
    ['corroborated', 'automatic'],
    ['observedOutcome', 'automatic'],
    ['inferred', 'recommendation'],
    ['strategic', 'recommendation'],
  ] satisfies [EvidenceClass, string][])(
    '%s evidence resolves to %s',
    (evidenceClass, expected) => {
      const result = evaluateAuthority({
        item: item(),
        evidence: evidence(`ev-${evidenceClass.toLowerCase()}`, evidenceClass, 'completed'),
        proposedStatus: 'completed',
        matchKind: 'explicit',
        config: defaultConfig,
      });

      expect(result.disposition).toBe(expected);
      expect(result.rule).toContain(evidenceClass);
    },
  );

  it('applies repository policy before defaults and can tighten automatic authority', () => {
    const config = {
      ...defaultConfig,
      authority: { ...defaultConfig.authority, deterministic: 'approval' as const },
    };
    const result = evaluateAuthority({
      item: item(),
      evidence: evidence('ev-policy', 'deterministic', 'completed'),
      proposedStatus: 'completed',
      matchKind: 'explicit',
      config,
    });

    expect(result).toMatchObject({
      disposition: 'recommendation',
      requiredApprover: 'roadmap-owner',
    });
    expect(result.rule).toContain('repository-policy');
  });

  it('keeps ambiguous and fuzzy matches recommendation-only', () => {
    for (const matchKind of ['ambiguous', 'fuzzy'] as const) {
      const result = evaluateAuthority({
        item: item(),
        evidence: evidence(`ev-${matchKind}`, 'deterministic', 'completed'),
        proposedStatus: 'completed',
        matchKind,
        config: defaultConfig,
      });
      expect(result.disposition).toBe('recommendation');
    }
  });

  it('requires an observed successful measurement to complete an outcome', () => {
    const outcome = item({
      id: 'out-adoption',
      kind: 'outcome',
      signal: { metric: 'adoption', target: 10, unit: 'repos' },
      measurements: [],
    });
    const delivery = evaluateAuthority({
      item: outcome,
      evidence: evidence('ev-deploy', 'deterministic', 'completed', { itemId: outcome.id }),
      proposedStatus: 'completed',
      matchKind: 'explicit',
      config: defaultConfig,
    });
    const measuredEvidence = evidence('ev-measured', 'observedOutcome', 'completed', {
      itemId: outcome.id,
    });
    const measured = evaluateAuthority({
      item: {
        ...outcome,
        measurements: [
          {
            observedAt: measuredEvidence.observedAt,
            value: 12,
            successful: true,
            evidenceIds: [measuredEvidence.id],
          },
        ],
      },
      evidence: measuredEvidence,
      proposedStatus: 'completed',
      matchKind: 'explicit',
      config: defaultConfig,
    });

    expect(delivery.disposition).toBe('recommendation');
    expect(measured.disposition).toBe('automatic');
  });
});
