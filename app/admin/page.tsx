'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  email: string;
  name: string;
  role: string;
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
  role: string;
  hospital_home_id: string | null;
  department: string | null;
};

type CaseRow = {
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
  department: string | null;
};

type CaseSkillRow = {
  case_id: string;
  skill_id: string;
};

type AdminTab =
  | 'dashboard'
  | 'hospitals'
  | 'staff'
  | 'skills'
  | 'export'
  | 'users';

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseSkills, setCaseSkills] = useState<CaseSkillRow[]>([]);

  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Global filters for analytics
  const [filterHospitalId, setFilterHospitalId] = useState<string | 'all'>(
    'all'
  );
  const [filterStaffId, setFilterStaffId] = useState<string | 'all'>('all');
  const [filterFrom, setFilterFrom] = useState<string>(''); // YYYY-MM-DD
  const [filterTo, setFilterTo] = useState<string>(''); // YYYY-MM-DD

  // User management form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'staff' | 'supervisor' | 'admin'>('staff');
  const [newUserHospitalId, setNewUserHospitalId] = useState<string>('');
  const [newUserDepartment, setNewUserDepartment] = useState('');
  const [userCreateLoading, setUserCreateLoading] = useState(false);
  const [userCreateMessage, setUserCreateMessage] = useState<string | null>(
    null
  );

  // ========= LOAD DATA =========
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
        };

        if (profileData.role.toLowerCase() !== 'admin') {
          if (profileData.role.toLowerCase() === 'staff') {
            router.push('/staff');
          } else if (profileData.role.toLowerCase() === 'supervisor') {
            router.push('/supervisor');
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
        if (hospError) console.error('Hospitals error:', hospError);
        else setHospitals(hospData || []);

        // Procedures
        const { data: procData, error: procError } = await supabase
          .from('procedures')
          .select('id, code, name');
        if (procError) console.error('Procedures error:', procError);
        else setProcedures(procData || []);

        // Skills
        const { data: skillsData, error: skillsError } = await supabase
          .from('skills')
          .select('id, code, name');
        if (skillsError) console.error('Skills error:', skillsError);
        else setSkills(skillsData || []);

        // Staff profiles
        const { data: staffData, error: staffError } = await supabase
          .from('users_profile')
          .select('id, name, email, role, hospital_home_id, department');
        if (staffError) {
          console.error('Staff profiles error:', staffError);
        } else {
          setStaffProfiles(
            (staffData || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              email: s.email,
              role: s.role,
              hospital_home_id: s.hospital_home_id,
              department: s.department,
            }))
          );
        }

        // Cases (all)
        const { data: casesData, error: casesError } = await supabase
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

        if (casesError) {
          console.error('Cases error:', casesError);
          setCases([]);
        } else {
          setCases((casesData || []) as CaseRow[]);
        }

        // Case skills
        const { data: csData, error: csError } = await supabase
          .from('case_skills')
          .select('case_id, skill_id');
        if (csError) {
          console.error('Case skills error:', csError);
          setCaseSkills([]);
        } else {
          setCaseSkills(
            (csData || []).map((r: any) => ({
              case_id: r.case_id,
              skill_id: r.skill_id,
            }))
          );
        }
      } catch (err) {
        console.error('Unexpected admin load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [router]);

  // ========= FILTERED CASES =========

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // hospital filter
      if (filterHospitalId !== 'all' && c.hospital_id !== filterHospitalId) {
        return false;
      }
      // staff filter
      if (filterStaffId !== 'all' && c.staff_id !== filterStaffId) {
        return false;
      }
      // date filters
      if (filterFrom) {
        const dFrom = new Date(filterFrom);
        const cDate = new Date(c.date || '');
        if (!Number.isNaN(cDate.getTime()) && cDate < dFrom) return false;
      }
      if (filterTo) {
        const dTo = new Date(filterTo);
        const cDate = new Date(c.date || '');
        if (!Number.isNaN(cDate.getTime()) && cDate > dTo) return false;
      }
      return true;
    });
  }, [cases, filterHospitalId, filterStaffId, filterFrom, filterTo]);

  const filteredCaseIdsSet = useMemo(
    () => new Set(filteredCases.map((c) => c.id)),
    [filteredCases]
  );

  // ========= DERIVED METRICS =========

  const totalCases = filteredCases.length;
  const pendingCases = filteredCases.filter(
    (c) => (c.status || 'pending').toLowerCase() === 'pending'
  ).length;
  const approvedCases = filteredCases.filter(
    (c) => (c.status || '').toLowerCase() === 'approved'
  ).length;
  const rejectedCases = filteredCases.filter(
    (c) => (c.status || '').toLowerCase() === 'rejected'
  ).length;

  // Hospital summary (from filtered cases)
  const hospitalSummary = useMemo(() => {
    const map: Record<
      string,
      {
        hospital: Hospital | null;
        total: number;
        pending: number;
        approved: number;
        rejected: number;
      }
    > = {};

    filteredCases.forEach((c) => {
      const hid = c.hospital_id || 'unknown';
      if (!map[hid]) {
        map[hid] = {
          hospital: hospitals.find((h) => h.id === hid) || null,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        };
      }
      map[hid].total += 1;
      const s = (c.status || 'pending').toLowerCase();
      if (s === 'pending') map[hid].pending += 1;
      else if (s === 'approved') map[hid].approved += 1;
      else if (s === 'rejected') map[hid].rejected += 1;
    });

    return Object.entries(map).map(([id, v]) => ({
      hospitalId: id,
      code: v.hospital?.code || '-',
      name: v.hospital?.name || 'Unknown hospital',
      total: v.total,
      pending: v.pending,
      approved: v.approved,
      rejected: v.rejected,
    }));
  }, [filteredCases, hospitals]);

  // Staff summary (from filtered cases)
  const staffSummary = useMemo(() => {
    const map: Record<
      string,
      {
        staff: StaffProfile | null;
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        lastDate: string | null;
      }
    > = {};

    filteredCases.forEach((c) => {
      const sid = c.staff_id || 'unknown';
      if (!map[sid]) {
        map[sid] = {
          staff: staffProfiles.find((s) => s.id === sid) || null,
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          lastDate: null,
        };
      }
      map[sid].total += 1;
      const s = (c.status || 'pending').toLowerCase();
      if (s === 'pending') map[sid].pending += 1;
      else if (s === 'approved') map[sid].approved += 1;
      else if (s === 'rejected') map[sid].rejected += 1;

      if (c.date) {
        if (!map[sid].lastDate) {
          map[sid].lastDate = c.date;
        } else {
          const curr = new Date(map[sid].lastDate);
          const next = new Date(c.date);
          if (!Number.isNaN(next.getTime()) && next > curr) {
            map[sid].lastDate = c.date;
          }
        }
      }
    });

    return Object.entries(map).map(([id, v]) => ({
      staffId: id,
      name: v.staff?.name || 'Unknown',
      email: v.staff?.email || '-',
      role: v.staff?.role || '-',
      total: v.total,
      pending: v.pending,
      approved: v.approved,
      rejected: v.rejected,
      lastDate: v.lastDate,
    }));
  }, [filteredCases, staffProfiles]);

  // Top 5 staff (most / least cases) from filtered staffSummary
  const topStaffMost = useMemo(
    () =>
      [...staffSummary]
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    [staffSummary]
  );

  const topStaffLeast = useMemo(
    () =>
      [...staffSummary]
        .filter((s) => s.total > 0)
        .sort((a, b) => a.total - b.total)
        .slice(0, 5),
    [staffSummary]
  );

  // Skills usage (only for filtered cases)
  const skillsUsage = useMemo(() => {
    const map: Record<string, { skill: Skill | null; count: number }> = {};

    caseSkills.forEach((cs) => {
      // Only count if the case is in filteredCases
      if (!filteredCaseIdsSet.has(cs.case_id)) return;
      const skId = cs.skill_id;
      if (!map[skId]) {
        map[skId] = {
          skill: skills.find((s) => s.id === skId) || null,
          count: 0,
        };
      }
      map[skId].count += 1;
    });

    return Object.entries(map)
      .map(([id, v]) => ({
        skillId: id,
        name: v.skill?.name || 'Unknown skill',
        code: v.skill?.code || '',
        count: v.count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [caseSkills, skills, filteredCaseIdsSet]);

  // Profile + ASA distribution (filtered)
  const profileDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCases.forEach((c) => {
      const key = c.profile_type || 'Unknown';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredCases]);

  const asaDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    filteredCases.forEach((c) => {
      const key = c.asa_class || 'Unknown';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredCases]);

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

  const getStaffName = (id: string | null) => {
    if (!id) return '-';
    const s = staffProfiles.find((x) => x.id === id);
    if (!s) return '-';
    return s.name || s.email;
  };

  // ========= SKILL GAP MATRIX & ALERTS =========

  const skillGapMatrix = useMemo(() => {
    // Build case -> skills lookup, but only for filtered cases
    const skillsByCase: Record<string, string[]> = {};
    caseSkills.forEach((cs) => {
      if (!filteredCaseIdsSet.has(cs.case_id)) return;
      if (!skillsByCase[cs.case_id]) skillsByCase[cs.case_id] = [];
      skillsByCase[cs.case_id].push(cs.skill_id);
    });

    // Staff list: only "staff" role
    const staffList = staffProfiles.filter(
      (s) => s.role && s.role.toLowerCase() === 'staff'
    );

    // Initialize matrix
    const matrix: Record<string, Record<string, number>> = {};
    staffList.forEach((s) => {
      matrix[s.id] = {};
      skills.forEach((sk) => {
        matrix[s.id][sk.id] = 0;
      });
    });

    // Count occurrences
    filteredCases.forEach((c) => {
      const sid = c.staff_id;
      if (!sid || !matrix[sid]) return;

      const skillIds = skillsByCase[c.id] || [];
      skillIds.forEach((skId) => {
        if (matrix[sid][skId] !== undefined) {
          matrix[sid][skId] += 1;
        }
      });
    });

    return { matrix, staffList };
  }, [filteredCases, caseSkills, skills, staffProfiles, filteredCaseIdsSet]);

  const skillGapAlerts = useMemo(() => {
    const alerts: { staff: StaffProfile; skill: Skill }[] = [];
    const { matrix, staffList } = skillGapMatrix;

    staffList.forEach((s) => {
      skills.forEach((sk) => {
        if (matrix[s.id] && matrix[s.id][sk.id] === 0) {
          alerts.push({ staff: s, skill: sk });
        }
      });
    });

    return alerts;
  }, [skillGapMatrix, skills]);

  // ========= CSV EXPORT HELPERS =========

  const downloadCsv = (filename: string, rows: any[]) => {
    if (!rows || rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const csvContent =
      headers.join(',') +
      '\n' +
      rows
        .map((row) =>
          headers
            .map((h) => {
              const val = row[h] ?? '';
              const str = String(val).replace(/"/g, '""');
              return `"${str}"`;
            })
            .join(',')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Exports respect filters (use filteredCases and summaries)
  const handleExportAllCases = () => {
    const rows = filteredCases.map((c) => ({
      case_id: c.case_id,
      date: c.date,
      hospital: getHospitalLabel(c.hospital_id),
      department: c.department,
      procedure: getProcedureLabel(c.procedure_id),
      staff: getStaffName(c.staff_id),
      patient_code: c.patient_code,
      profile_type: c.profile_type,
      asa_class: c.asa_class,
      ot_room: c.ot_room,
      status: c.status,
      supervisor_comment: c.supervisor_comment,
    }));
    downloadCsv('ot_cases_filtered.csv', rows);
  };

  const handleExportHospitalSummary = () => {
    const rows = hospitalSummary.map((h) => ({
      hospital_code: h.code,
      hospital_name: h.name,
      total_cases: h.total,
      pending: h.pending,
      approved: h.approved,
      rejected: h.rejected,
    }));
    downloadCsv('ot_cases_by_hospital_filtered.csv', rows);
  };

  const handleExportStaffSummary = () => {
    const rows = staffSummary.map((s) => ({
      staff_name: s.name,
      email: s.email,
      role: s.role,
      total_cases: s.total,
      pending: s.pending,
      approved: s.approved,
      rejected: s.rejected,
      last_case_date: s.lastDate,
    }));
    downloadCsv('ot_cases_by_staff_filtered.csv', rows);
  };

  // ========= USER CREATION HANDLER =========

  const handleCreateUser = async () => {
    setUserCreateMessage(null);

    if (!newUserEmail || !newUserPassword) {
      setUserCreateMessage('Email and password are required.');
      return;
    }

    try {
      setUserCreateLoading(true);

      const body = {
        email: newUserEmail,
        password: newUserPassword,
        name: newUserName,
        role: newUserRole,
        hospital_home_id: newUserHospitalId || null,
        department: newUserDepartment || null,
      };

      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        setUserCreateMessage(json.error || 'Failed to create user.');
        return;
      }

      setUserCreateMessage('User created successfully.');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('staff');
      setNewUserHospitalId('');
      setNewUserDepartment('');
    } catch (err: any) {
      setUserCreateMessage(err.message || 'Unexpected error.');
    } finally {
      setUserCreateLoading(false);
    }
  };

  // ========= RENDER HELPERS =========

  const renderFiltersBar = () => (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-[11px] flex flex-wrap gap-3 items-end">
      <div>
        <label className="block mb-1 text-slate-600">Hospital</label>
        <select
          className="rounded-xl border border-slate-300 px-2 py-1"
          value={filterHospitalId}
          onChange={(e) => setFilterHospitalId(e.target.value as any)}
        >
          <option value="all">All hospitals</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>
              {h.code || h.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-1 text-slate-600">Staff</label>
        <select
          className="rounded-xl border border-slate-300 px-2 py-1 min-w-[140px]"
          value={filterStaffId}
          onChange={(e) => setFilterStaffId(e.target.value as any)}
        >
          <option value="all">All staff</option>
          {staffProfiles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block mb-1 text-slate-600">From</label>
        <input
          type="date"
          className="rounded-xl border border-slate-300 px-2 py-1"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
        />
      </div>

      <div>
        <label className="block mb-1 text-slate-600">To</label>
        <input
          type="date"
          className="rounded-xl border border-slate-300 px-2 py-1"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="ml-auto rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
        onClick={() => {
          setFilterHospitalId('all');
          setFilterStaffId('all');
          setFilterFrom('');
          setFilterTo('');
        }}
      >
        Reset filters
      </button>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total cases" value={totalCases} tone="default" />
        <StatCard label="Pending" value={pendingCases} tone="amber" />
        <StatCard label="Approved" value={approvedCases} tone="emerald" />
        <StatCard label="Rejected" value={rejectedCases} tone="rose" />
      </div>

      {/* Distribution cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Profile distribution
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Adult / Paediatric / Special needs.
          </p>
          <div className="mt-3 space-y-1 text-xs">
            {profileDistribution.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span className="font-medium text-slate-700">
                  {item.name}
                </span>
                <span className="text-slate-900">{item.value}</span>
              </div>
            ))}
            {profileDistribution.length === 0 && (
              <p className="text-xs text-slate-400">
                No data yet. Once cases are logged, distribution will appear.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            ASA distribution
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            ASA classes based on logged cases.
          </p>
          <div className="mt-3 space-y-1 text-xs">
            {asaDistribution.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span className="font-medium text-slate-700">
                  {item.name}
                </span>
                <span className="text-slate-900">{item.value}</span>
              </div>
            ))}
            {asaDistribution.length === 0 && (
              <p className="text-xs text-slate-400">
                No data yet. Once cases are logged, distribution will appear.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Top staff lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Top 5 staff – highest case volume
          </h2>
          <ul className="mt-3 space-y-1 text-xs">
            {topStaffMost.map((s, idx) => (
              <li
                key={s.staffId}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span>
                  <span className="font-semibold text-slate-700">
                    #{idx + 1} {s.name}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">
                    ({s.email})
                  </span>
                </span>
                <span className="text-slate-900">{s.total} cases</span>
              </li>
            ))}
            {topStaffMost.length === 0 && (
              <p className="text-xs text-slate-400">No data yet.</p>
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Top 5 staff – lowest case volume
          </h2>
          <ul className="mt-3 space-y-1 text-xs">
            {topStaffLeast.map((s, idx) => (
              <li
                key={s.staffId}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <span>
                  <span className="font-semibold text-slate-700">
                    #{idx + 1} {s.name}
                  </span>
                  <span className="ml-1 text-[11px] text-slate-500">
                    ({s.email})
                  </span>
                </span>
                <span className="text-slate-900">{s.total} cases</span>
              </li>
            ))}
            {topStaffLeast.length === 0 && (
              <p className="text-xs text-slate-400">No data yet.</p>
            )}
          </ul>
        </div>
      </div>

      {/* Recent cases */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Recent cases (last 10, filtered)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Respecting hospital / staff / date filters.
        </p>
        <div className="mt-3 space-y-2">
          {filteredCases.slice(0, 10).map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"
            >
              <div>
                <div className="font-medium text-slate-800">
                  {getProcedureLabel(c.procedure_id)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatDate(c.date)} • {getHospitalLabel(c.hospital_id)} •{' '}
                  {c.department || 'No department'}
                </div>
                <div className="text-[11px] text-slate-500">
                  {getStaffName(c.staff_id)} • {c.profile_type || 'Unknown'} •{' '}
                  {c.asa_class || 'ASA ?'}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
          {filteredCases.length === 0 && (
            <p className="text-xs text-slate-400">
              No cases matching current filters.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderHospitals = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Hospitals overview
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Case load and status per hospital (filtered).
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Code
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Hospital
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">
                Total
              </th>
              <th className="px-3 py-2 text-right font-medium text-amber-700">
                Pending
              </th>
              <th className="px-3 py-2 text-right font-medium text-emerald-700">
                Approved
              </th>
              <th className="px-3 py-2 text-right font-medium text-rose-700">
                Rejected
              </th>
            </tr>
          </thead>
          <tbody>
            {hospitalSummary.map((h) => (
              <tr key={h.hospitalId} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{h.code}</td>
                <td className="px-3 py-2 text-slate-700">{h.name}</td>
                <td className="px-3 py-2 text-right text-slate-900">
                  {h.total}
                </td>
                <td className="px-3 py-2 text-right text-amber-700">
                  {h.pending}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {h.approved}
                </td>
                <td className="px-3 py-2 text-right text-rose-700">
                  {h.rejected}
                </td>
              </tr>
            ))}
            {hospitalSummary.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-3 text-center text-slate-400"
                >
                  No data for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStaff = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Staff case activity
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Cases per staff member (filtered).
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Email
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Role
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">
                Total
              </th>
              <th className="px-3 py-2 text-right font-medium text-amber-700">
                Pending
              </th>
              <th className="px-3 py-2 text-right font-medium text-emerald-700">
                Approved
              </th>
              <th className="px-3 py-2 text-right font-medium text-rose-700">
                Rejected
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">
                Last case
              </th>
            </tr>
          </thead>
          <tbody>
            {staffSummary.map((s) => (
              <tr key={s.staffId} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{s.name}</td>
                <td className="px-3 py-2 text-slate-700">{s.email}</td>
                <td className="px-3 py-2 text-slate-700">{s.role}</td>
                <td className="px-3 py-2 text-right text-slate-900">
                  {s.total}
                </td>
                <td className="px-3 py-2 text-right text-amber-700">
                  {s.pending}
                </td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {s.approved}
                </td>
                <td className="px-3 py-2 text-right text-rose-700">
                  {s.rejected}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {s.lastDate ? formatDate(s.lastDate) : '-'}
                </td>
              </tr>
            ))}
            {staffSummary.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-3 text-center text-slate-400"
                >
                  No staff activity for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSkills = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Skills usage & gaps
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Based on cases matching the current filters.
        </p>
      </div>

      {/* Skills usage table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Skill
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                Code
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">
                Cases
              </th>
            </tr>
          </thead>
          <tbody>
            {skillsUsage.map((s) => (
              <tr key={s.skillId} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{s.name}</td>
                <td className="px-3 py-2 text-slate-600">{s.code}</td>
                <td className="px-3 py-2 text-right text-slate-900">
                  {s.count}
                </td>
              </tr>
            ))}
            {skillsUsage.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-3 text-center text-slate-400"
                >
                  No skill data yet for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Skill gap alerts */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-amber-900">
          Skill gap alerts (current filters)
        </h3>
        <p className="mt-1 text-[11px] text-amber-800">
          Staff with zero logged cases for a skill in the selected period /
          hospital / staff scope.
        </p>
        <div className="mt-2 max-h-60 overflow-y-auto space-y-1 text-xs">
          {skillGapAlerts.slice(0, 100).map((a, idx) => (
            <div
              key={`${a.staff.id}-${a.skill.id}-${idx}`}
              className="flex justify-between rounded-xl bg-white px-3 py-1"
            >
              <span>
                <span className="font-medium">
                  {a.staff.name || a.staff.email}
                </span>
                <span className="text-[11px] text-slate-500">
                  {' '}
                  – {a.skill.name}
                </span>
              </span>
              <span className="text-[10px] text-slate-500">0 cases</span>
            </div>
          ))}
          {skillGapAlerts.length === 0 && (
            <p className="text-xs text-amber-700">
              No skill gaps detected under the current filters.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderExport = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Export reports
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Exports respect current filters (hospital, staff, date range).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              All cases (detailed, filtered)
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              One row per case, with hospital, staff, profile, ASA and status.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportAllCases}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
          >
            ⬇ Download CSV
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              Summary by hospital (filtered)
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Aggregated counts per hospital (total, pending, approved,
              rejected).
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportHospitalSummary}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
          >
            ⬇ Download CSV
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              Summary by staff (filtered)
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Per staff member: total cases and status breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportStaffSummary}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
          >
            ⬇ Download CSV
          </button>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          User management
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Create staff / supervisor / admin accounts with login credentials.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-[11px] space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="block mb-1 text-slate-600">Name</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-600">Email *</label>
            <input
              type="email"
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-600">Password *</label>
            <input
              type="password"
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-600">Role</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              value={newUserRole}
              onChange={(e) =>
                setNewUserRole(e.target.value as 'staff' | 'supervisor' | 'admin')
              }
            >
              <option value="staff">Staff</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-slate-600">Home hospital</label>
            <select
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              value={newUserHospitalId}
              onChange={(e) => setNewUserHospitalId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code || h.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-slate-600">Department</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-300 px-2 py-1"
              placeholder="Anaesthesia"
              value={newUserDepartment}
              onChange={(e) => setNewUserDepartment(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-slate-500">
            * Email and password are required. New user will be created in
            Supabase Auth and in users_profile.
          </p>
          <button
            type="button"
            disabled={userCreateLoading}
            onClick={handleCreateUser}
            className="inline-flex items-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          >
            {userCreateLoading ? 'Creating…' : 'Create user'}
          </button>
        </div>

        {userCreateMessage && (
          <p className="text-[11px] text-slate-700">{userCreateMessage}</p>
        )}
      </div>
    </div>
  );

  // ========= MAIN RENDER =========

  if (loading || !profile) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-500">
          Loading admin dashboard…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white/95 p-4 md:flex md:flex-col">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">
            Hamad Medical Corporation
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            OT Case Logger
          </p>
          <p className="text-[11px] text-slate-500">Admin console</p>
        </div>

        <nav className="flex-1 space-y-1 text-[13px]">
          <SidebarItem
            label="Dashboard"
            icon="📊"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarItem
            label="Hospitals"
            icon="🏥"
            active={activeTab === 'hospitals'}
            onClick={() => setActiveTab('hospitals')}
          />
          <SidebarItem
            label="Staff"
            icon="👤"
            active={activeTab === 'staff'}
            onClick={() => setActiveTab('staff')}
          />
          <SidebarItem
            label="Skills"
            icon="🎓"
            active={activeTab === 'skills'}
            onClick={() => setActiveTab('skills')}
          />
          <SidebarItem
            label="Export"
            icon="⬇"
            active={activeTab === 'export'}
            onClick={() => setActiveTab('export')}
          />
          <SidebarItem
            label="Users"
            icon="🔐"
            active={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
          />
        </nav>

        <div className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
          <div className="font-medium text-slate-800">
            {profile.name}
          </div>
          <div>{profile.email}</div>
          <div className="mt-1 text-slate-400">Role: Admin</div>
        </div>
      </aside>

      {/* Main content */}
      <section className="flex-1">
        {/* Mobile header + tabs */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">
                  HMC
                </p>
                <h1 className="text-sm font-semibold text-slate-900">
                  OT Case Logger • Admin
                </h1>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-800">
                  {profile.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {profile.email}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto text-[11px]">
              <MobileTabPill
                label="Dashboard"
                active={activeTab === 'dashboard'}
                onClick={() => setActiveTab('dashboard')}
              />
              <MobileTabPill
                label="Hospitals"
                active={activeTab === 'hospitals'}
                onClick={() => setActiveTab('hospitals')}
              />
              <MobileTabPill
                label="Staff"
                active={activeTab === 'staff'}
                onClick={() => setActiveTab('staff')}
              />
              <MobileTabPill
                label="Skills"
                active={activeTab === 'skills'}
                onClick={() => setActiveTab('skills')}
              />
              <MobileTabPill
                label="Export"
                active={activeTab === 'export'}
                onClick={() => setActiveTab('export')}
              />
              <MobileTabPill
                label="Users"
                active={activeTab === 'users'}
                onClick={() => setActiveTab('users')}
              />
            </div>
          </div>
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur md:block">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800">
                Admin console
              </p>
              <h1 className="text-sm font-semibold text-slate-900">
                OT Case Logger • Analytics & Reporting
              </h1>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div className="font-medium text-slate-800">
                {profile.name}
              </div>
              <div>{profile.email}</div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="px-4 py-4 md:px-6">
          {/* Filters visible on all analytics tabs */}
          {activeTab !== 'users' && renderFiltersBar()}

          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'hospitals' && renderHospitals()}
          {activeTab === 'staff' && renderStaff()}
          {activeTab === 'skills' && renderSkills()}
          {activeTab === 'export' && renderExport()}
          {activeTab === 'users' && renderUsers()}
        </div>
      </section>
    </main>
  );
}

// ========= SMALL COMPONENTS =========

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

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || 'pending').toLowerCase();
  let color = 'bg-amber-100 text-amber-700 border-amber-200';
  if (s === 'approved')
    color = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (s === 'rejected') color = 'bg-rose-100 text-rose-700 border-rose-200';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {status || 'pending'}
    </span>
  );
}

function SidebarItem({
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
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
        active
          ? 'bg-sky-50 text-sky-800'
          : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MobileTabPill({
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
      className={`rounded-full border px-3 py-1 ${
        active
          ? 'border-sky-500 bg-sky-50 text-sky-700'
          : 'border-slate-200 bg-white text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}
