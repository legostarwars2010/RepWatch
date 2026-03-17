export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  needsReview: boolean;
}

const PARTISAN_LANGUAGE_PATTERNS = [
  /\btraitor\b/i,
  /\bcorrupt\b/i,
  /\bdisgrace\b/i,
  /\bradical\b/i,
  /\bpatriotic duty\b/i
];

export function validateNeutralLanguage(fields: string[]): string[] {
  const issues: string[] = [];
  for (const field of fields) {
    for (const pattern of PARTISAN_LANGUAGE_PATTERNS) {
      if (pattern.test(field)) {
        issues.push(`Detected non-neutral language pattern: ${pattern.toString()}`);
      }
    }
  }
  return issues;
}

export function validateReasonableLength(fieldName: string, value: string, maxLen: number): string[] {
  if (value.length > maxLen) {
    return [`${fieldName} exceeds max length (${maxLen}).`];
  }
  return [];
}

export function normalizeValidation(errors: string[], warnings: string[]): ValidationResult {
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    needsReview: errors.length > 0
  };
}
