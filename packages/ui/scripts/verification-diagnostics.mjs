const verificationPhases = new Set([
  'create package archive',
  'validate package archive',
  'install isolated consumer dependencies',
  'run consumer import smoke test',
  'validate public stylesheet exports',
]);

export function renderPackageVerificationAnnotation(phase, errorCode) {
  if (!verificationPhases.has(phase)) {
    throw new Error('Unknown UI package verification phase.');
  }

  const safeCode =
    typeof errorCode === 'number'
      ? String(errorCode)
      : typeof errorCode === 'string' && /^[A-Z0-9_-]{1,64}$/u.test(errorCode)
        ? errorCode
        : undefined;
  const code = safeCode ? ` (code: ${safeCode})` : '';
  return `::error title=UI package verification failed::${phase}${code}\n`;
}
