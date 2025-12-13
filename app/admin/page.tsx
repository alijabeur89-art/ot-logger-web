'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Data hook + chart component
import { useAdminDashboardData, TabKey } from './useAdminDashboardData';
import { HospitalBarChart } from './HospitalBarChart';

// ---------- Helpers ----------

function buildPieGradient(
  entries: { label: string; count: number }[],
  colors: string[]
): string {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)';

  let currentAngle = 0;
  const parts: string[] = [];

  entries.forEach((entry, index) => {
    const angle = (entry.count / total) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    currentAngle = end;
    const color = colors[index % colors.length];
    parts.push(`${color} ${start}deg ${end}deg`);
  });

  return `conic-gradient(${parts.join(', ')})`;
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function TrendBadge({ value }: { value: number }) {
  if (!Number.isFinite(value)) return null;
  const positive = value > 0;
  const neutral = value === 0;
  const label = neutral ? '0%' : `${Math.abs(value)}%`;
  const arrow = neutral ? '→' : positive ? '↑' : '↓';
  const colorClass = neutral
    ? 'text-slate-500'
    : positive
    ? 'text-emerald-600'
    : 'text-rose-600';

  return (
    <span className={`text-[11px] ${colorClass}`}>
      {arrow} {label} vs prev.
    </span>
  );
}

export default function AdminPage() {
  const router = useRouter();

  // filter state
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('all');
  const [selectedStaffKey, setSelectedStaffKey] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // data hook
  const {
    profile,
    hospitals,
    users,
    cases,
    skills,
    loading,
    filteredData,
    resolveStaff,
    handleCreateUser,
    creationState,
  } = useAdminDashboardData({
    selectedHospitalId,
    selectedStaffKey,
    dateFrom,
    dateTo,
  });

  const {
    filteredCases,
    totalStaff,
    totalCases,
    totalHospitals,
    skillGaps,
    casesByHospitalStats,
    asaStats,
    totalAsa,
    profileStats,
    teamPerformanceRows,
    skillCoverageRows,
  } = filteredData;

  // create-user form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'staff' | 'supervisor' | 'admin'>('staff');
  const [newUserHospitalId, setNewUserHospitalId] = useState<string>('');
  const [newUserDepartment, setNewUserDepartment] = useState('');

  // ASA pie
  const asaColors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#94a3b8'];
  const asaPieGradient = buildPieGradient(asaStats, asaColors);

  // ---- Auth check (basic – hook does role authorization) ----
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  // ---------- Analytics: filter impact & KPI trends ----------

  const totalCasesAllTime = cases.length;
  const filterImpactPct =
    totalCasesAllTime > 0 ? Math.round((totalCases / totalCasesAllTime) * 100) : 0;

  // derive current + previous date windows
  const trendMetrics = useMemo(() => {
    const msDay = 24 * 60 * 60 * 1000;
    let currentStart: Date;
    let currentEnd: Date;

    if (dateFrom && dateTo) {
      const s = parseDate(dateFrom);
      const e = parseDate(dateTo);
      if (s && e && s <= e) {
        currentStart = s;
        currentEnd = e;
      } else {
        const today = new Date();
        currentEnd = today;
        currentStart = new Date(today.getTime() - 29 * msDay);
      }
    } else {
      const today = new Date();
      currentEnd = today;
      currentStart = new Date(today.getTime() - 29 * msDay);
    }

    const lenDays = Math.max(
      1,
      Math.round((currentEnd.getTime() - currentStart.getTime()) / msDay) + 1
    );
    const prevEnd = new Date(currentStart.getTime() - msDay);
    const prevStart = new Date(prevEnd.getTime() - (lenDays - 1) * msDay);

    function inRange(dStr: string | null | undefined, start: Date, end: Date) {
      const d = parseDate(dStr);
      if (!d) return false;
      return d >= start && d <= end;
    }

    // apply same hospital/staff filters, only shift dates
    const prevCases = cases.filter((c: any) => {
      if (selectedHospitalId !== 'all' && c.hospital_id !== selectedHospitalId) return false;
      if (selectedStaffKey !== 'all' && c.staff_id !== selectedStaffKey) return false;
      return inRange(c.date, prevStart, prevEnd);
    });

    const prevTotalCases = prevCases.length;
    const prevStaffSet = new Set(
      prevCases.map((c: any) => c.staff_id).filter((x: any) => !!x)
    );
    const prevTotalStaff = prevStaffSet.size || 0;

    const currentAvgPerStaff = totalStaff ? totalCases / totalStaff : 0;
    const prevAvgPerStaff = prevTotalStaff ? prevTotalCases / prevTotalStaff : 0;

    const casesTrend = pctChange(totalCases, prevTotalCases);
    const avgTrend = pctChange(currentAvgPerStaff, prevAvgPerStaff);

    return {
      casesTrend,
      avgTrend,
    };
  }, [cases, selectedHospitalId, selectedStaffKey, dateFrom, dateTo, totalCases, totalStaff]);

  // ---------- ASA risk index ----------

  const asaRiskIndex = useMemo(() => {
    if (!asaStats.length) return null;
    let weighted = 0;
    let total = 0;
    asaStats.forEach((a) => {
      const label = a.label;
      let value = 0;
      if (/ASA 1/i.test(label)) value = 1;
      else if (/ASA 2/i.test(label)) value = 2;
      else if (/ASA 3/i.test(label)) value = 3;
      else if (/ASA 4/i.test(label)) value = 4;
      else value = 0;
      weighted += value * a.count;
      total += a.count;
    });
    if (!total) return null;
    return (weighted / total).toFixed(1);
  }, [asaStats]);

  // ---------- Profile analytics ----------

  const maxProfileCount =
    profileStats.reduce((max, e) => Math.max(max, e.count), 0) || 1;

  // ---------- Attrition risk (predictive-ish) ----------

  const attritionRows = useMemo(() => {
    if (!teamPerformanceRows.length) return [];
    const today = new Date();
    const msDay = 24 * 60 * 60 * 1000;

    return teamPerformanceRows
      .map((row) => {
        const reasons: string[] = [];
        let score = 0;

        // few cases
        if (row.totalCases < 5) {
          score += 1;
          reasons.push('Low case volume');
        }
        // low skill diversity
        if (row.skillsUsed < 2) {
          score += 1;
          reasons.push('Low skill diversity');
        }
        // long time since last case
        if (row.lastDate) {
          const d = parseDate(row.lastDate);
          if (d) {
            const diffDays = Math.round(
              (today.getTime() - d.getTime()) / msDay
            );
            if (diffDays > 60) {
              score += 1;
              reasons.push(`Inactive for ${diffDays} days`);
            }
          }
        } else {
          score += 1;
          reasons.push('No recorded cases');
        }

        let level: 'low' | 'medium' | 'high' = 'low';
        if (score === 2) level = 'medium';
        if (score >= 3) level = 'high';

        return {
          staffKey: row.staffKey,
          name: row.name,
          secondary: row.secondary,
          score,
          level,
          reasons,
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [teamPerformanceRows]);

  // ---------- Staff daily load heatmap ----------

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const staffDailyLoad = useMemo(() => {
    if (!filteredCases.length) return [];

    type Row = {
      staffKey: string;
      name: string;
      secondary: string;
      counts: number[];
      max: number;
    };

    const map = new Map<string, Row>();

    filteredCases.forEach((c: any) => {
      if (!c.staff_id || !c.date) return;
      const staffKey = c.staff_id as string;
      let row = map.get(staffKey);
      if (!row) {
        const resolved = resolveStaff(staffKey);
        row = {
          staffKey,
          name: resolved.name,
          secondary: resolved.secondary,
          counts: [0, 0, 0, 0, 0, 0, 0],
          max: 0,
        };
        map.set(staffKey, row);
      }
      const d = parseDate(c.date);
      if (!d) return;
      const day = d.getDay(); // 0=Sun..6=Sat
      const idx = day === 0 ? 6 : day - 1; // Mon=0..Sun=6
      row.counts[idx] += 1;
      row.max = Math.max(row.max, row.counts[idx]);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [filteredCases, resolveStaff]);

  // ---------- Create user handler ----------

  const onSubmitCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await handleCreateUser({
      email: newUserEmail,
      password: newUserPassword,
      name: newUserName,
      role: newUserRole,
      hospital_home_id: newUserHospitalId,
      department: newUserDepartment,
    });
    if (success) {
      alert('User created successfully.');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserHospitalId('');
      setNewUserDepartment('');
      setNewUserRole('staff');
    } else {
      alert('Error creating user. Check console for details.');
    }
  };

  // ---------- Render ----------

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading admin dashboard…</p>
      </main>
    );
  }

  const adminName = profile?.name || 'Admin';

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <div className="mx-auto max-w-6xl px-4 py-4 space-y-6">
        {/* Top bar */}
        <header className="flex items-center justify-between rounded-2xl bg-white border border-slate-200 px-4 py-2 shadow-soft">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-hmc-primary flex items-center justify-center">
              <span className="text-[11px] font-semibold text-white">OT</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-900">
                AnaesTrack
              </span>
              <span className="text-[11px] text-slate-500">
                OT Case Analytics
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-[11px] text-slate-600">
            {['dashboard', 'cases', 'skills', 'users'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as TabKey)}
                className={`pb-1 capitalize ${
                  activeTab === tab
                    ? 'text-hmc-primary border-b-2 border-hmc-primary font-medium'
                    : 'hover:text-slate-900'
                }`}
              >
                {tab === 'cases'
                  ? 'Team Logs'
                  : tab === 'skills'
                  ? 'Skills & Training'
                  : tab}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[11px] text-slate-500">Admin</span>
              <span className="text-[11px] font-medium text-slate-900">
                {adminName}
              </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-slate-700">
              {adminName.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Filters */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-soft p-4 text-xs flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Data filters
            </h2>
            <p className="text-[11px] text-slate-600">
              Showing <strong>{totalCases}</strong> cases logged by{' '}
              <strong>{totalStaff}</strong> staff in{' '}
              <strong>{totalHospitals}</strong> facilities. Filter impact:{' '}
              <strong>{filterImpactPct}%</strong> of all cases.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col">
              <label className="mb-1 text-[11px] text-slate-600">
                Facility
              </label>
              <select
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-1 bg-white text-slate-900"
              >
                <option value="all">All hospitals</option>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="mb-1 text-[11px] text-slate-600">
                Staff
              </label>
              <select
                value={selectedStaffKey}
                onChange={(e) => setSelectedStaffKey(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-1 bg-white text-slate-900"
              >
                <option value="all">All staff</option>
                {Array.from(
                  new Set(cases.map((c: any) => c.staff_id).filter(Boolean))
                ).map((staffKey) => {
                  const resolved = resolveStaff(staffKey as string);
                  return (
                    <option key={resolved.key} value={resolved.key}>
                      {resolved.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="mb-1 text-[11px] text-slate-600">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-1 bg-white text-slate-900"
              />
            </div>

            <div className="flex flex-col">
              <label className="mb-1 text-[11px] text-slate-600">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-1 bg-white text-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedHospitalId('all');
                setSelectedStaffKey('all');
                setDateFrom('');
                setDateTo('');
              }}
              className="self-start sm:self-end rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-600 bg-slate-50 h-8"
            >
              Clear filters
            </button>
          </div>
        </section>

        {/* KPI cards with trends */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-soft flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">
              Total Active Staff
            </span>
            <span className="text-lg font-semibold text-slate-900">
              {totalStaff}
            </span>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                With cases in selected period
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-soft flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">
              Total Cases (filtered)
            </span>
            <span className="text-lg font-semibold text-slate-900">
              {totalCases}
            </span>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                Across {totalHospitals || 0} hospitals
              </span>
              <TrendBadge value={trendMetrics.casesTrend} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-soft flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">
              Avg Cases / Staff
            </span>
            <span className="text-lg font-semibold text-slate-900">
              {totalStaff ? Math.round(totalCases / totalStaff) : 0}
            </span>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                Current filtered period
              </span>
              <TrendBadge value={trendMetrics.avgTrend} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-soft flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">
              Skill Gap Alerts
            </span>
            <span className="text-lg font-semibold text-amber-600">
              {skillGaps.length}
            </span>
            <span className="text-[11px] text-slate-500">
              Skills with zero exposure
            </span>
          </div>
        </section>

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === 'dashboard' && (
          <section className="space-y-4">
            {/* upper row: hospital chart + ASA/profile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HospitalBarChart stats={casesByHospitalStats} totalCases={totalCases} />

              {/* ASA + Profile */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4 border-slate-100">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      ASA distribution
                    </h2>
                    <p className="text-[11px] text-slate-600">
                      ASA 1–4 case mix with percentage.
                    </p>
                    {asaRiskIndex && (
                      <p className="mt-1 text-[11px] text-slate-700">
                        Avg ASA index:{' '}
                        <span className="font-semibold">{asaRiskIndex}</span>
                      </p>
                    )}
                  </div>
                  <div
                    className="h-20 w-20 rounded-full border border-slate-200 shrink-0"
                    style={{ backgroundImage: asaPieGradient }}
                  />
                </div>

                {/* ASA list */}
                <div className="space-y-1">
                  {asaStats.length === 0 ? (
                    <p className="text-xs text-slate-500">No ASA data.</p>
                  ) : (
                    asaStats.map((a, index) => {
                      const pct =
                        totalAsa > 0
                          ? Math.round((a.count / totalAsa) * 100)
                          : 0;
                      const color = asaColors[index % asaColors.length];
                      return (
                        <div
                          key={a.label}
                          className="flex items-center justify-between text-[11px] text-slate-600"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span>{a.label}</span>
                          </div>
                          <span>
                            {a.count} case{a.count !== 1 ? 's' : ''} • {pct}%
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Profile distribution */}
                <div className="pt-4 border-t border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Profile distribution
                  </h2>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Case mix by patient profile.
                  </p>
                  {profileStats.length === 0 ? (
                    <p className="text-xs text-slate-500">No profile data.</p>
                  ) : (
                    <div className="space-y-2 mt-2">
                      {profileStats.map((p, index) => {
                        const widthPct = (p.count / maxProfileCount) * 100;
                        const barColorClass = [
                          'bg-blue-500',
                          'bg-emerald-500',
                          'bg-amber-500',
                          'bg-slate-500',
                        ][index % 4];
                        const pct =
                          totalCases > 0
                            ? Math.round((p.count / totalCases) * 100)
                            : 0;
                        return (
                          <div key={p.label} className="text-[10px]">
                            <div className="flex justify-between font-medium text-slate-900 mb-1">
                              <span>{p.label}</span>
                              <span>
                                {p.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div
                                className={`h-2 rounded-full ${barColorClass}`}
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* skill gaps + attrition */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top skill gaps */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs space-y-3">
                <h2 className="text-sm font-semibold text-amber-600 flex items-center gap-2">
                  ⚠️ Top skill gaps
                </h2>
                <p className="text-[11px] text-slate-600">
                  Active skills with zero exposure in the{' '}
                  <strong>{totalCases}</strong> filtered cases.
                </p>
                {skillGaps.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No skill gaps detected in the filtered period. Excellent
                    coverage.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {skillGaps.slice(0, 10).map((s) => (
                      <span
                        key={s.id}
                        className="bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 text-[10px]"
                      >
                        {s.name} {s.code && `(${s.code})`}
                      </span>
                    ))}
                    {skillGaps.length > 10 && (
                      <span className="bg-slate-50 text-slate-500 rounded-full px-2 py-0.5 text-[10px]">
                        + {skillGaps.length - 10} more…
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Attrition risk */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft text-xs space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Staff attrition risk
                </h2>
                <p className="text-[11px] text-slate-600">
                  Based on low case volume, low skill diversity, and time since
                  last case.
                </p>
                {attritionRows.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No at-risk staff detected from current filters.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attritionRows.map((r) => (
                      <div
                        key={r.staffKey}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[12px] font-medium text-slate-900">
                              {r.name}
                            </p>
                            {r.secondary && (
                              <p className="text-[10px] text-slate-500">
                                {r.secondary}
                              </p>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.level === 'high'
                                ? 'bg-rose-100 text-rose-700'
                                : r.level === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {r.level.toUpperCase()}
                          </span>
                        </div>
                        <ul className="mt-1 text-[10px] text-slate-600 list-disc list-inside">
                          {r.reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===== TEAM LOGS TAB ===== */}
        {activeTab === 'cases' && (
          <section className="space-y-4 text-xs">
            {/* performance table (from your version) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Team performance overview
              </h2>
              <p className="text-[11px] text-slate-600">
                Case volume, specialty breadth and skill usage per staff
                member.
              </p>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider rounded-tl-xl">
                        Staff member
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Total cases
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Distinct specialties
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Distinct skills used
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider rounded-tr-xl">
                        Last case date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {teamPerformanceRows.map((row) => (
                      <tr key={row.staffKey} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-slate-900 font-medium">
                            {row.name}
                          </div>
                          {row.secondary && (
                            <div className="text-[10px] text-slate-500">
                              {row.secondary}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700 font-semibold">
                          {row.totalCases}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {row.specialties}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {row.skillsUsed}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {row.lastDate || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {teamPerformanceRows.length === 0 && (
                <p className="text-xs text-slate-500 p-3">
                  No staff activity found for the current filters.
                </p>
              )}
            </div>

            {/* staff daily load heatmap */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Staff daily case load (heatmap)
              </h2>
              <p className="text-[11px] text-slate-600">
                Rows = staff, columns = day of week, color = average number of
                cases in current filters.
              </p>

              {staffDailyLoad.length === 0 ? (
                <p className="text-xs text-slate-500 p-3">
                  Not enough data to display.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px] border-separate border-spacing-y-1">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left font-medium pb-1 pr-4">
                          Staff
                        </th>
                        {weekdays.map((d) => (
                          <th
                            key={d}
                            className="text-center font-medium pb-1 px-2"
                          >
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staffDailyLoad.map((row) => (
                        <tr key={row.staffKey}>
                          <td className="pr-4 py-1">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {row.name}
                              </span>
                              {row.secondary && (
                                <span className="text-[10px] text-slate-500">
                                  {row.secondary}
                                </span>
                              )}
                            </div>
                          </td>
                          {row.counts.map((count, idx) => {
                            const intensity =
                              row.max === 0 ? 0 : count / row.max;
                            let bg = 'bg-slate-50';
                            if (intensity > 0.7) bg = 'bg-hmc-primary/80';
                            else if (intensity > 0.4) bg = 'bg-hmc-primary/50';
                            else if (intensity > 0.1) bg = 'bg-hmc-primary/20';
                            return (
                              <td
                                key={idx}
                                className="px-2 py-1 text-center"
                              >
                                <div
                                  className={`h-5 w-10 rounded-md mx-auto flex items-center justify-center ${bg} text-[10px] text-slate-900`}
                                >
                                  {count || ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===== SKILLS TAB ===== */}
        {activeTab === 'skills' && (
          <section className="space-y-4 text-xs">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Staff skill exposure matrix
              </h2>
              <p className="text-[11px] text-slate-600">
                Highlights exposure of staff (rows) to active skills (columns)
                in the current filters.
              </p>

              <div className="overflow-x-auto">
                {skillCoverageRows.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3">
                    No staff or skill data to display.
                  </p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider rounded-tl-xl w-40">
                          Staff member
                        </th>
                        {skills.map((skill) => (
                          <th
                            key={skill.id}
                            className="px-2 py-2 text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider min-w-[70px]"
                          >
                            {skill.code || skill.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {skillCoverageRows.map((row) => (
                        <tr key={row.staffKey} className="hover:bg-slate-50">
                          <td className="sticky left-0 bg-white hover:bg-slate-50 px-3 py-2 whitespace-nowrap z-10">
                            <div className="text-slate-900 font-medium">
                              {row.staffName}
                            </div>
                            {row.staffSecondary && (
                              <div className="text-[10px] text-slate-500">
                                {row.staffSecondary}
                              </div>
                            )}
                          </td>
                          {skills.map((skill) => {
                            const covered = row.usedSkillIds.has(skill.id);
                            return (
                              <td
                                key={skill.id}
                                className="px-2 py-2 whitespace-nowrap text-center"
                              >
                                <span
                                  className={`inline-block h-4 w-4 rounded-full ${
                                    covered
                                      ? 'bg-emerald-400'
                                      : 'bg-red-200'
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===== USERS TAB ===== */}
        {activeTab === 'users' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            {/* create user */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft space-y-3 lg:col-span-1 h-fit">
              <h2 className="text-sm font-semibold text-slate-900">
                Create new user
              </h2>
              <form onSubmit={onSubmitCreateUser} className="flex flex-col gap-3">
                <div className="flex flex-col">
                  <label className="mb-1 text-[11px] text-slate-600">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    placeholder="John Doe"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1 text-[11px] text-slate-600">
                    Email (required)
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    required
                  />
                </div>
                <div className="flex flex-col">
                  <label className="mb-1 text-[11px] text-slate-600">
                    Password (required)
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-col flex-1">
                    <label className="mb-1 text-[11px] text-slate-600">
                      Role
                    </label>
                    <select
                      value={newUserRole}
                      onChange={(e) =>
                        setNewUserRole(
                          e.target.value as 'staff' | 'supervisor' | 'admin'
                        )
                      }
                      className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    >
                      <option value="staff">Staff</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex flex-col flex-1">
                    <label className="mb-1 text-[11px] text-slate-600">
                      Home facility
                    </label>
                    <select
                      value={newUserHospitalId}
                      onChange={(e) => setNewUserHospitalId(e.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    >
                      <option value="">N/A</option>
                      {hospitals.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="mb-1 text-[11px] text-slate-600">
                    Department
                  </label>
                  <input
                    type="text"
                    value={newUserDepartment}
                    onChange={(e) => setNewUserDepartment(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-1 text-slate-900"
                    placeholder="Anaesthesia"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creationState === 'creating'}
                  className="mt-3 rounded-xl bg-hmc-primary text-white py-2 text-sm font-semibold hover:bg-hmc-primary/90 disabled:bg-slate-400"
                >
                  {creationState === 'creating' ? 'Creating…' : 'Create user'}
                </button>
              </form>
            </div>

            {/* user list */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-soft space-y-3 lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-900">
                All system users ({users.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider rounded-tl-xl">
                        Name
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        Facility
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider rounded-tr-xl">
                        Email
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {users.map((u: any) => (
                      <tr key={u.email} className="hover:bg-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-900 font-medium">
                          {u.name || 'N/A'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-[10px] leading-5 font-semibold rounded-full ${
                              u.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : u.role === 'supervisor'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                          {hospitals.find((h) => h.id === u.hospital_home_id)?.name ||
                            'N/A'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-[10px]">
                          {u.email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {users.length === 0 && (
                <p className="text-xs text-slate-500 p-3">No users found.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
