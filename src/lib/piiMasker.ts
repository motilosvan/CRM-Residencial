export interface PiiMaskResult {
  cleanText: string;
  maskedText: string;
  detectedItems: {
    emails: number;
    phones: number;
    ids: number;
  };
}

export function maskPII(rawText: string): PiiMaskResult {
  const withoutQuotes = rawText
    .split('\n')
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .replace(/El\s+\d{1,2}\s+de\s+[a-zA-Z]+.*?escribi[óo]:[\s\S]*/i, '')
    .replace(/--\s*\n[\s\S]*$/, '')
    .trim();

  let emails = 0;
  let phones = 0;
  let ids = 0;

  let masked = withoutQuotes.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    () => {
      emails += 1;
      return '[CORREO_PROTEGIDO]';
    }
  );

  masked = masked.replace(
    /(?:\+57\s?)?\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    () => {
      phones += 1;
      return '[TEL_PROTEGIDO]';
    }
  );

  masked = masked.replace(
    /(?:(?:C\.?C\.?|c[ée]dula|identificaci[óo]n)\s*(?:No\.?|#|:)?\s*)(\d{1,3}(?:[.\s]\d{3}){2}|\d{7,10})\b/gi,
    () => {
      ids += 1;
      return 'CC [DOC_PROTEGIDO]';
    }
  );

  return {
    cleanText: withoutQuotes,
    maskedText: masked,
    detectedItems: { emails, phones, ids },
  };
}
