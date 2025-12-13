'use client';

import React from 'react';

type HospitalStat = {
  hospitalId?: string;
  hospitalName?: string;
  count: number;
  percentage?: number; // optional – we’ll recompute if totalCases is provided
};

interface HospitalBarChartProps {
  stats: HospitalStat[];
  totalCases: number;
}

/**
 * Vertical bar chart styled like a “real” dashboard chart:
 * - left Y-axis with numbers
 * - horizontal grid lines
 * - bars with value + %
 * - hospital names on X-axis
 */
export function HospitalBarChart({ stats, totalCases }: HospitalBarChartProps) {
  if (!stats || stats.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs">
        <h2 className="text-sm font-semibold text-slate-900">
          Case distribution by hospital
        </h2>
        <p className="mt-1 text-[11px] text-slate-600">
          Each bar shows total cases per facility.
        </p>
        <p className="mt-4 text-xs text-slate-500">No data for current filters.</p>
      </div>
    );
  }

  const maxCount = stats.reduce((m, s) => Math.max(m, s.count), 0) || 1;

  // “nice” max for Y-axis (round up)
  const rawMax = maxCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax || 1)));
  const niceMax = Math.ceil(rawMax / magnitude) * magnitude;
  const yTicks = 4;
  const tickStep = niceMax / yTicks;

  const barColors = ['bg-indigo-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Case distribution by hospital
          </h2>
          <p className="text-[11px] text-slate-600">
            Each bar shows total cases per facility.
          </p>
        </div>
        <div className="text-[10px] text-slate-500 text-right">
          <div>
            Total cases:&nbsp;
            <span className="font-semibold text-slate-900">{totalCases}</span>
          </div>
          <div>Hospitals shown: {stats.length}</div>
        </div>
      </div>

      <div className="mt-2 flex gap-3">
        {/* Y-axis */}
        <div className="flex flex-col justify-between text-[10px] text-slate-400 pb-6 pt-4">
          {Array.from({ length: yTicks + 1 }).map((_, idx) => {
            const value = niceMax - idx * tickStep;
            return (
              <div key={idx} className="h-8 flex items-center justify-end pr-1">
                {value > 0 ? value : 0}
              </div>
            );
          })}
        </div>

        {/* Chart area */}
        <div className="flex-1">
          <div className="relative h-56">
            {/* horizontal grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pb-6 pt-4">
              {Array.from({ length: yTicks + 1 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`h-px w-full ${
                    idx === yTicks ? 'bg-slate-300' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* bars */}
            <div className="relative h-full flex items-end justify-between pb-6 pt-4">
              {stats.map((h, index) => {
                const count = h.count || 0;
                const pctFromTotal =
                  totalCases > 0 ? Math.round((count / totalCases) * 100) : 0;

                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                const barHeight = Math.max(8, heightPct); // keep small values visible
                const colorClass = barColors[index % barColors.length];

                const label =
                  h.hospitalName ||
                  (h as any).name ||
                  h.hospitalId ||
                  `Hospital ${index + 1}`;

                return (
                  <div
                    key={h.hospitalId ?? label ?? index}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    {/* value & % */}
                    <div className="text-[10px] text-slate-600 text-center leading-tight">
                      <div className="font-semibold text-slate-900">{count}</div>
                      <div>{pctFromTotal}%</div>
                    </div>

                    {/* bar */}
                    <div className="w-6 sm:w-8 h-40 bg-transparent flex items-end justify-center">
                      <div
                        className={`w-full rounded-sm ${colorClass}`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="mt-1 flex justify-between text-[10px] text-slate-600">
            {stats.map((h, index) => {
              const label =
                h.hospitalName ||
                (h as any).name ||
                h.hospitalId ||
                `Hospital ${index + 1}`;
              return (
                <div
                  key={h.hospitalId ?? label ?? index}
                  className="flex-1 text-center px-1 truncate"
                  title={label}
                >
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
