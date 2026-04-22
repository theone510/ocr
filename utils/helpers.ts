
// ── Digit Conversion Helpers ────────────────────────────────────────────────

/** Convert Western digits (0-9) to Eastern Arabic / Hindi digits (٠-٩) */
export const toHindi = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null) return '';
  return String(num).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
};

/** Convert Eastern Arabic / Hindi digits (٠-٩) back to Western digits (0-9) */
export const fromHindi = (str: string | undefined | null): string => {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
};

// ── ID Generation ────────────────────────────────────────────────────────────

/** Generate a short random ID (timestamp + random base-36) */
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
