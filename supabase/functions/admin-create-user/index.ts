
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type UserRole = 'admin' | 'staff'

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
    // Load server-side environment variables.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Required Supabase environment variables are missing.')

      return jsonResponse(
        { error: 'Server configuration is incomplete.' },
        500,
      )
    }

    // Require an authenticated caller.
    const authorization = req.headers.get('Authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'Authentication is required.' },
        401,
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authorization },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await userClient.auth.getUser()

    if (callerError || !caller) {
      return jsonResponse(
        { error: 'Invalid or expired session.' },
        401,
      )
    }

    // Verify that the caller is an administrator.
    const { data: callerProfile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (profileError) {
      console.error(
        'Could not verify administrator role:',
        profileError.message,
      )

      return jsonResponse(
        { error: 'Unable to verify your permissions.' },
        500,
      )
    }

    if (callerProfile?.role !== 'admin') {
      return jsonResponse(
        { error: 'Only administrators can create user accounts.' },
        403,
      )
    }

    // Read the submitted account information.
    const body = await req.json()

    const fullName =
      typeof body.full_name === 'string'
        ? body.full_name.trim()
        : ''

    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : ''

    const password =
      typeof body.password === 'string'
        ? body.password
        : ''

    const requestedRole: unknown = body.role

    // Validate required fields.
    if (!fullName || !email || !password) {
      return jsonResponse(
        { error: 'Full name, email, and password are required.' },
        400,
      )
    }

    if (password.length < 8) {
      return jsonResponse(
        { error: 'Password must be at least 8 characters.' },
        400,
      )
    }

    // Only these two roles are allowed.
    if (
      requestedRole !== 'admin' &&
      requestedRole !== 'staff'
    ) {
      return jsonResponse(
        { error: 'Invalid user role. Choose Admin or Staff.' },
        400,
      )
    }

    const role: UserRole = requestedRole

    // Create the privileged client on the server only.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    // Create the authentication account.
    const {
      data: createdUser,
      error: createError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (createError || !createdUser.user) {
      console.error(
        'Auth user creation failed:',
        createError?.message,
      )

      return jsonResponse(
        {
          error:
            createError?.message ??
            'Unable to create the account.',
        },
        400,
      )
    }

    const newUserId = createdUser.user.id

    // Save the profile. Upsert supports projects that use a profile trigger.
    const { error: saveProfileError } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          full_name: fullName,
          role,
        },
        { onConflict: 'id' },
      )

    if (saveProfileError) {
      console.error(
        'Profile creation failed:',
        saveProfileError.message,
      )

      // Roll back the Auth account if the profile cannot be saved.
      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(newUserId)

      if (deleteError) {
        console.error(
          'Account rollback failed:',
          deleteError.message,
        )
      }

      return jsonResponse(
        {
          error:
            'The account could not be saved. Please check the profile configuration and try again.',
        },
        500,
      )
    }

    // Return the created account information.
    return jsonResponse({
      message: 'User account created successfully.',
      user: {
        id: newUserId,
        email,
        full_name: fullName,
        role,
      },
    })
  } catch (error) {
    console.error('Unexpected function error:', error)

    return jsonResponse(
      { error: 'An unexpected server error occurred.' },
      500,
    )
  }
})
