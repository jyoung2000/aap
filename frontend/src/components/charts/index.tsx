import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';
import { useTheme } from '@/context/ThemeContext';
import type { SourceCount, TimePoint, FunnelStage } from '@/api/types';
import { titleCase } from '@/lib/format';

function useChartTheme() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return {
    dark,
    grid: dark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
    axis: dark ? '#64748b' : '#94a3b8',
    accent: '#2563eb',
    accentLight: dark ? '#6096fa' : '#2563eb',
    tooltipBg: dark ? '#141a25' : '#ffffff',
    tooltipBorder: dark ? '#273049' : '#e2e8f0',
    text: dark ? '#edf2f9' : '#111827',
  };
}

type TipPayload = Array<{ value?: number | string; name?: string }>;

function TooltipBox({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TipPayload;
  label?: ReactNode;
  formatter?: (v: number | string, name?: string) => ReactNode;
}) {
  const t = useChartTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-[12.5px] shadow-elevated"
      style={{ background: t.tooltipBg, borderColor: t.tooltipBorder, color: t.text }}
    >
      {label !== undefined && label !== '' && <div className="mb-0.5 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="tabular-nums">
          {formatter ? formatter(p.value ?? 0, p.name) : `${p.value}`}
        </div>
      ))}
    </div>
  );
}

function renderTooltip(
  formatter: (v: number | string, name?: string) => ReactNode,
  labelFormatter?: (label: string | number | undefined) => ReactNode,
) {
  // Recharts injects its own props at runtime; `any` is contained to this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => (
    <TooltipBox
      active={props.active}
      payload={props.payload as TipPayload}
      label={labelFormatter ? labelFormatter(props.label) : props.label}
      formatter={formatter}
    />
  );
}

export function AreaTrend({ data, height = 240 }: { data: TimePoint[]; height?: number }) {
  const t = useChartTheme();
  const fmtDate = (d: string) => {
    const date = new Date(d);
    return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accentLight} stopOpacity={0.28} />
            <stop offset="100%" stopColor={t.accentLight} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={34}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={renderTooltip(
            (v) => `${v} application${Number(v) === 1 ? '' : 's'}`,
            (l) => fmtDate(String(l)),
          )}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={t.accentLight}
          strokeWidth={2}
          fill="url(#areaFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const BAR_COLORS = ['#2563eb', '#6096fa', '#8b5cf6', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#10b981'];

export function SourceBars({ data, height = 240 }: { data: SourceCount[]; height?: number }) {
  const t = useChartTheme();
  const rows = data.slice(0, 8).map((d) => ({ ...d, label: titleCase(d.source) }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: t.grid }} content={renderTooltip((v) => `${v} jobs`)} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {rows.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const FUNNEL_COLORS = ['#2563eb', '#3b82f6', '#6366f1', '#8b5cf6', '#16a34a', '#dc2626'];

export function FunnelBars({ stages, height = 260 }: { stages: FunnelStage[]; height?: number }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: t.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="stage"
          width={110}
          tick={{ fill: t.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: t.grid }} content={renderTooltip((v) => `${v}`)} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
          {stages.map((_, i) => (
            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
