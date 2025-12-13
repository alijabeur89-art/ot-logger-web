'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  email: string;
  name: string;
  role: string;
  hospital_home_id: string | null;
  department: string | null;
};

type Hospital = {
  id: string;
  code: string;
  name: string;
};

type Procedure = {
  id: string;
  code: string;
  name: string;
};

type Skill = {
  id: string;
  code: string;
  name: string;
};

type StaffProfile = {
  id: string;
  name: string | null;
  email: string;
};

type SupervisorCase = {
  id: string;
  case_id: string | null;
  date: string | null;
  patient_code: string | null;
  profile_type: string | null;
  asa_class: string | null;
  ot_room: string | null;
  status: string | null;
  supervisor_comment: string | null;
  hospital_id: string | null;
  procedure_id: string | null;
  staff_id: string | null;
  skills: Skill[];
};

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function SupervisorPage() {
  const router = useRouter();

  // ====== STATE HOOKS (all at the top, fixed order) ======
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [cases, setCases] = useState<SupervisorCase[]>([]);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [reviewComment, setReviewComment] = useState<Record<string, string>>(
    {}
  );
  const [reviewLoading, setReviewLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cases'>('dashboard');

  // ====== LOAD ALL DATA ======
  useEffect(() => {
    const loadAll = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/login');
          return;
        }

        const { data: prof, error: profError } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', user.email)
          .single();

        if (profError || !prof) {
          console.error('Profile error:', profError);
          router.push('/login');
          return;
        }

        const profileData: Profile = {
          id: prof.id,
          email: prof.email,
          name: prof.name,
          role: prof.role,
          hospital_home_id: prof.hospital_home_id,
          department: prof.department,
        };

        // Only supervisors allowed here
        if (profileData.role.toLowerCase() !== 'supervisor') {
          if (profileData.role.toLowerCase() === 'staff') {
            router.push('/staff');
          } else if (profileData.role.toLowerCase() === 'admin') {
            router.push('/admin');
          } else {
            router.push('/login');
          }
          return;
        }

        setProfile(profileData);

        // Hospitals
        const { data: hospData, error: hospError } = await supabase
          .from('hospitals')
          .select('id, code, name');

        if (hospError) {
          console.error('Hospitals error:', hospError);
        } else {
          setHospitals(hospData || []);
        }

        // Procedures
        const { data: procData, error: procError } = await supabase
          .from('procedures')
          .select('id, code, name');

        if (procError) {
          console.error('Procedures error:', procError);
        } else {
          setProcedures(procData || []);
        }

        // Staff profiles (for display)
        const { data: staffData, error: staffError } = await supabase
          .from('users_profile')
          .select('id, name, email');

        if (staffError) {
          console.error('Staff profiles error:', staffError);
        } else {
          setStaffProfiles(
            (staffData || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              email: s.email,
            }))
          );
        }

        // Cases – filtered by supervisor department & hospital (if set)
let casesQuery = supabase
  .from('cases')
  .select(
    `
    id,
    case_id,
    date,
    patient_code,
    profile_type,
    asa_class,
    ot_room,
    status,
    supervisor_comment,
    hospital_id,
    procedure_id,
    staff_id,
    department
  `
  )
  .order('date', { ascending: false });

// Filter by department if supervisor has one
if (profileData.department) {
  casesQuery = casesQuery.eq('department', profileData.department);
}

// Filter by hospital if supervisor is assigned to one
if (profileData.hospital_home_id) {
  casesQuery = casesQuery.eq('hospital_id', profileData.hospital_home_id);
}

const { data: casesData, error: casesError } = await casesQuery;



        if (casesError) {
          console.error('Cases error:', casesError);
          setCases([]);
          return;
        }

        const rawCases = (casesData || []) as any[];

        if (rawCases.length === 0) {
          setCases([]);
          return;
        }

        const caseIds = rawCases.map((c) => c.id);

        // Load skills for these cases
        const { data: caseSkillsData, error: caseSkillsError } = await supabase
          .from('case_skills')
          .select(
            `
            case_id,
            skills:skill_id (
              id,
              code,
              name
            )
          `
          )
          .in('case_id', caseIds);

        if (caseSkillsError) {
          console.error('Case skills load error:', caseSkillsError);
        }

        const skillsByCase: Record<string, Skill[]> = {};
        (caseSkillsData || []).forEach((cs: any) => {
          const cid = cs.case_id as string;
          const skill = cs.skills as Skill | null;
          if (!skill) return;
          if (!skillsByCase[cid]) skillsByCase[cid] = [];
          skillsByCase[cid].push(skill);
        });

        const supervisorCases: SupervisorCase[] = rawCases.map((c) => ({
          id: c.id,
          case_id: c.case_id,
          date: c.date,
          patient_code: c.patient_code,
          profile_type: c.profile_type,
          asa_class: c.asa_class,
          ot_room: c.ot_room,
          status: c.status,
          supervisor_comment: c.supervisor_comment,
          hospital_id: c.hospital_id,
          procedure_id: c.procedure_id,
          staff_id: c.staff_id,
          skills: skillsByCase[c.id] || [],
        }));

        setCases(supervisorCases);
      } catch (err) {
        console.error('Unexpected load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [router]);

  // ====== HELPERS ======
  const formatDate = (value: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  };

  const getHospitalLabel = (id: string | null) => {
    if (!id) return '-';
    const h = hospitals.find((x) => x.id === id);
    if (!h) return '-';
    return h.code || h.name || '-';
  };

  const getProcedureLabel = (id: string | null) => {
    if (!id) return '-';
    const p = procedures.find((x) => x.id === id);
    if (!p) return '-';
    return p.name || '-';
  };

  const getStaffLabel = (id: string | null) => {
    if (!id) return '-';
    const s = staffProfiles.find((x) => x.id === id);
    if (!s) return '-';
    return s.name ? `${s.name} (${s.email})` : s.email;
  };

  const filteredCases = cases.filter((c) => {
    if (statusFilter === 'all') return true;
    return (c.status || 'pending').toLowerCase() === statusFilter;
  });

  const totalCases = cases.length;
  const pendingCases = cases.filter(
    (c) => (c.status || 'pending').toLowerCase() === 'pending'
  ).length;
  const approvedCases = cases.filter(
    (c) => (c.status || '').toLowerCase() === 'approved'
  ).length;
  const rejectedCases = cases.filter(
    (c) => (c.status || '').toLowerCase() === 'rejected'
  ).length;

  const renderStatusBadge = (status: string | null) => {
    const s = (status || 'pending').toLowerCase();
    let color = 'bg-amber-100 text-amber-700 border-amber-200';
    if (s === 'approved')
      color = 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'rejected') color = 'bg-rose-100 text-rose-700 border-rose-200';

    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
      >
        {status || 'pending'}
      </span>
    );
  };

  const renderSkillsChips = (skillsArr: Skill[]) => {
    if (!skillsArr || skillsArr.length === 0) {
      return (
        <span className="text-[11px] text-slate-400">No skills tagged</span>
      );
    }
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {skillsArr.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700"
          >
            {s.name}
          </span>
        ))}
      </div>
    );
  };

  const handleReview = async (
    caseId: string,
    newStatus: 'approved' | 'rejected'
  ) => {
    setReviewLoading((prev) => ({ ...prev, [caseId]: true }));
    const comment = reviewComment[caseId] || '';

    try {
      const { error } = await supabase
        .from('cases')
        .update({
          status: newStatus,
          supervisor_comment: comment || null,
        })
        .eq('id', caseId);

      if (error) {
        console.error('Case review error:', error);
        return;
      }

      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                status: newStatus,
                supervisor_comment: comment || null,
              }
            : c
        )
      );
    } catch (err) {
      console.error('Unexpected review error:', err);
    } finally {
      setReviewLoading((prev) => ({ ...prev, [caseId]: false }));
    }
  };

  const renderCaseCard = (c: SupervisorCase) => {
    const isExpanded = expandedCaseId === c.id;
    const commentValue = reviewComment[c.id] ?? c.supervisor_comment ?? '';

    return (
      <div
        key={c.id}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div
          className="flex items-start justify-between gap-3 cursor-pointer"
          onClick={() => setExpandedCaseId(isExpanded ? null : c.id)}
        >
          <div>
            <div className="text-xs font-semibold text-slate-400">
              {c.case_id || 'No ID'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {getProcedureLabel(c.procedure_id)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {formatDate(c.date)} • {getHospitalLabel(c.hospital_id)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {getStaffLabel(c.staff_id)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {renderStatusBadge(c.status)}
            <button
              type="button"
              className="text-[11px] text-sky-600 hover:text-sky-800"
            >
              {isExpanded ? 'Hide details' : 'View details'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 border-t border-slate-100 pt-3 space-y-2 text-xs text-slate-700">
            <div className="flex justify-between">
              <span className="font-medium">Patient:</span>
              <span>{c.patient_code || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Profile:</span>
              <span>{c.profile_type || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">ASA:</span>
              <span>{c.asa_class || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">OT room:</span>
              <span>{c.ot_room || '-'}</span>
            </div>
            <div>
              <span className="font-medium">Skills: </span>
              {renderSkillsChips(c.skills)}
            </div>
            {c.supervisor_comment && !reviewComment[c.id] && (
              <div>
                <span className="font-medium">Previous comment: </span>
                <span className="italic">{c.supervisor_comment}</span>
              </div>
            )}

            {(c.status || 'pending').toLowerCase() === 'pending' && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 space-y-2">
                <label className="block text-[11px] text-slate-600">
                  Comment to staff (optional)
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    rows={2}
                    value={commentValue}
                    onChange={(e) =>
                      setReviewComment((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReview(c.id, 'rejected');
                    }}
                    disabled={!!reviewLoading[c.id]}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-60"
                  >
                    {reviewLoading[c.id] ? 'Updating…' : 'Reject'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReview(c.id, 'approved');
                    }}
                    disabled={!!reviewLoading[c.id]}
                    className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm disabled:opacity-60"
                  >
                    {reviewLoading[c.id] ? 'Updating…' : 'Approve'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total cases" value={totalCases} tone="default" />
        <StatCard label="Pending" value={pendingCases} tone="amber" />
        <StatCard label="Approved" value={approvedCases} tone="emerald" />
        <StatCard label="Rejected" value={rejectedCases} tone="rose" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Pending cases overview
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Quick view of the most recent pending cases in your department.
        </p>
        <div className="mt-3 space-y-2">
          {cases
            .filter(
              (c) => (c.status || 'pending').toLowerCase() === 'pending'
            )
            .slice(0, 5)
            .map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="text-xs">
                  <div className="font-medium text-slate-800">
                    {getProcedureLabel(c.procedure_id)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatDate(c.date)} • {getHospitalLabel(c.hospital_id)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {getStaffLabel(c.staff_id)}
                  </div>
                </div>
                {renderStatusBadge(c.status)}
              </div>
            ))}
          {pendingCases === 0 && (
            <p className="text-xs text-slate-400">
              No pending cases right now. 🎉
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderCasesList = () => (
    <div className="space-y-3 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Department cases
        </h2>
        <span className="text-[11px] text-slate-500">
          Showing {filteredCases.length} of {cases.length}
        </span>
      </div>

      <div className="flex gap-2 mb-1">
        <FilterPill
          label="Pending"
          active={statusFilter === 'pending'}
          onClick={() => setStatusFilter('pending')}
        />
        <FilterPill
          label="Approved"
          active={statusFilter === 'approved'}
          onClick={() => setStatusFilter('approved')}
        />
        <FilterPill
          label="Rejected"
          active={statusFilter === 'rejected'}
          onClick={() => setStatusFilter('rejected')}
        />
        <FilterPill
          label="All"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
      </div>

      {filteredCases.length === 0 && (
        <p className="text-xs text-slate-400">
          No cases matching this filter.
        </p>
      )}

      <div className="space-y-3">
        {filteredCases.map((c) => renderCaseCard(c))}
      </div>
    </div>
  );

  // ====== MAIN RENDER ======
  if (loading || !profile) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-500">
          Loading supervisor dashboard…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-16">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">
              Hamad Medical Corporation
            </p>
            <h1 className="text-sm font-semibold text-slate-900">
              OT Case Logger • Supervisor
            </h1>
            <p className="text-[11px] text-slate-500">
              {profile.department || 'Anaesthesia'} •{' '}
              {profile.hospital_home_id ? 'Assigned hospital' : 'Multi-site'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-800">
              {profile.name}
            </p>
            <p className="text-[11px] text-slate-500">{profile.email}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'cases' && renderCasesList()}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-4 py-2">
          <BottomNavButton
            label="Dashboard"
            icon="📊"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <BottomNavButton
            label="Cases"
            icon="📋"
            active={activeTab === 'cases'}
            onClick={() => setActiveTab('cases')}
          />
        </div>
      </nav>
    </main>
  );
}

// ====== SMALL COMPONENTS ======

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'amber' | 'emerald' | 'rose';
}) {
  let classes = 'border-slate-200 bg-white text-slate-900';
  if (tone === 'amber')
    classes = 'border-amber-100 bg-amber-50 text-amber-800';
  if (tone === 'emerald')
    classes = 'border-emerald-100 bg-emerald-50 text-emerald-800';
  if (tone === 'rose') classes = 'border-rose-100 bg-rose-50 text-rose-800';

  return (
    <div className={`rounded-2xl border px-3 py-2 shadow-sm ${classes}`}>
      <div className="text-[11px] font-medium">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function BottomNavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center rounded-full px-2 py-1 text-[11px] ${
        active
          ? 'bg-sky-50 text-sky-700'
          : 'text-slate-500 hover:bg-slate-50'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="mt-0.5">{label}</span>
    </button>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] ${
        active
          ? 'border-sky-500 bg-sky-50 text-sky-800'
          : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}
