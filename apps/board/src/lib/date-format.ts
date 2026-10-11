import { readPreferences } from './preferences';

export type DateFormatStyle = 'date' | 'time' | 'dateTime' | 'shortDateTime';

const optionsByStyle: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  date: { dateStyle: 'medium' },
  time: { timeStyle: 'short' },
  dateTime: { dateStyle: 'medium', timeStyle: 'short' },
  shortDateTime: { dateStyle: 'short', timeStyle: 'short' },
};

/** Format persisted timestamps with the user's saved language and timezone. */
export function formatDateTime(value: Date | string | number, style: DateFormatStyle = 'dateTime') {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';

  const { language, timezone } = readPreferences();
  return new Intl.DateTimeFormat(language, {
    ...optionsByStyle[style],
    timeZone: timezone,
  }).format(date);
}
