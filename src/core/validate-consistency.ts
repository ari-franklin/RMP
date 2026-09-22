import type { Roadmap, TransitionReceipt } from '../types/index.js';

export interface ConsistencyDiagnostic {
  code:
    'duplicate-id' | 'broken-reference' | 'unsupported-outcome-completion' | 'duplicate-receipt';
  message: string;
  path: string;
}

export function validateConsistency(
  roadmap: Roadmap,
  receipts: TransitionReceipt[] = [],
): ConsistencyDiagnostic[] {
  const diagnostics: ConsistencyDiagnostic[] = [];
  const itemIds = new Set<string>();
  for (const [index, item] of roadmap.items.entries()) {
    if (itemIds.has(item.id)) {
      diagnostics.push({
        code: 'duplicate-id',
        message: `Duplicate roadmap item ID: ${item.id}`,
        path: `/items/${String(index)}/id`,
      });
    }
    itemIds.add(item.id);
    if (
      item.kind === 'outcome' &&
      item.status === 'completed' &&
      !(item.measurements ?? []).some((measurement) => measurement.successful)
    ) {
      diagnostics.push({
        code: 'unsupported-outcome-completion',
        message: `Completed outcome ${item.id} has no successful measurement`,
        path: `/items/${String(index)}/status`,
      });
    }
  }

  for (const [index, relationship] of roadmap.relationships.entries()) {
    if (!itemIds.has(relationship.from) || !itemIds.has(relationship.to)) {
      diagnostics.push({
        code: 'broken-reference',
        message: `Relationship references an unknown item: ${relationship.from} -> ${relationship.to}`,
        path: `/relationships/${String(index)}`,
      });
    }
  }

  const receiptIds = new Set<string>();
  for (const [index, receipt] of receipts.entries()) {
    if (receiptIds.has(receipt.id)) {
      diagnostics.push({
        code: 'duplicate-receipt',
        message: `Duplicate transition receipt ID: ${receipt.id}`,
        path: `/receipts/${String(index)}/id`,
      });
    }
    receiptIds.add(receipt.id);
  }

  return diagnostics;
}
