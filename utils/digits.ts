// Helper to convert Western digits to Hindi digits
export const toHindi = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null) return '';
  return String(num).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
};

// Helper to convert Hindi digits to Western digits (for import parsing)
export const fromHindi = (str: string | undefined | null): string => {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
};
