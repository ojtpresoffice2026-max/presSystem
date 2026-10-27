import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Require a valid signed-in user session.
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

    // Verify the caller's admin role from the database, not from client input.
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
        { error: 'Only administrators can reset user passwords.' },
        403,
      )
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
    }

    const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    const newPassword =
      typeof body.new_password === 'string' ? body.new_password : ''

    if (!userId || !newPassword) {
      return jsonResponse(
        { error: 'User ID and new password are required.' },
        400,
      )
    }

    // Validate UUID format before calling the Admin API.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidPattern.test(userId)) {
      return jsonResponse({ error: 'The selected user ID is invalid.' }, 400)
    }

    if (newPassword.length < 8) {
      return jsonResponse(
        { error: 'Password must be at least 8 characters.' },
        400,
      )
    }

    if (newPassword.length > 72) {
      return jsonResponse(
        { error: 'Password cannot exceed 72 characters.' },
        400,
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: updatedUser, error: updateError } =
      await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      })

    if (updateError || !updatedUser.user) {
      console.error('Password reset failed:', updateError?.message)
      return jsonResponse(
        { error: updateError?.message ?? 'Unable to reset the password.' },
        400,
      )
    }

    return jsonResponse({
      message: 'Password reset successfully.',
      user_id: updatedUser.user.id,
    })
  } catch (error) {
    console.error('Unexpected password-reset function error:', error)
    return jsonResponse({ error: 'An unexpected server error occurred.' }, 500)
  }
})
