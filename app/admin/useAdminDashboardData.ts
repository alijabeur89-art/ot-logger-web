'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type TabKey = 'dashboard' | 'cases' | 'skills' | 'users';

type AdminHookArgs = {
  selectedHospitalId: string;
  selectedStaffKey: string;
  dateFrom: string;
  dateTo: string;
};

type ProfileRow = {
  email: string;
  name: string | null;
  role: string | null;
  hospital_home_id: string | null;
  department: string | null;
  active: boolean | null;
  id: string;
};

type HospitalRow = {
  id: string;
  code: string | null;
  name: string | null;
  city: string | null;
  active: boolean | null;
};

type SkillRow = {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  active: boolean | null;
};

type CaseRowDb = {
  id: string;
  case_id: string | null;
  date: string | null;
  time_start: string | null;
  time_end: string | null;
  patient_code: string | null;
  age: number | null;
  gender: string | null;
  procedure_id: string | null;
  diagnosis: string | null;
  surgeon_name: string | null;
  anaesthetist_name: string | null;
  ot_room: string | null;
  hospital_id: string | null;
  department: string | null;
  staff_id: string | null;
  status: string | null;
  supervisor_comment: string | null;
  created_at: string | null;
  updated_at: string | null;
  profile_type: string | null;
  asa_class: string | null;
};

type CaseSkillRow = {
  id: string;
  case_id: string;
  skill_id: string | null;
};

type FilteredData = {
  filteredCases: CaseRowDb[];
  totalStaff: number;
  totalCases: number;
  totalHospitals: number;
  skillGaps: SkillRow[];
  casesByHospitalStats: {
    hospitalId?: string;
    hospitalName?: string;
    count: number;
  }[];
  asaStats: { label: string; count: number }[];
  totalAsa: number;
  profileStats: { label: string; count: number }[];
  teamPerformanceRows: {
    staffKey: string;
    name: string;
    secondary?: string;
    totalCases: number;
    specialties: number;
    skillsUsed: number;
    lastDate?: string;
  }[];
  skillCoverageRows: {
    staffKey: string;
    staffName: string;
    staffSecondary?: string;
    usedSkillIds: Set<string>;
  }[];
};

function parseDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function useAdminDashboardData({
  selectedHospitalId,
  selectedStaffKey,
  dateFrom,
  dateTo,
}: AdminHookArgs) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [cases, setCases] = useState<CaseRowDb[]>([]);
  const [caseSkills, setCaseSkills] = useState<CaseSkillRow[]>([]);
  const [creationState, setCreationState] = useState<'idle' | 'creating' | 'error'>('idle');

  // -------- load base data once --------
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) {
          console.error('auth error:', userError);
        }
        if (!user) {
          setLoading(false);
          return;
        }

        // load profile
        const { data: profileData, error: profileError } = await supabase
          .from('users_profile')
          .select('*')
          .eq('email', user.email)
          .maybeSingle();
        if (profileError) {
          console.error('profile error:', profileError);
        } else if (profileData) {
          setProfile(profileData as ProfileRow);
        }

        const [hospRes, usersRes, skillsRes, casesRes, csRes] = await Promise.all([
          supabase.from('hospitals').select('*'),
          supabase.from('users_profile').select('*'),
          supabase.from('skills').select('*'),
          supabase.from('cases').select('*'),
          supabase.from('case_skills').select('*'),
        ]);

        if (hospRes.error) console.error('hospitals error:', hospRes.error);
        if (usersRes.error) console.error('users error:', usersRes.error);
        if (skillsRes.error) console.error('skills error:', skillsRes.error);
        if (casesRes.error) console.error('cases error:', casesRes.error);
        if (csRes.error) console.error('case_skills error:', csRes.error);

        setHospitals((hospRes.data || []) as HospitalRow[]);
        setUsers((usersRes.data || []) as ProfileRow[]);
        setSkills((skillsRes.data || []) as SkillRow[]);
        setCases((casesRes.data || []) as CaseRowDb[]);
        setCaseSkills((csRes.data || []) as CaseSkillRow[]);
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  // -------- helper: resolve staff display --------
  function resolveStaff(staffKey: string) {
    // staffKey might be email or id
    const byId = users.find((u) => u.id === staffKey);
    const byEmail = users.find((u) => u.email === staffKey);
    const u = byId || byEmail;
    const name = u?.name || staffKey;
    const secondary = u?.department || u?.email || undefined;
    return {
      key: staffKey,
      name,
      secondary,
    };
  }

  // -------- handle create user (via API route) --------
  async function handleCreateUser(payload: {
    email: string;
    password: string;
    name: string;
    role: 'staff' | 'supervisor' | 'admin';
    hospital_home_id: string;
    department: string;
  }): Promise<boolean> {
    try {
      setCreationState('creating');
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error('create-user API error:', await res.text());
        setCreationState('error');
        return false;
      }
      // refresh users list
      const { data, error } = await supabase.from('users_profile').select('*');
      if (error) {
        console.error('reload users error:', error);
      } else if (data) {
        setUsers(data as ProfileRow[]);
      }
      setCreationState('idle');
      return true;
    } catch (err) {
      console.error('handleCreateUser error:', err);
      setCreationState('error');
      return false;
    }
  }

  // -------- derived / filtered analytics --------
  const filteredData: FilteredData = useMemo(() => {
    if (!cases.length) {
      return {
        filteredCases: [],
        totalStaff: 0,
        totalCases: 0,
        totalHospitals: 0,
        skillGaps: [],
        casesByHospitalStats: [],
        asaStats: [],
        totalAsa: 0,
        profileStats: [],
        teamPerformanceRows: [],
        skillCoverageRows: [],
      };
    }

    const startDate = dateFrom ? parseDate(dateFrom) : null;
    const endDate = dateTo ? parseDate(dateTo) : null;

    const filteredCases = cases.filter((c) => {
      if (selectedHospitalId !== 'all' && c.hospital_id !== selectedHospitalId) {
        return false;
      }
      if (selectedStaffKey !== 'all' && c.staff_id !== selectedStaffKey) {
        return false;
      }
      if (startDate || endDate) {
        const d = parseDate(c.date);
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });

    const totalCases = filteredCases.length;

    // staff & hospital counts
    const staffSet = new Set<string>();
    const hospitalSet = new Set<string>();

    filteredCases.forEach((c) => {
      if (c.staff_id) staffSet.add(c.staff_id);
      if (c.hospital_id) hospitalSet.add(c.hospital_id);
    });

    const totalStaff = staffSet.size;
    const totalHospitals = hospitalSet.size;

    // hospital stats
    const hospitalCounts = new Map<string, number>();
    filteredCases.forEach((c) => {
      if (!c.hospital_id) return;
      const current = hospitalCounts.get(c.hospital_id) || 0;
      hospitalCounts.set(c.hospital_id, current + 1);
    });

    const casesByHospitalStats = Array.from(hospitalCounts.entries()).map(
      ([hospitalId, count]) => {
        const h = hospitals.find((hh) => hh.id === hospitalId);
        return {
          hospitalId,
          hospitalName: h?.name || h?.code || hospitalId,
          count,
        };
      }
    );

    // ASA stats
    const asaCounts = new Map<string, number>();
    filteredCases.forEach((c) => {
      if (!c.asa_class) return;
      const key = c.asa_class.trim();
      asaCounts.set(key, (asaCounts.get(key) || 0) + 1);
    });
    const asaStats = Array.from(asaCounts.entries()).map(([label, count]) => ({
      label,
      count,
    }));
    const totalAsa = asaStats.reduce((sum, a) => sum + a.count, 0);

    // Profile stats
    const profileCounts = new Map<string, number>();
    filteredCases.forEach((c) => {
      const key = c.profile_type || 'Unknown';
      profileCounts.set(key, (profileCounts.get(key) || 0) + 1);
    });
    const profileStats = Array.from(profileCounts.entries()).map(
      ([label, count]) => ({ label, count })
    );

    // Skill usage: build sets
    const filteredCaseIds = new Set(filteredCases.map((c) => c.id));
    const usedSkillIds = new Set<string>();
    caseSkills.forEach((cs) => {
      if (filteredCaseIds.has(cs.case_id) && cs.skill_id) {
        usedSkillIds.add(cs.skill_id);
      }
    });

    // skill gaps = active skills not in usedSkillIds
    const skillGaps = skills.filter((s) => {
      if (s.active === false) return false;
      return !usedSkillIds.has(s.id);
    });

    // team performance rows
    const casesByStaff = new Map<string, CaseRowDb[]>();
    filteredCases.forEach((c) => {
      if (!c.staff_id) return;
      const list = casesByStaff.get(c.staff_id) || [];
      list.push(c);
      casesByStaff.set(c.staff_id, list);
    });

    const teamPerformanceRows: FilteredData['teamPerformanceRows'] = [];
    casesByStaff.forEach((staffCases, staffKey) => {
      const { name, secondary } = resolveStaff(staffKey);

      const specialtySet = new Set<string>();
      staffCases.forEach((c) => {
        const spec = (c as any).specialty || c.procedure_id || '';
        if (spec) specialtySet.add(spec);
      });

      const staffCaseIds = new Set(staffCases.map((c) => c.id));
      const staffSkillIds = new Set<string>();
      caseSkills.forEach((cs) => {
        if (staffCaseIds.has(cs.case_id) && cs.skill_id) {
          staffSkillIds.add(cs.skill_id);
        }
      });

      let lastDateStr: string | undefined;
      let lastDateVal: Date | null = null;
      staffCases.forEach((c) => {
        const d = parseDate(c.date);
        if (!d) return;
        if (!lastDateVal || d > lastDateVal) {
          lastDateVal = d;
          lastDateStr = c.date || undefined;
        }
      });

      teamPerformanceRows.push({
        staffKey,
        name,
        secondary,
        totalCases: staffCases.length,
        specialties: specialtySet.size,
        skillsUsed: staffSkillIds.size,
        lastDate: lastDateStr,
      });
    });

    // skill coverage rows
    const skillCoverageRows: FilteredData['skillCoverageRows'] = [];
    casesByStaff.forEach((staffCases, staffKey) => {
      const { name, secondary } = resolveStaff(staffKey);
      const staffCaseIds = new Set(staffCases.map((c) => c.id));
      const staffSkillIds = new Set<string>();
      caseSkills.forEach((cs) => {
        if (staffCaseIds.has(cs.case_id) && cs.skill_id) {
          staffSkillIds.add(cs.skill_id);
        }
      });
      skillCoverageRows.push({
        staffKey,
        staffName: name,
        staffSecondary: secondary,
        usedSkillIds: staffSkillIds,
      });
    });

    return {
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
    };
  }, [
    cases,
    caseSkills,
    skills,
    hospitals,
    selectedHospitalId,
    selectedStaffKey,
    dateFrom,
    dateTo,
  ]);

  return {
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
  };
}
