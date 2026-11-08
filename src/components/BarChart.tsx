export interface Bar {
  value: number;
  label: string;
  title: string;
}

interface BarChartProps {
  bars: Bar[];
  caption: string;
  describe: (bars: Bar[]) => string;
}

/** Bars from real values; the same numbers live in a screen-reader table. */
export function BarChart({ bars, caption, describe }: BarChartProps) {
  const max = Math.max(1, ...bars.map(b => b.value));

  return (
    <div className="wr-chart">
      <div className="wr-chart__plot" role="img" aria-label={describe(bars)}>
        {bars.map((bar, index) => (
          <span className="wr-chart__bar" key={`${bar.label}-${index}`} style={{ height: `${Math.max(6, (bar.value / max) * 100)}%` }} title={bar.title} />
        ))}
      </div>
      <div className="wr-chart__axis" aria-hidden="true">
        <span>{bars[0]?.label ?? ''}</span>
        <span>{bars.length > 1 ? bars[bars.length - 1].label : ''}</span>
      </div>
      <table className="wr-sr">
        <caption>{caption}</caption>
        <tbody>
          {bars.map((bar, index) => (
            <tr key={`${bar.label}-row-${index}`}>
              <th scope="row">{bar.title}</th>
              <td>{bar.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
