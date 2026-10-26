import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type UserRole = 'admin' | 'staff'

const OFFICE = 'Office of the President - NORSU'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Required Supabase environment variables are missing.')
      return jsonResponse({ error: 'Server configuration is incomplete.' }, 500)
    }

    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication is required.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser()

    if (callerError || !caller) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401)
    }

    const { data: callerProfile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (profileError) {
      console.error('Could not verify administrator role:', profileError.message)
      return jsonResponse({ error: 'Unable to verify your permissions.' }, 500)
    }

    if (callerProfile?.role !== 'admin') {
      return jsonResponse(
        { error: 'Only administrators can create user accounts.' },
        403,
      )
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
    }

    const fullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : ''
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const requestedRole = body.role

    if (!fullName || !email || !password) {
      return jsonResponse(
        { error: 'Full name, email, and password are required.' },
        400,
      )
    }

    if (password.length < 8) {
      return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400)
    }

    if (requestedRole !== 'admin' && requestedRole !== 'staff') {
      return jsonResponse(
        { error: 'Invalid user role. Choose Admin or Staff.' },
        400,
      )
    }

    const role: UserRole = requestedRole
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

    if (createError || !createdUser.user) {
      console.error('Auth user creation failed:', createError?.message)
      return jsonResponse(
        { error: createError?.message ?? 'Unable to create the account.' },
        400,
      )
    }

    const newUserId = createdUser.user.id

    const { error: saveProfileError } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          full_name: fullName,
          role,
          office: OFFICE,
        },
        { onConflict: 'id' },
      )

    if (saveProfileError) {
      console.error('Profile creation failed:', saveProfileError.message)
      const { error: rollbackError } =
        await adminClient.auth.admin.deleteUser(newUserId)

      if (rollbackError) {
        console.error('Account rollback failed:', rollbackError.message)
      }

      return jsonResponse(
        {
          error:
            'The account could not be saved. Verify that the profiles table has an office column and try again.',
        },
        500,
      )
    }

    return jsonResponse({
      message: 'User account created successfully.',
      user: {
        id: newUserId,
        email,
        full_name: fullName,
        role,
        office: OFFICE,
      },
    })
  } catch (error) {
    console.error('Unexpected function error:', error)
    return jsonResponse({ error: 'An unexpected server error occurred.' }, 500)
  }
})
