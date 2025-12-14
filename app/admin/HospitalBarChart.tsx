'use client';

import React from 'react';

type HospitalStat = {
  hospitalId?: string;
  hospitalName?: string;
  count: number;
  percentage?: number;
};

interface HospitalBarChartProps {
  stats: HospitalStat[];
  totalCases: number;
}

export function HospitalBarChart({ stats, totalCases }: HospitalBarChartProps) {
  if (!stats || stats.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs">
        <h2 className="text-sm font-semibold text-black">Case distribution by hospital</h2>
        <p className="mt-1 text-[11px] text-black">Each bar shows total cases per facility.</p>
        <p className="mt-4 text-[11px] text-black">No data for current filters.</p>
      </div>
    );
  }

  const maxCount = stats.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  // “nice” max for Y-axis
  const rawMax = maxCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax || 1)));
  const niceMax = Math.ceil(rawMax / magnitude) * magnitude;
  const yTicks = 4;
  const tickStep = niceMax / yTicks;

  const barColors = ['bg-indigo-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-600', 'bg-violet-600'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-black">Case distribution by hospital</h2>
          <p className="text-[11px] text-black">Each bar shows total cases per facility.</p>
        </div>
        <div className="text-[11px] text-black text-right">
          <div>
            Total cases: <span className="font-semibold">{totalCases}</span>
          </div>
          <div>Hospitals shown: {stats.length}</div>
        </div>
      </div>

      <div className="mt-2 flex gap-3">
        {/* Y-axis */}
        <div className="flex flex-col justify-between text-[11px] text-black pb-6 pt-4">
          {Array.from({ length: yTicks + 1 }).map((_, idx) => {
            const value = niceMax - idx * tickStep;
            return (
              <div key={idx} className="h-8 flex items-center justify-end pr-1">
                {value > 0 ? Math.round(value) : 0}
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div className="flex-1">
          <div className="relative h-64">
            {/* grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pb-6 pt-4">
              {Array.from({ length: yTicks + 1 }).map((_, idx) => (
                <div key={idx} className={`h-px w-full ${idx === yTicks ? 'bg-slate-300' : 'bg-slate-200'}`} />
              ))}
            </div>

            {/* bars */}
            <div className="relative h-full flex items-end justify-between pb-6 pt-4">
              {stats.map((h, index) => {
                const count = h.count || 0;
                const pct = totalCases > 0 ? Math.round((count / totalCases) * 100) : 0;
                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const barHeight = Math.max(8, heightPct);
                const colorClass = barColors[index % barColors.length];

                const label =
                  h.hospitalName || (h as any).name || h.hospitalId || `Hospital ${index + 1}`;

                return (
                  <div
                    key={h.hospitalId ?? label ?? index}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div className="text-[11px] text-black text-center leading-tight">
                      <div className="font-semibold">{count}</div>
                      <div>{pct}%</div>
                    </div>

                    <div className="w-8 sm:w-10 h-44 flex items-end justify-center">
                      <div className={`w-full rounded-md ${colorClass}`} style={{ height: `${barHeight}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X labels */}
          <div className="mt-1 flex justify-between text-[11px] text-black">
            {stats.map((h, index) => {
              const label =
                h.hospitalName || (h as any).name || h.hospitalId || `Hospital ${index + 1}`;
              return (
                <div key={h.hospitalId ?? label ?? index} className="flex-1 text-center px-1 truncate" title={label}>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
