import type { ComponentProps, ReactNode } from 'react';

export type ChartDatum = {
  label: string;
  value: number;
  description?: string;
};

export type ChartSeries = {
  label: string;
  color?: string;
  values: readonly number[];
};

export type ChartProps = Omit<ComponentProps<'figure'>, 'children'> & {
  title: string;
  data: readonly ChartDatum[];
  locale?: string;
  valueLabel?: string;
  loading?: boolean;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  renderValue?: (value: number) => string;
};

export type LineChartProps = Omit<ComponentProps<'figure'>, 'children'> & {
  title: string;
  labels: readonly string[];
  series: readonly ChartSeries[];
  locale?: string;
  valueLabel?: string;
  loading?: boolean;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  renderValue?: (value: number) => string;
};

const chartColors = [
  'var(--mw-chart-1)',
  'var(--mw-chart-2)',
  'var(--mw-chart-3)',
  'var(--mw-chart-4)',
  'var(--mw-chart-5)',
] as const;

function formatter(
  locale: string | undefined,
  renderValue: ((value: number) => string) | undefined
) {
  if (renderValue) return renderValue;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (value: number) => number.format(value);
}

function ChartFrame({
  title,
  loading,
  error,
  empty,
  children,
  className,
  ...props
}: Omit<ComponentProps<'figure'>, 'children'> & {
  title: string;
  loading?: boolean;
  error?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}) {
  const classes = ['mw-ui-chart', className].filter(Boolean).join(' ');
  return (
    <figure className={classes} {...props}>
      <figcaption className="mw-ui-chart-title">{title}</figcaption>
      {loading ? (
        <div className="mw-ui-chart-state" role="status" aria-live="polite">
          Loading chart data
        </div>
      ) : error ? (
        <div className="mw-ui-chart-state mw-ui-chart-error" role="alert">
          {error}
        </div>
      ) : empty ? (
        <div className="mw-ui-chart-state">{empty}</div>
      ) : (
        children
      )}
    </figure>
  );
}

export function BarChart({
  title,
  data,
  locale,
  valueLabel = 'Value',
  loading,
  error,
  emptyMessage = 'No chart data available.',
  renderValue,
  className,
  ...props
}: ChartProps) {
  const format = formatter(locale, renderValue);
  const maxValue = Math.max(0, ...data.map(({ value }) => (Number.isFinite(value) ? value : 0)));
  const validData = data.filter(({ value }) => Number.isFinite(value) && value >= 0);
  const empty = validData.length === 0 ? emptyMessage : undefined;
  return (
    <ChartFrame
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      className={className}
      {...props}
    >
      <div className="mw-ui-chart-scroll">
        <svg
          className="mw-ui-bar-chart"
          viewBox={`0 0 560 ${Math.max(72, validData.length * 34 + 16)}`}
          role="img"
          aria-label={title}
          preserveAspectRatio="xMinYMin meet"
        >
          {validData.map((datum, index) => {
            const chartWidth = 560;
            const labelWidth = 124;
            const valueWidth = 56;
            const availableWidth = chartWidth - labelWidth - valueWidth - 48;
            const rowY = index * 34 + 10;
            const barWidth = maxValue === 0 ? 0 : (datum.value / maxValue) * availableWidth;
            return (
              <g key={`${datum.label}-${index}`}>
                <title>{`${datum.label}: ${format(datum.value)}`}</title>
                <text
                  className="mw-ui-chart-value"
                  x={chartWidth - 8}
                  y={rowY + 13}
                  textAnchor="end"
                >
                  {format(datum.value)}
                </text>
                <rect
                  className="mw-ui-chart-track"
                  x={labelWidth + 8}
                  y={rowY}
                  width={availableWidth}
                  height="20"
                  rx="1"
                />
                <rect
                  x={labelWidth + 8}
                  y={rowY}
                  width={Math.max(0, barWidth)}
                  height="20"
                  fill={chartColors[index % chartColors.length]}
                  rx="1"
                />
                <text className="mw-ui-chart-label" x="0" y={rowY + 14} textAnchor="start">
                  {datum.label.length > 18 ? `${datum.label.slice(0, 16)}…` : datum.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <table className="mw-ui-visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {validData.map((datum) => (
            <tr key={datum.label}>
              <th scope="row">{datum.label}</th>
              <td>
                {format(datum.value)}
                {datum.description ? ` — ${datum.description}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}

export function LineChart({
  title,
  labels,
  series,
  locale,
  valueLabel = 'Value',
  loading,
  error,
  emptyMessage = 'No chart data available.',
  renderValue,
  className,
  ...props
}: LineChartProps) {
  const format = formatter(locale, renderValue);
  const allValues = series.flatMap(({ values }) => values).filter(Number.isFinite);
  const maxValue = Math.max(0, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const hasPoint = series.some((item) => item.values.some(Number.isFinite));
  const empty = labels.length === 0 || !hasPoint ? emptyMessage : undefined;
  const width = Math.max(320, labels.length * 72);
  const x = (index: number) =>
    32 + (labels.length <= 1 ? 0 : index * (width - 64)) / (labels.length - 1);
  const y = (value: number) => 168 - ((value - minValue) / Math.max(1, maxValue - minValue)) * 128;
  return (
    <ChartFrame
      title={title}
      loading={loading}
      error={error}
      empty={empty}
      className={className}
      {...props}
    >
      <div className="mw-ui-chart-scroll">
        <svg
          className="mw-ui-line-chart"
          viewBox={`0 0 ${width} 220`}
          role="img"
          aria-label={title}
          preserveAspectRatio="xMinYMin meet"
        >
          {series.map((item, seriesIndex) => {
            const points = item.values
              .map((value, index) => (Number.isFinite(value) ? `${x(index)},${y(value)}` : null))
              .filter((point): point is string => point !== null);
            return (
              <g key={item.label}>
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke={item.color ?? chartColors[seriesIndex % chartColors.length]}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {item.values.map((value, index) =>
                  Number.isFinite(value) ? (
                    <g key={`${item.label}-${labels[index] ?? index}`}>
                      <title>{`${item.label}, ${labels[index] ?? ''}: ${format(value)}`}</title>
                      <circle
                        cx={x(index)}
                        cy={y(value)}
                        r="4"
                        fill={item.color ?? chartColors[seriesIndex % chartColors.length]}
                      />
                    </g>
                  ) : null
                )}
              </g>
            );
          })}
          {labels.map((label, index) => (
            <text
              className="mw-ui-chart-label"
              key={`${label}-${index}`}
              x={x(index)}
              y="194"
              textAnchor="middle"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
      <ul className="mw-ui-chart-legend" aria-label="Chart series">
        {series.map((item, index) => (
          <li key={item.label}>
            <span
              aria-hidden="true"
              style={{ backgroundColor: item.color ?? chartColors[index % chartColors.length] }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <table className="mw-ui-visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{valueLabel}</th>
            {labels.map((label, index) => (
              <th scope="col" key={`${label}-${index}`}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.label}>
              <th scope="row">{item.label}</th>
              {labels.map((label, index) => (
                <td key={`${label}-${index}`}>
                  {Number.isFinite(item.values[index]) ? format(item.values[index]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ChartFrame>
  );
}
