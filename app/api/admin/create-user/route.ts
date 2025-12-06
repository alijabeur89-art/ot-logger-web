import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// This route MUST run on the server only
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Supabase URL or SERVICE ROLE key missing in environment variables.');
}

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server is not configured correctly (Supabase admin client missing).' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      email,
      password,
      name,
      role,
      hospital_home_id,
      department,
    } = body as {
      email: string;
      password: string;
      name?: string;
      role: 'staff' | 'supervisor' | 'admin';
      hospital_home_id?: string | null;
      department?: string | null;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // 1) Create auth user
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (userError || !userData.user) {
      console.error('Admin createUser error:', userError);
      return NextResponse.json(
        { error: userError?.message || 'Failed to create auth user.' },
        { status: 400 }
      );
    }

    // 2) Insert into users_profile
    const { error: profileError } = await supabaseAdmin
      .from('users_profile')
      .insert({
        email,
        name: name || null,
        role,
        hospital_home_id: hospital_home_id || null,
        department: department || null,
        active: true,
      });

    if (profileError) {
      console.error('Profile insert error:', profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('Unexpected error in create-user route:', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error.' },
      { status: 500 }
    );
  }
}
