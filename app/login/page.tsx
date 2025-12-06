'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!email || !password) {
      setMessage('Please enter email and password.');
      return;
    }

    setLoading(true);

    try {
      // 1) Login with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError || !authData.user) {
        setMessage(authError?.message || 'Invalid credentials.');
        setLoading(false);
        return;
      }

      const user = authData.user;

      // 2) Load user profile from users_profile
      const { data: profile, error: profileError } = await supabase
  .from('users_profile')
  .select('*')
  .eq('email', user.email)
  .single();


      if (profileError || !profile) {
        console.error(profileError);
        setMessage(
          'Login OK, but no profile found. Please create a row in users_profile.'
        );
        setLoading(false);
        return;
      }

      // 3) Route based on role
      const role = (profile.role || '').toLowerCase();
      if (role === 'staff') {
        router.push('/staff');
      } else if (role === 'supervisor') {
        router.push('/supervisor');
      } else if (role === 'admin') {
        router.push('/admin');
      } else {
        setMessage('Unknown role: ' + profile.role);
      }
    } catch (err: any) {
      console.error(err);
      setMessage('Unexpected error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.25em] text-sky-800 uppercase">
            Hamad Medical Corporation
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            OT Case Logger
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your registered email to access staff, supervisor or
            admin dashboards.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-700">
              Work Email
              <input
                type="email"
                className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                placeholder="you@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm text-slate-700">
              Password
              <input
                type="password"
                className="mt-1 w-full rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>

          {message && (
            <p className="text-xs text-red-600 mt-1 min-h-[1rem]">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-gradient-to-r from-sky-500 to-sky-700 py-2 text-sm font-medium text-white shadow-md hover:from-sky-600 hover:to-sky-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-slate-400">
          Internal educational tool for Operating Theatre case logging. Not a
          replacement for official medical records.
        </p>
      </div>
    </main>
  );
}
