'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Charts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

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

type Skill = {
  id: string;
  name: string | null;
};

type CaseRow = {
  id: string;
  case_id: string | null;
  date: string | null;
  hospital_id: string | null;
  procedure_id: string | null;
  anesthesia_type: string | null;
  profile_type: string | null;
  asa_class: string | null;
  patient_code: string | null;
  ot_room: string | null;
  status: string | null;

  hospitalName?: string;
  specialtyName?: string;
  skillNames?: string[];
};

type CaseInputRow = {
  date: string;
  patientCode: string;
  profileType: string; // Adult | Pediatric | Special needs
  asaClass: string; // ASA 1..6
  hospitalId: string;
  specialtyId: string;
  otRoom: string;

  anesthesiaType: string;
  selectedSkillIds: string[];
};

// ------------ Fixed lists ------------

const anesthesiaOptions = [
  'General',
  'Spinal/Epidural',
  'Regional / Neuraxial Block',
  'Sedation',
];

const profileOptions = ['Adult', 'Pediatric', 'Special needs'];
const asaOptions = ['ASA 1', 'ASA 2', 'ASA 3', 'ASA 4', 'ASA 5', 'ASA 6'];

const FIXED_SKILL_NAMES = [
  'difficult cannulation',
  'intra/op Phlebotomy',
  'RSI',
  'Ultrasound machine',
  'Rapid infusion',
  'infusion pump',
  'blood transfusion',
  'Arterial line',
  'Central line',
  'CPR',
  'bronchospasm',
];

// ------------ Helpers ------------

function formatShortDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return dateStr;
}

function norm(s: string) {
  return (s || '').trim().toLowerCase();
}

function shortenLabel(s: string, max = 28) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ------------ Justinmind / Figma-like chart style ------------

const jmTick = { fontSize: 11, fill: '#000' };

const jmTooltipProps = {
  contentStyle: {
    borderRadius: '12px',
    border: '1px solid rgba(0,0,0,0.10)',
    boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
    color: '#000',
    background: '#fff',
  },
  labelStyle: { color: '#000', fontSize: 11, fontWeight: 700 },
  itemStyle: { color: '#000', fontSize: 11 },
};

function jmGrid() {
  return <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} />;
}

export default function StaffPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'new' | 'cases' | 'stats'>('new');

  // Stats sub-tabs
  const [statsTab, setStatsTab] = useState<'activity' | 'specialties' | 'skills'>('activity');

  // Cases filter
  const [casesFrom, setCasesFrom] = useState('');
  const [casesTo, setCasesTo] = useState('');

  // Stats filter
  const [statsFrom, setStatsFrom] = useState('');
  const [statsTo, setStatsTo] = useState('');

  const [skillsWarning, setSkillsWarning] = useState<string | null>(null);

  const [rows, setRows] = useState<CaseInputRow[]>([
    {
      date: '',
      patientCode: '',
      profileType: '',
      asaClass: '',
      hospitalId: '',
      specialtyId: '',
      otRoom: '',
      anesthesiaType: '',
      selectedSkillIds: [],
    },
  ]);

  // ------------------- LOAD DATA -------------------

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/login');
          return;
        }

        const email = user.email!;

        const { data: profileData } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', email)
          .single();

        setProfile((profileData as Profile) || null);

        const { data: hospData } = await supabase
          .from('hospitals')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        setHospitals((hospData || []) as Hospital[]);

        const { data: procData } = await supabase
          .from('procedures')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        setProcedures((procData || []) as Procedure[]);

        const { data: skillData } = await supabase
          .from('skills')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        const list = (skillData || []) as Skill[];
        setSkills(list);

        const dbNames = new Set(list.map((s) => norm(s.name || '')));
        const missing = FIXED_SKILL_NAMES.filter((n) => !dbNames.has(norm(n)));
        if (missing.length > 0) {
          setSkillsWarning(
            `Missing skills in Supabase table: ${missing.join(', ')}. Add them (same names) so staff can select them.`
          );
        } else {
          setSkillsWarning(null);
        }

        await loadCasesForStaff(email, '', '');
      } finally {
        setLoading(false);
      }
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadCasesForStaff(staffEmail: string, from: string, to: string) {
    let q = supabase
      .from('cases')
      .select('*')
      .eq('staff_id', staffEmail)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);

    const { data: casesData, error: casesError } = await q;

    if (casesError) {
      console.error('Cases error:', casesError);
      setCases([]);
      return;
    }

    const mapped: CaseRow[] = (casesData || []).map((c: any) => ({
      id: c.id as string,
      case_id: c.case_id ?? null,
      date: c.date ?? null,
      hospital_id: c.hospital_id ?? null,
      procedure_id: c.procedure_id ?? null,
      anesthesia_type: c.anesthesia_type ?? null,
      profile_type: c.profile_type ?? null,
      asa_class: c.asa_class ?? null,
      patient_code: c.patient_code ?? null,
      ot_room: c.ot_room ?? null,
      status: c.status ?? null,
    }));

    const hospitalMap = new Map(hospitals.map((h) => [h.id, h.name || 'Unknown hospital']));
    const procMap = new Map(procedures.map((p) => [p.id, p.name || 'Unknown specialty']));

    mapped.forEach((c) => {
      c.hospitalName = c.hospital_id ? hospitalMap.get(c.hospital_id) || 'Unknown hospital' : '—';
      c.specialtyName = c.procedure_id ? procMap.get(c.procedure_id) || 'Unknown specialty' : '—';
    });

    const ids = mapped.map((m) => m.id);
    if (ids.length > 0) {
      const { data: csData, error: csError } = await supabase
        .from('case_skills')
        .select('case_id, skill_id, skills(name)')
        .in('case_id', ids);

      if (csError) {
        console.error('Case skills load error:', csError);
      } else {
        const skillByCase = new Map<string, string[]>();
        (csData || []).forEach((row: any) => {
          const caseId = row.case_id as string;
          const skillName = row.skills?.name as string | undefined;
          if (!skillName) return;
          const arr = skillByCase.get(caseId) || [];
          arr.push(skillName);
          skillByCase.set(caseId, arr);
        });

        mapped.forEach((c) => {
          c.skillNames = skillByCase.get(c.id) || [];
        });
      }
    }

    setCases(mapped);
  }

  // ------------------- Monthly summary -------------------

  const staffName = profile?.name || 'Staff';
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthCases = (cases || []).filter((c) => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const monthTotalCases = thisMonthCases.length;
  const monthSpecialtiesCount = new Set(thisMonthCases.map((c) => c.procedure_id).filter(Boolean)).size;

  const monthSkillsCount = useMemo(() => {
    const set = new Set<string>();
    thisMonthCases.forEach((c) => (c.skillNames || []).forEach((n) => set.add(n)));
    return set.size;
  }, [thisMonthCases]);

  const todayPendingApprovals = thisMonthCases.filter((c) => {
    const status = (c.status || '').toLowerCase();
    return status === 'pending' && (c.date || '').startsWith(todayStr);
  }).length;

  // ------------------- Row handlers -------------------

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        date: '',
        patientCode: '',
        profileType: '',
        asaClass: '',
        hospitalId: '',
        specialtyId: '',
        otRoom: '',
        anesthesiaType: '',
        selectedSkillIds: [],
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRowField = (index: number, field: keyof CaseInputRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const toggleSkillForRow = (index: number, skillId: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const selected = row.selectedSkillIds.includes(skillId)
          ? row.selectedSkillIds.filter((id) => id !== skillId)
          : [...row.selectedSkillIds, skillId];
        return { ...row, selectedSkillIds: selected };
      })
    );
  };

  // Only show fixed skills (in that order)
  const fixedSkills = useMemo(() => {
    const byName = new Map<string, Skill>();
    skills.forEach((s) => byName.set(norm(s.name || ''), s));

    return FIXED_SKILL_NAMES.map((skillName) => {
      const s = byName.get(norm(skillName));
      return s ? { id: s.id, name: s.name || skillName } : null;
    }).filter(Boolean) as Skill[];
  }, [skills]);

  // ------------------- Save batch -------------------

  const handleSaveBatch = async () => {
    if (!profile?.email) return;
    if (rows.length === 0) return;

    const cleanedRows = rows.filter(
      (r) => r.date && r.hospitalId && r.specialtyId && r.anesthesiaType && r.profileType && r.asaClass
    );

    if (cleanedRows.length === 0) {
      alert('Fill at least one case: date, hospital, specialty, anesthesia type, profile, ASA.');
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();

      const casesToInsert = cleanedRows.map((row) => ({
        case_id: null,
        date: row.date,
        patient_code: row.patientCode || null,
        profile_type: row.profileType || null,
        asa_class: row.asaClass || null,
        anesthesia_type: row.anesthesiaType || null,
        hospital_id: row.hospitalId || null,
        procedure_id: row.specialtyId || null,
        ot_room: row.otRoom || null,
        staff_id: profile.email,
        status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      }));

      const { data: insertedCases, error: insertError } = await supabase
        .from('cases')
        .insert(casesToInsert)
        .select('id');

      if (insertError) {
        console.error('Insert cases error:', insertError);
        alert('Error saving cases.');
        return;
      }

      const newCaseIds = (insertedCases || []).map((c: any) => c.id as string);

      const caseSkillsPayload: { case_id: string; skill_id: string }[] = [];
      cleanedRows.forEach((row, idx) => {
        const caseId = newCaseIds[idx];
        if (!caseId) return;
        row.selectedSkillIds.forEach((skillId) => {
          caseSkillsPayload.push({ case_id: caseId, skill_id: skillId });
        });
      });

      if (caseSkillsPayload.length > 0) {
        const { error: csError } = await supabase.from('case_skills').insert(caseSkillsPayload);
        if (csError) console.error('Case skills insert error:', csError);
      }

      await loadCasesForStaff(profile.email, casesFrom, casesTo);

      setRows([
        {
          date: '',
          patientCode: '',
          profileType: '',
          asaClass: '',
          hospitalId: '',
          specialtyId: '',
          otRoom: '',
          anesthesiaType: '',
          selectedSkillIds: [],
        },
      ]);

      alert('Cases saved.');
    } catch (err) {
      console.error('Unexpected save error:', err);
      alert('Unexpected error while saving.');
    } finally {
      setSaving(false);
    }
  };

  // Reload cases when My Cases filter changes
  useEffect(() => {
    if (!profile?.email) return;
    if (activeTab !== 'cases') return;
    loadCasesForStaff(profile.email, casesFrom, casesTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casesFrom, casesTo, activeTab, profile?.email]);

  // ------------------- Stats (filtered by date) -------------------

  const statsFilteredCases = useMemo(() => {
    const from = statsFrom ? new Date(statsFrom) : null;
    const to = statsTo ? new Date(statsTo) : null;

    return (cases || []).filter((c) => {
      if (!c.date) return false;
      const d = new Date(c.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [cases, statsFrom, statsTo]);

  const activitySeries = useMemo(() => {
    const map = new Map<string, number>();
    statsFilteredCases.forEach((c) => {
      const key = c.date || '—';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([date, count]) => ({ date, cases: count }));
  }, [statsFilteredCases]);

  const specialtySeries = useMemo(() => {
    const map = new Map<string, number>();
    statsFilteredCases.forEach((c) => {
      const name = c.specialtyName || 'Unknown specialty';
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([name, count]) => ({ name, cases: count }));
  }, [statsFilteredCases]);

  const skillExposureOverTime = useMemo(() => {
    const map = new Map<string, number>();
    statsFilteredCases.forEach((c) => {
      const day = c.date || '—';
      const n = (c.skillNames || []).length;
      map.set(day, (map.get(day) || 0) + n);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([date, exposures]) => ({ date, exposures }));
  }, [statsFilteredCases]);

  const topSkillsSeries = useMemo(() => {
    const map = new Map<string, number>();
    statsFilteredCases.forEach((c) => {
      (c.skillNames || []).forEach((n) => map.set(n, (map.get(n) || 0) + 1));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name, count]) => ({ name, uses: count }));
  }, [statsFilteredCases]);

  // ------------------- RENDER -------------------

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-black">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-hmc-primarySoft via-white to-hmc-primarySoft pb-16">
      <div className="mx-auto max-w-5xl px-4 py-4 space-y-6">
        {/* HEADER */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-black">Staff dashboard</p>
            <h1 className="text-xl font-semibold text-black">Good evening, {staffName}.</h1>
            <p className="text-[11px] text-black">Log anaesthesia cases and follow your monthly activity.</p>
          </div>

          {/* Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3 text-left hover:shadow-lg transition"
              onClick={() => setActiveTab('new')}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-hmc-primarySoft text-hmc-primary flex items-center justify-center rounded-2xl text-lg">
                  📝
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-black">Daily Case Entry</p>
                  <p className="text-[11px] text-black">Add today&apos;s cases</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3 text-left hover:shadow-lg transition"
              onClick={() => {
                setActiveTab('stats');
                setStatsTab('activity');
              }}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-hmc-primarySoft text-hmc-primary flex items-center justify-center rounded-2xl text-lg">
                  📈
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-black">My Activity</p>
                  <p className="text-[11px] text-black">Charts over time</p>
                </div>
              </div>
            </button>

            <button
              type="button"
              className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3 text-left hover:shadow-lg transition"
              onClick={() => setActiveTab('cases')}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-hmc-primarySoft text-hmc-primary flex items-center justify-center rounded-2xl text-lg">
                  ⏳
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-black">Pending Approval</p>
                  <p className="text-[11px] text-black">{todayPendingApprovals} pending today</p>
                  <div className="text-[10px] mt-1 inline-block bg-slate-100 rounded-full px-2 py-0.5 text-black">
                    {todayPendingApprovals > 0
                      ? `${todayPendingApprovals} case${todayPendingApprovals > 1 ? 's' : ''}`
                      : 'All clear'}
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Summary */}
          <div>
            <h2 className="text-xs font-semibold text-black mb-2">My Summary (This Month)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-black">Total cases</p>
                <p className="text-xl font-semibold text-black">{monthTotalCases}</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-black">Specialties covered</p>
                <p className="text-xl font-semibold text-black">{monthSpecialtiesCount}</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-black">Skills performed</p>
                <p className="text-xl font-semibold text-black">{monthSkillsCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN TABS */}
        <div className="space-y-4">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setActiveTab('new')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'new'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-black border-slate-200'
              }`}
            >
              New cases
            </button>
            <button
              onClick={() => setActiveTab('cases')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'cases'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-black border-slate-200'
              }`}
            >
              My cases
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'stats'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-black border-slate-200'
              }`}
            >
              Stats
            </button>
          </div>

          {/* NEW CASES */}
          {activeTab === 'new' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-black">Batch case entry</h2>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-xs rounded-full bg-hmc-primary text-white px-3 py-1"
                >
                  + Add case
                </button>
              </div>

              {skillsWarning && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-black">
                  {skillsWarning}
                </div>
              )}

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 p-3 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-black">Case {index + 1}</span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="text-[11px] text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-[11px] text-black">Date</label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.date}
                          onChange={(e) => updateRowField(index, 'date', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-[11px] text-black">Patient code</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.patientCode}
                          onChange={(e) => updateRowField(index, 'patientCode', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-[11px] text-black">OT room</label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.otRoom}
                          onChange={(e) => updateRowField(index, 'otRoom', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-[11px] text-black">Hospital</label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.hospitalId}
                          onChange={(e) => updateRowField(index, 'hospitalId', e.target.value)}
                        >
                          <option value="">Select hospital</option>
                          {hospitals.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block mb-1 text-[11px] text-black">Specialty</label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.specialtyId}
                          onChange={(e) => updateRowField(index, 'specialtyId', e.target.value)}
                        >
                          <option value="">Select specialty</option>
                          {procedures.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block mb-1 text-[11px] text-black">Anesthesia Type</label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.anesthesiaType}
                          onChange={(e) => updateRowField(index, 'anesthesiaType', e.target.value)}
                        >
                          <option value="">Select type</option>
                          {anesthesiaOptions.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-[11px] text-black">Profile</label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.profileType}
                          onChange={(e) => updateRowField(index, 'profileType', e.target.value)}
                        >
                          <option value="">Select profile</option>
                          {profileOptions.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block mb-1 text-[11px] text-black">ASA classification</label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                          value={row.asaClass}
                          onChange={(e) => updateRowField(index, 'asaClass', e.target.value)}
                        >
                          <option value="">Select ASA</option>
                          {asaOptions.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="text-[11px] text-black">
                      <p className="mb-1 font-semibold text-black">Skills performed</p>
                      <div className="flex flex-wrap gap-2">
                        {fixedSkills.map((sk) => {
                          const checked = row.selectedSkillIds.includes(sk.id);
                          return (
                            <button
                              key={sk.id}
                              type="button"
                              onClick={() => toggleSkillForRow(index, sk.id as string)}
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                checked
                                  ? 'bg-hmc-primary text-white border-hmc-primary'
                                  : 'bg-white text-black border-slate-300'
                              }`}
                            >
                              {sk.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  disabled={saving}
                  className="rounded-full bg-hmc-primary text-white text-xs px-4 py-2 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save all cases'}
                </button>
              </div>
            </section>
          )}

          {/* MY CASES */}
          {activeTab === 'cases' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-black">My cases</h2>
                  <p className="text-[11px] text-black">Filter by date and review all details you entered.</p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <div>
                    <label className="block mb-1 text-[11px] text-black">From</label>
                    <input
                      type="date"
                      className="rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                      value={casesFrom}
                      onChange={(e) => setCasesFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-[11px] text-black">To</label>
                    <input
                      type="date"
                      className="rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                      value={casesTo}
                      onChange={(e) => setCasesTo(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="self-end rounded-full border border-slate-300 px-3 py-1 text-[11px] text-black bg-slate-50 h-8"
                    onClick={() => {
                      setCasesFrom('');
                      setCasesTo('');
                      if (profile?.email) loadCasesForStaff(profile.email, '', '');
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {cases.length === 0 ? (
                <p className="text-xs text-black">No cases found for this filter.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {cases.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-black">{c.specialtyName || '—'}</p>
                          <p className="text-[11px] text-black">
                            {formatShortDate(c.date)} • {c.hospitalName || '—'}
                          </p>
                        </div>

                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] w-fit ${
                            (c.status || '').toLowerCase() === 'approved'
                              ? 'bg-emerald-50 text-black border border-emerald-200'
                              : 'bg-amber-50 text-black border border-amber-200'
                          }`}
                        >
                          {c.status || 'pending'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-black">
                        <div>
                          <span className="font-semibold text-black">Patient code: </span>
                          {c.patient_code || '—'}
                        </div>
                        <div>
                          <span className="font-semibold text-black">OT room: </span>
                          {c.ot_room || '—'}
                        </div>
                        <div>
                          <span className="font-semibold text-black">Anesthesia: </span>
                          {c.anesthesia_type || '—'}
                        </div>
                        <div>
                          <span className="font-semibold text-black">Profile: </span>
                          {c.profile_type || '—'}
                        </div>
                        <div>
                          <span className="font-semibold text-black">ASA: </span>
                          {c.asa_class || '—'}
                        </div>
                      </div>

                      <div className="text-[11px] text-black">
                        <span className="font-semibold text-black">Skills: </span>
                        {c.skillNames && c.skillNames.length > 0 ? (
                          <span>{c.skillNames.join(', ')}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* STATS */}
          {activeTab === 'stats' && (
            <section className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-black">My stats</h2>
                    <p className="text-[11px] text-black">Activity, specialties, and skill exposure over time.</p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <div>
                      <label className="block mb-1 text-[11px] text-black">From</label>
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                        value={statsFrom}
                        onChange={(e) => setStatsFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-[11px] text-black">To</label>
                      <input
                        type="date"
                        className="rounded-xl border border-slate-300 px-2 py-1 text-xs text-black bg-white"
                        value={statsTo}
                        onChange={(e) => setStatsTo(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="self-end rounded-full border border-slate-300 px-3 py-1 text-[11px] text-black bg-slate-50 h-8"
                      onClick={() => {
                        setStatsFrom('');
                        setStatsTo('');
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Stats sub-tabs */}
                <div className="mt-4 flex gap-2 text-xs">
                  <button
                    onClick={() => setStatsTab('activity')}
                    className={`rounded-full px-3 py-1 border ${
                      statsTab === 'activity'
                        ? 'bg-hmc-primary text-white border-hmc-primary'
                        : 'bg-white text-black border-slate-200'
                    }`}
                  >
                    Activity
                  </button>
                  <button
                    onClick={() => setStatsTab('specialties')}
                    className={`rounded-full px-3 py-1 border ${
                      statsTab === 'specialties'
                        ? 'bg-hmc-primary text-white border-hmc-primary'
                        : 'bg-white text-black border-slate-200'
                    }`}
                  >
                    Specialties
                  </button>
                  <button
                    onClick={() => setStatsTab('skills')}
                    className={`rounded-full px-3 py-1 border ${
                      statsTab === 'skills'
                        ? 'bg-hmc-primary text-white border-hmc-primary'
                        : 'bg-white text-black border-slate-200'
                    }`}
                  >
                    Skills
                  </button>
                </div>
              </div>

              {/* ACTIVITY TAB (Justinmind style) */}
              {statsTab === 'activity' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4">
                  <h3 className="text-sm font-semibold text-black">Your activity over time</h3>
                  <p className="text-[11px] text-black mb-3">Cases logged per day.</p>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activitySeries} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                        {jmGrid()}
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={jmTick} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={jmTick} />
                        <Tooltip {...jmTooltipProps} />
                        <Line type="monotone" dataKey="cases" stroke="#2563eb" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* SPECIALTIES TAB (Horizontal, Justinmind style) */}
              {statsTab === 'specialties' && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4">
                  <h3 className="text-sm font-semibold text-black">Specialties (selected period)</h3>
                  <p className="text-[11px] text-black mb-3">Total cases by specialty.</p>

                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={specialtySeries}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
                        barCategoryGap={10}
                      >
                        {jmGrid()}

                        <XAxis
                          type="number"
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={jmTick}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={230}
                          axisLine={false}
                          tickLine={false}
                          tick={jmTick}
                          tickFormatter={(v) => shortenLabel(String(v), 28)}
                        />

                        <Tooltip
                          {...jmTooltipProps}
                          formatter={(value: any, _name: any, props: any) => [
                            value,
                            props?.payload?.name || 'Specialty',
                          ]}
                        />

                        <Bar
                          dataKey="cases"
                          fill="#16a34a"
                          barSize={18}
                          radius={[0, 10, 10, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="text-[11px] text-black mt-2">
                    Tip: hover/tap a bar to see the full specialty name.
                  </p>
                </div>
              )}

              {/* SKILLS TAB */}
              {statsTab === 'skills' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4">
                    <h3 className="text-sm font-semibold text-black">Skill exposure over time</h3>
                    <p className="text-[11px] text-black mb-3">Total skill tags per day.</p>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={skillExposureOverTime} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                          {jmGrid()}
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={jmTick} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={jmTick} />
                          <Tooltip {...jmTooltipProps} />
                          <Line type="monotone" dataKey="exposures" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Top Skills (Horizontal, Justinmind style) */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4">
                    <h3 className="text-sm font-semibold text-black">Top skills used</h3>
                    <p className="text-[11px] text-black mb-3">Most frequently logged skills.</p>

                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topSkillsSeries}
                          layout="vertical"
                          margin={{ top: 8, right: 24, left: 16, bottom: 8 }}
                          barCategoryGap={10}
                        >
                          {jmGrid()}

                          <XAxis
                            type="number"
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={jmTick}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={230}
                            axisLine={false}
                            tickLine={false}
                            tick={jmTick}
                            tickFormatter={(v) => shortenLabel(String(v), 28)}
                          />

                          <Tooltip
                            {...jmTooltipProps}
                            formatter={(value: any, _name: any, props: any) => [
                              value,
                              props?.payload?.name || 'Skill',
                            ]}
                          />

                          <Bar
                            dataKey="uses"
                            fill="#7c3aed"
                            barSize={18}
                            radius={[0, 10, 10, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <p className="text-[11px] text-black mt-2">
                      Tip: hover/tap a bar to see the full skill name.
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
