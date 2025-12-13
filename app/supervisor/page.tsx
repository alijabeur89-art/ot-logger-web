'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  email: string;
  name: string | null;
  role: string | null;
  hospital_home_id: string | null;
  department: string | null;
};

type Hospital = {
  id: string;
  name: string | null;
};

type Procedure = {
  id: string;
  name: string | null;
};

type CaseRow = {
  id: string;
  case_id: string | null;
  date: string | null;
  hospital_id: string | null;
  specialty: string | null;
  profile_type: string | null;
  asa_class: string | null;
  status: string | null;
  staff_id: string | null;
  supervisor_comment: string | null;
  created_at: string | null;
};

export default function SupervisorPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cases'>(
    'dashboard'
  );

  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('pending');

  // ---------------- LOAD DATA ----------------

  useEffect(() => {
    async function loadAll() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user || !user.email) {
          console.error('No user:', userError);
          router.push('/login');
          return;
        }

        const email = user.email;

        // profile
        const { data: profileData, error: profileError } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', email)
          .single();

        if (profileError || !profileData) {
          console.error('Profile error for supervisor:', profileError);
          router.push('/login');
          return;
        }

        setProfile(profileData as Profile);

        // hospitals
        const { data: hospData, error: hospError } = await supabase
          .from('hospitals')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        if (hospError) {
          console.error('Hospitals error:', hospError);
        } else {
          setHospitals((hospData || []) as Hospital[]);
        }

        // procedures
        const { data: procData, error: procError } = await supabase
          .from('procedures')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        if (procError) {
          console.error('Procedures error:', procError);
        } else {
          setProcedures((procData || []) as Procedure[]);
        }

        // cases for supervisor's department
        const department = profileData.department;
        let query = supabase
          .from('cases')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (department) {
          query = query.eq('department', department);
        }

        const { data: casesData, error: casesError } = await query;

        if (casesError) {
          console.error('Cases error (supervisor):', casesError);
        } else {
          const mapped = (casesData || []).map((c: any) => ({
            id: c.id as string,
            case_id: c.case_id ?? null,
            date: c.date ?? null,
            hospital_id: c.hospital_id ?? null,
            specialty: c.procedure_id ?? null,
            profile_type: c.profile_type ?? null,
            asa_class: c.asa_class ?? null,
            status: c.status ?? null,
            staff_id: c.staff_id ?? null,
            supervisor_comment: c.supervisor_comment ?? null,
            created_at: c.created_at ?? null,
          }));
          setCases(mapped);
        }
      } catch (err) {
        console.error('Unexpected load error (supervisor):', err);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [router]);

  // -------------- DASHBOARD METRICS -------------

  const supervisorName = profile?.name || 'Supervisor';

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const filteredByDept = cases; // already filtered by department from query

  const thisMonthCases = filteredByDept.filter((c) => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const pendingCases = filteredByDept.filter(
    (c) => (c.status || '').toLowerCase() === 'pending'
  );

  const approvedThisMonth = thisMonthCases.filter(
    (c) => (c.status || '').toLowerCase() === 'approved'
  );

  const uniqueStaffCount = new Set(
    filteredByDept.map((c) => c.staff_id).filter(Boolean)
  ).size;

  // -------------- FILTERED LIST FOR TABLE -------------

  const filteredCasesForList = filteredByDept.filter((c) => {
    if (selectedHospitalId !== 'all' && c.hospital_id !== selectedHospitalId) {
      return false;
    }
    if (
      statusFilter === 'pending' &&
      (c.status || '').toLowerCase() !== 'pending'
    ) {
      return false;
    }
    return true;
  });

  // -------------- ACTIONS: APPROVE / REJECT -------------

  async function updateCaseStatus(
    caseId: string,
    newStatus: 'approved' | 'rejected'
  ) {
    if (!profile?.email) return;

    let supervisor_comment: string | null = null;

    if (newStatus === 'rejected') {
      const comment = window.prompt(
        'Optional: Add a comment for this rejection:',
        ''
      );
      supervisor_comment = (comment || '').trim() || null;
    }

    setUpdatingId(caseId);
    try {
      const { error } = await supabase
        .from('cases')
        .update({
          status: newStatus,
          supervisor_comment,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);

      if (error) {
        console.error('Update case status error:', error);
        alert('Error updating case status.');
        return;
      }

      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? { ...c, status: newStatus, supervisor_comment }
            : c
        )
      );
    } catch (err) {
      console.error('Unexpected update error:', err);
      alert('Unexpected error updating status.');
    } finally {
      setUpdatingId(null);
    }
  }

  // -------------- RENDER -------------

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading supervisor dashboard…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-hmc-primarySoft via-white to-hmc-primarySoft pb-16">
      <div className="mx-auto max-w-6xl px-4 py-4 space-y-6">
        {/* HEADER */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              Supervisor dashboard
            </p>
            <h1 className="text-xl font-semibold text-hmc-ink">
              Good evening, {supervisorName}.
            </h1>
            <p className="text-[11px] text-slate-500">
              Review and approve OT anaesthesia cases for your department.
            </p>
            {profile?.department && (
              <p className="text-[11px] text-slate-500 mt-1">
                Department:{' '}
                <span className="font-medium">{profile.department}</span>
              </p>
            )}
          </div>

          {/* TOP TILES */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pending approvals */}
            <button
              type="button"
              className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3 text-left hover:shadow-lg transition"
              onClick={() => {
                setActiveTab('cases');
                setStatusFilter('pending');
              }}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-hmc-primarySoft text-hmc-primary flex items-center justify-center rounded-2xl text-lg">
                  ⏳
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-hmc-ink">
                    Pending approvals
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {pendingCases.length} cases waiting
                  </p>
                </div>
              </div>
            </button>

            {/* Approved this month */}
            <div className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3">
              <p className="text-[11px] text-slate-500">
                Approved this month
              </p>
              <p className="text-xl font-semibold text-hmc-ink">
                {approvedThisMonth.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Out of {thisMonthCases.length} total cases
              </p>
            </div>

            {/* Staff in department */}
            <div className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3">
              <p className="text-[11px] text-slate-500">Active staff</p>
              <p className="text-xl font-semibold text-hmc-ink">
                {uniqueStaffCount}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Logging cases in your department
              </p>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="space-y-4">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'dashboard'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('cases')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'cases'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              All cases
            </button>
          </div>

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <section className="space-y-4">
              {/* Small panel: next approvals */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-hmc-ink">
                    Cases needing attention
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    Showing up to 5 pending cases
                  </span>
                </div>

                {pendingCases.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No pending cases at the moment.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs">
                    {pendingCases.slice(0, 5).map((c) => {
                      const hospitalName =
                        hospitals.find((h) => h.id === c.hospital_id)?.name ||
                        'Unknown hospital';
                      const specialtyName =
                        procedures.find((p) => p.id === c.specialty)?.name ||
                        'Unknown specialty';

                      return (
                        <div
                          key={c.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="space-y-0.5">
                            <p className="font-medium text-slate-800">
                              {specialtyName}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {c.date || 'No date'} • {hospitalName}
                            </p>
                            {c.staff_id && (
                              <p className="text-[11px] text-slate-500">
                                Staff: <span className="font-medium">{c.staff_id}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              disabled={updatingId === c.id}
                              onClick={() => updateCaseStatus(c.id, 'approved')}
                              className="rounded-full bg-emerald-600 text-white px-3 py-1 disabled:opacity-60"
                            >
                              {updatingId === c.id ? 'Saving…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === c.id}
                              onClick={() => updateCaseStatus(c.id, 'rejected')}
                              className="rounded-full bg-rose-600 text-white px-3 py-1 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Placeholder for future analytics */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 text-xs space-y-2">
                <h2 className="text-sm font-semibold text-hmc-ink">
                  Department analytics (coming soon)
                </h2>
                <p className="text-slate-600">
                  Here we can add charts for case volume by hospital, ASA
                  distribution, and skill exposure for each staff member.
                </p>
              </div>
            </section>
          )}

          {/* CASES TAB */}
          {activeTab === 'cases' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-sm font-semibold text-hmc-ink">
                  All cases in your department
                </h2>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <select
                    value={selectedHospitalId}
                    onChange={(e) => setSelectedHospitalId(e.target.value)}
                    className="rounded-full border border-slate-300 px-3 py-1 bg-white"
                  >
                    <option value="all">All hospitals</option>
                    {hospitals.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | 'pending')
                    }
                    className="rounded-full border border-slate-300 px-3 py-1 bg-white"
                  >
                    <option value="pending">Pending only</option>
                    <option value="all">All statuses</option>
                  </select>
                </div>
              </div>

              {filteredCasesForList.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No cases matching the selected filters.
                </p>
              ) : (
                <div className="space-y-2 text-xs">
                  {filteredCasesForList.map((c) => {
                    const hospitalName =
                      hospitals.find((h) => h.id === c.hospital_id)?.name ||
                      'Unknown hospital';
                    const specialtyName =
                      procedures.find((p) => p.id === c.specialty)?.name ||
                      'Unknown specialty';
                    const statusLower = (c.status || '').toLowerCase();

                    return (
                      <div
                        key={c.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-800">
                            {specialtyName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {c.date || 'No date'} • {hospitalName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Staff:{' '}
                            <span className="font-medium">
                              {c.staff_id || 'Unknown'}
                            </span>
                          </p>
                          {c.supervisor_comment && (
                            <p className="text-[11px] text-amber-700">
                              Comment: {c.supervisor_comment}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] border ${
                              statusLower === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : statusLower === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {c.status || 'pending'}
                          </span>

                          {statusLower === 'pending' && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <button
                                type="button"
                                disabled={updatingId === c.id}
                                onClick={() =>
                                  updateCaseStatus(c.id, 'approved')
                                }
                                className="rounded-full bg-emerald-600 text-white px-3 py-1 disabled:opacity-60"
                              >
                                {updatingId === c.id ? 'Saving…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === c.id}
                                onClick={() =>
                                  updateCaseStatus(c.id, 'rejected')
                                }
                                className="rounded-full bg-rose-600 text-white px-3 py-1 disabled:opacity-60"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
