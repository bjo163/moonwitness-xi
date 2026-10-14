export function serializeCsv(headers: readonly string[], rows: readonly (readonly string[])[]) {
  const escapeCell = (value: string) => {
    const safeValue = /^[=+\-@]/u.test(value.trimStart()) ? `'${value}` : value;
    return /[",\r\n]/u.test(safeValue) ? `"${safeValue.replace(/"/gu, '""')}"` : safeValue;
  };

  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
