export interface ValidationDiagnostic {
  pointer: string;
  keyword: string;
  message: string;
}

export type ValidationResult<T> =
  | { valid: true; diagnostics: []; value: T }
  | { valid: false; diagnostics: ValidationDiagnostic[]; value?: undefined };
