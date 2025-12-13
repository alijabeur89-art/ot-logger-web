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

type Skill = {
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
};

type CaseInputRow = {
  date: string;
  patientCode: string;
  profileType: string; // 'Adult' | 'Pediatric' | 'Special Needs'
  asaClass: string; // 'ASA 1' | 'ASA 2' | 'ASA 3' | 'ASA 4'| 'ASA 5' | 'ASA 6'
  hospitalId: string;
  specialtyId: string;
  otRoom: string;
  department: string;
  selectedSkillIds: string[];
};

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

  const [rows, setRows] = useState<CaseInputRow[]>([
    {
      date: '',
      patientCode: '',
      profileType: '',
      asaClass: '',
      hospitalId: '',
      specialtyId: '',
      otRoom: '',
      department: '',
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
          console.error('No user:', userError);
          router.push('/login');
          return;
        }

        const email = user.email!;
        // profile
        const { data: profileData, error: profileError } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', email)
          .single();

        if (profileError) {
          console.error('Profile error:', profileError);
        } else {
          setProfile(profileData as Profile);
        }

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

        // procedures (specialties)
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

        // skills
        const { data: skillData, error: skillError } = await supabase
          .from('skills')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true });

        if (skillError) {
          console.error('Skills error:', skillError);
        } else {
          setSkills((skillData || []) as Skill[]);
        }

        // cases for this staff
        const { data: casesData, error: casesError } = await supabase
          .from('cases')
          .select('*')
          .eq('staff_id', email)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (casesError) {
          console.error('Cases error:', casesError);
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
          }));
          setCases(mapped);
        }
      } catch (err) {
        console.error('Unexpected load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  // ------------------- DASHBOARD METRICS -------------------

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

  const monthSpecialtiesCount = new Set(
    thisMonthCases.map((c) => c.specialty).filter(Boolean)
  ).size;

  // For now 0; later can connect to case_skills
  const monthSkillsCount = 0;

  const todayPendingApprovals = thisMonthCases.filter((c) => {
    const status = (c.status || '').toLowerCase();
    return status === 'pending' && (c.date || '').startsWith(todayStr);
  }).length;

  // ------------------- ROW HANDLERS -------------------

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
        department: '',
        selectedSkillIds: [],
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRowField = (
    index: number,
    field: keyof CaseInputRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
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

  // ------------------- SAVE BATCH -------------------

  const handleSaveBatch = async () => {
    if (!profile?.email) return;
    if (rows.length === 0) return;

    const cleanedRows = rows.filter((r) => r.date && r.hospitalId && r.specialtyId);
    if (cleanedRows.length === 0) {
      alert('Please fill at least one case with date, hospital and specialty.');
      return;
    }

    setSaving(true);
    try {
      // Build case rows for Supabase
      const casesToInsert = cleanedRows.map((row) => ({
        case_id: null, // you can generate your own if needed
        date: row.date,
        patient_code: row.patientCode || null,
        profile_type: row.profileType || null,
        asa_class: row.asaClass || null,
        hospital_id: row.hospitalId || null,
        procedure_id: row.specialtyId || null,
        ot_room: row.otRoom || null,
        department: row.department || profile.department || null,
        staff_id: profile.email,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

      // Build case_skills payload
      const caseSkillsPayload: { case_id: string; skill_id: string }[] = [];
      cleanedRows.forEach((row, idx) => {
        const caseId = newCaseIds[idx];
        if (!caseId) return;
        row.selectedSkillIds.forEach((skillId) => {
          caseSkillsPayload.push({ case_id: caseId, skill_id: skillId });
        });
      });

      if (caseSkillsPayload.length > 0) {
        const { error: csError } = await supabase
          .from('case_skills')
          .insert(caseSkillsPayload);
        if (csError) {
          console.error('Case skills insert error:', csError);
        }
      }

      // Refresh cases
      const { data: refreshedCases, error: refreshError } = await supabase
        .from('cases')
        .select('*')
        .eq('staff_id', profile.email)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (refreshError) {
        console.error('Refresh cases error:', refreshError);
      } else {
        const mapped = (refreshedCases || []).map((c: any) => ({
          id: c.id as string,
          case_id: c.case_id ?? null,
          date: c.date ?? null,
          hospital_id: c.hospital_id ?? null,
          specialty: c.procedure_id ?? null,
          profile_type: c.profile_type ?? null,
          asa_class: c.asa_class ?? null,
          status: c.status ?? null,
        }));
        setCases(mapped);
      }

      // Reset rows
      setRows([
        {
          date: '',
          patientCode: '',
          profileType: '',
          asaClass: '',
          hospitalId: '',
          specialtyId: '',
          otRoom: '',
          department: '',
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

  // ------------------- RENDER -------------------

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-hmc-primarySoft via-white to-hmc-primarySoft pb-16">
      <div className="mx-auto max-w-5xl px-4 py-4 space-y-6">
        {/* DASHBOARD HEADER */}
        <div className="space-y-4">
          {/* Greeting */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              Staff dashboard
            </p>
            <h1 className="text-xl font-semibold text-hmc-ink">
              Good evening, {staffName}.
            </h1>
            <p className="text-[11px] text-slate-500">
              Log anaesthesia cases and follow your monthly activity.
            </p>
          </div>

          {/* Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Daily Entry */}
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
                  <p className="text-[13px] font-semibold text-hmc-ink">
                    Daily Case Entry
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Add today&apos;s cases
                  </p>
                </div>
              </div>
            </button>

            {/* Activity */}
            <button
              type="button"
              className="bg-white border border-slate-100 rounded-3xl shadow-soft p-3 text-left hover:shadow-lg transition"
              onClick={() => setActiveTab('stats')}
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 bg-hmc-primarySoft text-hmc-primary flex items-center justify-center rounded-2xl text-lg">
                  📈
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-hmc-ink">
                    My Activity
                  </p>
                  <p className="text-[11px] text-slate-500">
                    View monthly stats
                  </p>
                </div>
              </div>
            </button>

            {/* Pending */}
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
                  <p className="text-[13px] font-semibold text-hmc-ink">
                    Pending Approval
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {todayPendingApprovals} pending today
                  </p>
                  <div className="text-[10px] mt-1 inline-block bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">
                    {todayPendingApprovals > 0
                      ? `${todayPendingApprovals} case${
                          todayPendingApprovals > 1 ? 's' : ''
                        }`
                      : 'All clear'}
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Summary */}
          <div>
            <h2 className="text-xs font-semibold text-slate-700 mb-2">
              My Summary (This Month)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-slate-500">Total cases</p>
                <p className="text-xl font-semibold text-hmc-ink">
                  {monthTotalCases}
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-slate-500">
                  Specialties covered
                </p>
                <p className="text-xl font-semibold text-hmc-ink">
                  {monthSpecialtiesCount}
                </p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 p-3 shadow-soft">
                <p className="text-[11px] text-slate-500">Skills performed</p>
                <p className="text-xl font-semibold text-hmc-ink">
                  {monthSkillsCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* TABS CONTENT */}
        <div className="space-y-4">
          {/* Simple tab labels */}
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setActiveTab('new')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'new'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              New cases
            </button>
            <button
              onClick={() => setActiveTab('cases')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'cases'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              My cases
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`rounded-full px-3 py-1 border ${
                activeTab === 'stats'
                  ? 'bg-hmc-primary text-white border-hmc-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Stats (coming soon)
            </button>
          </div>

          {/* TAB PANELS */}
          {activeTab === 'new' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-hmc-ink">
                  Batch case entry
                </h2>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-xs rounded-full bg-hmc-primary text-white px-3 py-1"
                >
                  + Add case
                </button>
              </div>

              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 p-3 bg-slate-50/70 space-y-2"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-700">
                        Case {index + 1}
                      </span>
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
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Date
                        </label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.date}
                          onChange={(e) =>
                            updateRowField(index, 'date', e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Patient code
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.patientCode}
                          onChange={(e) =>
                            updateRowField(index, 'patientCode', e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-[11px] text-slate-600">
                          OT room
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.otRoom}
                          onChange={(e) =>
                            updateRowField(index, 'otRoom', e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Hospital
                        </label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.hospitalId}
                          onChange={(e) =>
                            updateRowField(index, 'hospitalId', e.target.value)
                          }
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
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Specialty
                        </label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.specialtyId}
                          onChange={(e) =>
                            updateRowField(
                              index,
                              'specialtyId',
                              e.target.value
                            )
                          }
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
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Department
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.department}
                          onChange={(e) =>
                            updateRowField(
                              index,
                              'department',
                              e.target.value
                            )
                          }
                          placeholder={profile?.department || 'Anaesthesia'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block mb-1 text-[11px] text-slate-600">
                          Profile
                        </label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.profileType}
                          onChange={(e) =>
                            updateRowField(
                              index,
                              'profileType',
                              e.target.value
                            )
                          }
                        >
                          <option value="">Select profile</option>
                          <option value="Adult">Adult</option>
                          <option value="Pediatric">Pediatric</option>
                          <option value="Special Needs">Special Needs</option>
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 text-[11px] text-slate-600">
                          ASA classification
                        </label>
                        <select
                          className="w-full rounded-xl border border-slate-300 px-2 py-1 text-xs"
                          value={row.asaClass}
                          onChange={(e) =>
                            updateRowField(index, 'asaClass', e.target.value)
                          }
                        >
                          <option value="">Select ASA</option>
                          <option value="ASA 1">ASA 1</option>
                          <option value="ASA 2">ASA 2</option>
                          <option value="ASA 3">ASA 3</option>
                          <option value="ASA 4">ASA 4</option>
                        </select>
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="text-[11px] text-slate-600">
                      <p className="mb-1 font-medium">Skills performed</p>
                      <div className="flex flex-wrap gap-2">
                        {skills.map((sk) => {
                          const checked = row.selectedSkillIds.includes(sk.id);
                          return (
                            <button
                              key={sk.id}
                              type="button"
                              onClick={() =>
                                toggleSkillForRow(index, sk.id as string)
                              }
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                checked
                                  ? 'bg-hmc-primary text-white border-hmc-primary'
                                  : 'bg-white text-slate-600 border-slate-300'
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

          {activeTab === 'cases' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-3">
              <h2 className="text-sm font-semibold text-hmc-ink">My cases</h2>
              {cases.length === 0 ? (
                <p className="text-xs text-slate-500">No cases yet.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {cases.map((c) => {
                    const hospitalName =
                      hospitals.find((h) => h.id === c.hospital_id)?.name ||
                      'Unknown hospital';
                    const specialtyName =
                      procedures.find((p) => p.id === c.specialty)?.name ||
                      'Unknown specialty';
                    return (
                      <div
                        key={c.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-800">
                            {specialtyName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {c.date || 'No date'} • {hospitalName}
                          </p>
                        </div>
                        <div className="text-right text-[11px]">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 ${
                              (c.status || '').toLowerCase() === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {c.status || 'pending'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === 'stats' && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-soft p-4 space-y-2 text-xs">
              <h2 className="text-sm font-semibold text-hmc-ink">
                Stats (coming soon)
              </h2>
              <p className="text-slate-600">
                Here we will add charts for your activity, specialties and skill
                exposure over time.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
