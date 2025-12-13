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
};

type Hospital = {
  id: string;
  code: string;
  name: string;
};

type Procedure = {
  id: string;
  code: string;
  name: string; // used as Specialty in UI
};

type Skill = {
  id: string;
  code: string;
  name: string;
};

type CaseRow = {
  id: string;
  case_id: string;
  date: string | null;
  patient_code: string | null;
  profile_type: string | null;
  asa_class: string | null;
  ot_room: string | null;
  status: string | null;
  supervisor_comment: string | null;
  hospital_id: string | null;
  procedure_id: string | null;
};

type DraftCaseRow = {
  tempId: string;
  date: string;
  patientCode: string;
  profileType: string;
  asaClass: string;
  hospitalId: string;
  procedureId: string;
  otRoom: string;
  selectedSkillIds: string[];
};

function makeTempId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const MAX_BATCH_ROWS = 10;

export default function StaffPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new' | 'cases'>(
    'dashboard'
  );
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  const [draftRows, setDraftRows] = useState<DraftCaseRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // ====== LOAD USER + DATA ======
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
        };

        if (profileData.role.toLowerCase() !== 'staff') {
          if (profileData.role.toLowerCase() === 'supervisor') {
            router.push('/supervisor');
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

        // Procedures (Specialties)
        const { data: procData, error: procError } = await supabase
          .from('procedures')
          .select('id, code, name');

        if (procError) {
          console.error('Procedures error:', procError);
        } else {
          setProcedures(procData || []);
        }

        // Skills
        const { data: skillsData, error: skillError } = await supabase
          .from('skills')
          .select('id, code, name');

        if (skillError) {
          console.error('Skills error:', skillError);
        } else {
          setSkills(skillsData || []);
        }

        // Cases (simple select, no joins)
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
            procedure_id
          `
          )
          .eq('staff_id', prof.id)
          .order('date', { ascending: false });

        if (casesError) {
          console.error('Cases error:', casesError);
        } else {
          setCases((casesData || []) as CaseRow[]);
        }

        // One empty row to start
        setDraftRows([
          {
            tempId: makeTempId(),
            date: '',
            patientCode: '',
            profileType: '',
            asaClass: '',
            hospitalId: '',
            procedureId: '',
            otRoom: '',
            selectedSkillIds: [],
          },
        ]);
      } catch (err) {
        console.error('Unexpected load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [router]);

  // ====== HELPERS ======
  const totalCases = cases.length;
  const pendingCases = cases.filter((c) => c.status === 'pending').length;
  const approvedCases = cases.filter((c) => c.status === 'approved').length;
  const rejectedCases = cases.filter((c) => c.status === 'rejected').length;

  const formatDate = (value: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  };

  const generateCaseId = () => {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 900) + 100; // 100–999
    return `C${yyyy}${mm}${dd}-${rand}`;
  };

  const updateDraftField = (
    tempId: string,
    field: keyof DraftCaseRow,
    value: string | string[]
  ) => {
    setDraftRows((prev) =>
      prev.map((row) =>
        row.tempId === tempId
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  const toggleDraftSkill = (tempId: string, skillId: string) => {
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.tempId !== tempId) return row;
        const selected = row.selectedSkillIds.includes(skillId);
        return {
          ...row,
          selectedSkillIds: selected
            ? row.selectedSkillIds.filter((id) => id !== skillId)
            : [...row.selectedSkillIds, skillId],
        };
      })
    );
  };

  const resetDraftRows = () => {
    setDraftRows([
      {
        tempId: makeTempId(),
        date: '',
        patientCode: '',
        profileType: '',
        asaClass: '',
        hospitalId: '',
        procedureId: '',
        otRoom: '',
        selectedSkillIds: [],
      },
    ]);
    setSaveMessage(null);
  };

  const addDraftRow = () => {
    setDraftRows((prev) => {
      if (prev.length >= MAX_BATCH_ROWS) return prev;
      return [
        ...prev,
        {
          tempId: makeTempId(),
          date: '',
          patientCode: '',
          profileType: '',
          asaClass: '',
          hospitalId: '',
          procedureId: '',
          otRoom: '',
          selectedSkillIds: [],
        },
      ];
    });
  };

  const removeDraftRow = (tempId: string) => {
    setDraftRows((prev) => {
      if (prev.length === 1) {
        // If only one row, just clear it
        return [
          {
            tempId: makeTempId(),
            date: '',
            patientCode: '',
            profileType: '',
            asaClass: '',
            hospitalId: '',
            procedureId: '',
            otRoom: '',
            selectedSkillIds: [],
          },
        ];
      }
      return prev.filter((row) => row.tempId !== tempId);
    });
  };

  const getHospitalLabel = (id: string | null) => {
    if (!id) return '-';
    const h = hospitals.find((x) => x.id === id);
    if (!h) return '-';
    return h.code || h.name;
  };

  const getProcedureLabel = (id: string | null) => {
    if (!id) return '-';
    const p = procedures.find((x) => x.id === id);
    if (!p) return '-';
    return p.name;
  };

  // ====== SAVE BATCH (with skills) ======
  const handleSaveBatch = async () => {
    if (!profile) return;
    setSaveMessage(null);

    const validRows = draftRows.filter(
      (r) =>
        r.date &&
        r.patientCode &&
        r.profileType &&
        r.asaClass &&
        r.hospitalId &&
        r.procedureId
    );

    if (validRows.length === 0) {
      setSaveMessage(
        'No complete rows to save. Please fill required fields (*) for at least one case.'
      );
      return;
    }

    setSaving(true);
    try {
      const inserts = validRows.map((r) => ({
        case_id: generateCaseId(),
        date: r.date,
        patient_code: r.patientCode,
        profile_type: r.profileType,
        asa_class: r.asaClass,
        ot_room: r.otRoom || null,
        hospital_id: r.hospitalId,
        procedure_id: r.procedureId,
        department: 'Anaesthesia',
        staff_id: profile.id,
        status: 'pending',
      }));

      const { data: insertedCases, error: insertError } = await supabase
        .from('cases')
        .insert(inserts)
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
          procedure_id
        `
        );

      if (insertError || !insertedCases) {
        console.error('Insert cases error:', insertError);
        setSaveMessage('Error saving cases: ' + (insertError?.message || ''));
        setSaving(false);
        return;
      }

      // Insert skills mapping
      const caseSkillsPayload: { case_id: string; skill_id: string }[] = [];

      (insertedCases as any[]).forEach((inserted, index) => {
        const row = validRows[index];
        if (!row) return;
        row.selectedSkillIds.forEach((skillId) => {
          caseSkillsPayload.push({
            case_id: inserted.id,
            skill_id: skillId,
          });
        });
      });

      if (caseSkillsPayload.length > 0) {
        const { error: csError } = await supabase
          .from('case_skills')
          .insert(caseSkillsPayload);
        if (csError) {
          console.error('Case skills insert error:', csError);
          // not fatal, cases already saved
        }
      }

      // Merge newly inserted with existing cases (no skills needed in list for now)
      setCases((prev) => [
        ...(insertedCases as CaseRow[]),
        ...prev,
      ]);

      setSaveMessage(
        `${validRows.length} case(s) saved. You can continue entering more cases.`
      );
      resetDraftRows();
      setActiveTab('new');
    } catch (err: any) {
      console.error('Unexpected save error:', err);
      setSaveMessage('Unexpected error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ====== RENDER UTILITIES ======
  const renderStatusBadge = (status: string | null) => {
    const s = (status || '').toLowerCase();
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

  const renderCaseCard = (c: CaseRow) => {
    const isExpanded = expandedCaseId === c.id;
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
            <div className="mt-1 text-sm font-medium text-slate-900">
              {getProcedureLabel(c.procedure_id)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {formatDate(c.date)} • {getHospitalLabel(c.hospital_id)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {renderStatusBadge(c.status)}
            <button
              className="text-[11px] text-sky-600 hover:text-sky-800"
              type="button"
            >
              {isExpanded ? 'Hide details' : 'View details'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
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
              <span className="font-medium">OT Room:</span>
              <span>{c.ot_room || '-'}</span>
            </div>
            <div>
              <span className="font-medium">Specialty: </span>
              <span>{getProcedureLabel(c.procedure_id)}</span>
            </div>
            {c.supervisor_comment && (
              <div className="mt-1">
                <span className="font-medium text-slate-700">
                  Supervisor comment:{' '}
                </span>
                <span className="italic text-slate-600">
                  {c.supervisor_comment}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ====== RENDER SECTIONS ======
  const renderDashboardTab = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total cases" value={totalCases} tone="default" />
        <StatCard label="Pending" value={pendingCases} tone="amber" />
        <StatCard label="Approved" value={approvedCases} tone="emerald" />
        <StatCard label="Rejected" value={rejectedCases} tone="rose" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">
          Recent cases overview
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Last {Math.min(cases.length, 5)} cases you logged.
        </p>
        <div className="mt-3 space-y-2">
          {cases.slice(0, 5).map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
            >
              <div className="text-xs">
                <div className="font-medium text-slate-800">
                  {getProcedureLabel(c.procedure_id)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {formatDate(c.date)} • {getHospitalLabel(c.hospital_id)} •{' '}
                  {c.patient_code || 'No patient'}
                </div>
              </div>
              {renderStatusBadge(c.status)}
            </div>
          ))}
          {cases.length === 0 && (
            <p className="text-xs text-slate-400">
              No cases yet. Start by logging your first batch.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderNewCaseTab = () => (
    <div className="space-y-3 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Batch entry (multiple cases)
          </h2>
          <p className="text-xs text-slate-500">
            Start with one case. Add more rows only if you need them.
          </p>
        </div>
        <button
          type="button"
          onClick={resetDraftRows}
          className="rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-600"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-3">
        {draftRows.map((row, index) => (
          <div
            key={row.tempId}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                Case #{index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeDraftRow(row.tempId)}
                className="text-[11px] text-rose-500 hover:text-rose-700"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                Date <span className="text-rose-500">*</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.date}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'date', e.target.value)
                  }
                />
              </label>
              <label className="block text-xs text-slate-600">
                Patient code <span className="text-rose-500">*</span>
                <input
                  type="text"
                  placeholder="e.g. P2025-001"
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.patientCode}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'patientCode', e.target.value)
                  }
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-1">
              <label className="block text-xs text-slate-600">
                Profile <span className="text-rose-500">*</span>
                <select
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.profileType}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'profileType', e.target.value)
                  }
                >
                  <option value="">Select profile</option>
                  <option value="Adult">Adult</option>
                  <option value="Paediatric">Paediatric</option>
                  <option value="Special needs">Special needs</option>
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                ASA classification <span className="text-rose-500">*</span>
                <select
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.asaClass}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'asaClass', e.target.value)
                  }
                >
                  <option value="">Select ASA</option>
                  <option value="ASA 1">ASA 1</option>
                  <option value="ASA 2">ASA 2</option>
                  <option value="ASA 3">ASA 3</option>
                  <option value="ASA 4">ASA 4</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-1">
              <label className="block text-xs text-slate-600">
                Hospital <span className="text-rose-500">*</span>
                <select
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.hospitalId}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'hospitalId', e.target.value)
                  }
                >
                  <option value="">Select hospital</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code} – {h.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-600">
                Specialty <span className="text-rose-500">*</span>
                <select
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.procedureId}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'procedureId', e.target.value)
                  }
                >
                  <option value="">Select specialty</option>
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-600">
                OT room
                <input
                  type="text"
                  className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                  value={row.otRoom}
                  onChange={(e) =>
                    updateDraftField(row.tempId, 'otRoom', e.target.value)
                  }
                />
              </label>
            </div>

            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600">
                Skills for this case
              </p>
              <p className="text-[11px] text-slate-500 mb-1">
                Optional but important for skill-gap analytics.
              </p>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
    const selected = row.selectedSkillIds.includes(s.id);
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => toggleDraftSkill(row.tempId, s.id)}
        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] ${
          selected
            ? 'border-sky-500 bg-sky-50 text-sky-800'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        {selected ? '✓ ' : ''} {s.name}
      </button>
    );
  })}
  {skills.length === 0 && (
    <p className="text-xs text-slate-400">
      No skills defined yet.
    </p>
  )}
                {skills.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No skills defined yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {saveMessage && (
        <p className="text-xs text-slate-600">{saveMessage}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={addDraftRow}
          disabled={draftRows.length >= MAX_BATCH_ROWS}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-40"
        >
          + Add case ({draftRows.length}/{MAX_BATCH_ROWS})
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveBatch}
          className="rounded-full bg-gradient-to-r from-sky-500 to-sky-700 px-5 py-1.5 text-xs font-medium text-white shadow-md disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save all complete cases'}
        </button>
      </div>
    </div>
  );

  const renderCasesTab = () => (
    <div className="space-y-3 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">My cases</h2>
        <span className="text-[11px] text-slate-500">
          Total: {cases.length}
        </span>
      </div>
      {cases.length === 0 && (
        <p className="text-xs text-slate-400">
          You have not logged any cases yet.
        </p>
      )}
      <div className="space-y-3">
        {cases.map((c) => renderCaseCard(c))}
      </div>
    </div>
  );

  // ====== MAIN RENDER ======
  if (loading || !profile) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading your dashboard…</p>
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
              OT Case Logger • Staff
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
      </header>

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        {activeTab === 'dashboard' && renderDashboardTab()}
        {activeTab === 'new' && renderNewCaseTab()}
        {activeTab === 'cases' && renderCasesTab()}
      </div>

      {/* Bottom navigation – mobile-first */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-4 py-2">
          <BottomNavButton
            label="Dashboard"
            icon="🏠"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <BottomNavButton
            label="New case"
            icon="➕"
            active={activeTab === 'new'}
            onClick={() => setActiveTab('new')}
          />
          <BottomNavButton
            label="My cases"
            icon="📄"
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
    <div
      className={`rounded-2xl border px-3 py-2 shadow-sm ${classes}`}
    >
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
