import { readFileSync } from 'node:fs';

import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import type { FormatsPlugin } from 'ajv-formats';

import type {
  Roadmap,
  TransitionReceipt,
  ValidationDiagnostic,
  ValidationResult,
} from '../types/index.js';

const roadmapSchema = JSON.parse(
  readFileSync(new URL('../../schemas/roadmap.schema.json', import.meta.url), 'utf8'),
) as object;

const configSchema = JSON.parse(
  readFileSync(new URL('../../schemas/config.schema.json', import.meta.url), 'utf8'),
) as object;

const receiptSchema = JSON.parse(
  readFileSync(new URL('../../schemas/transition-receipt.schema.json', import.meta.url), 'utf8'),
) as object;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const addFormats = addFormatsModule.default as unknown as FormatsPlugin;
addFormats(ajv);

export const validateRoadmapSchema = ajv.compile<Roadmap>(roadmapSchema);
export const validateConfigSchema = ajv.compile(configSchema);
export const validateTransitionReceiptSchema = ajv.compile<TransitionReceipt>(receiptSchema);

export function diagnosticsFromAjv(
  errors: ErrorObject[] | null | undefined,
): ValidationDiagnostic[] {
  return (errors ?? []).map((error) => {
    const extraProperty =
      error.keyword === 'additionalProperties' ? `/${String(error.params.additionalProperty)}` : '';

    return {
      pointer: `${error.instancePath}${extraProperty}` || '/',
      keyword: error.keyword,
      message: error.message ?? 'Schema validation failed',
    };
  });
}

export function validateRoadmap(value: unknown): ValidationResult<Roadmap> {
  if (!validateRoadmapSchema(value)) {
    return { valid: false, diagnostics: diagnosticsFromAjv(validateRoadmapSchema.errors) };
  }

  const diagnostics: ValidationDiagnostic[] = [];
  const ids = new Set<string>();

  value.items.forEach((item, index) => {
    if (ids.has(item.id)) {
      diagnostics.push({
        pointer: `/items/${String(index)}/id`,
        keyword: 'uniqueId',
        message: `Duplicate roadmap item ID: ${item.id}`,
      });
    }
    ids.add(item.id);

    if (
      item.schedule?.precision === 'exact' &&
      (!item.schedule.date || item.schedule.evidenceIds.length === 0)
    ) {
      diagnostics.push({
        pointer: `/items/${String(index)}/schedule`,
        keyword: 'scheduleEvidence',
        message: 'Exact dates require a date and at least one supporting evidence ID',
      });
    }

    if (
      item.kind === 'outcome' &&
      item.status === 'completed' &&
      !item.measurements?.some((measurement) => measurement.successful)
    ) {
      diagnostics.push({
        pointer: `/items/${String(index)}/status`,
        keyword: 'outcomeSignal',
        message: 'Completed outcomes require a successful measured signal',
      });
    }
  });

  value.relationships.forEach((relationship, index) => {
    for (const endpoint of ['from', 'to'] as const) {
      if (!ids.has(relationship[endpoint])) {
        diagnostics.push({
          pointer: `/relationships/${String(index)}/${endpoint}`,
          keyword: 'reference',
          message: `Relationship references unknown item: ${relationship[endpoint]}`,
        });
      }
    }
  });

  return diagnostics.length === 0
    ? { valid: true, diagnostics: [], value }
    : { valid: false, diagnostics };
}

export function validateTransitionReceipt(value: unknown): ValidationResult<TransitionReceipt> {
  return validateTransitionReceiptSchema(value)
    ? { valid: true, diagnostics: [], value }
    : {
        valid: false,
        diagnostics: diagnosticsFromAjv(validateTransitionReceiptSchema.errors),
      };
}
