import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
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

    // Require a valid signed-in caller.
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
      return jsonResponse({ error: 'Invalid or expired session. Please sign in again.' }, 401)
    }

    // Only an administrator may delete another account.
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
      return jsonResponse({ error: 'Only administrators can delete user accounts.' }, 403)
    }

    let body: { user_id?: unknown }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Request body must be valid JSON.' }, 400)
    }

    const targetUserId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    // Validate UUID shape before using it as an account identifier.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!targetUserId || !uuidPattern.test(targetUserId)) {
      return jsonResponse({ error: 'A valid user_id is required.' }, 400)
    }

    if (targetUserId === caller.id) {
      return jsonResponse({ error: 'You cannot delete your own account.' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Confirm that the target account exists before attempting deletion.
    const { data: targetUserResult, error: targetUserError } =
      await adminClient.auth.admin.getUserById(targetUserId)

    if (targetUserError || !targetUserResult.user) {
      console.error('Target account lookup failed:', targetUserError?.message)
      return jsonResponse({ error: 'The selected user account was not found.' }, 404)
    }

    // Deleting the Auth user should cascade to profiles if the project's
    // profiles.id foreign key references auth.users(id) with ON DELETE CASCADE.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)

    if (deleteError) {
      console.error('Auth account deletion failed:', deleteError.message)
      return jsonResponse({ error: `Unable to delete the account: ${deleteError.message}` }, 500)
    }

    return jsonResponse({
      message: 'User account deleted successfully.',
      user_id: targetUserId,
    })
  } catch (error) {
    console.error('Unexpected admin-delete-user error:', error)
    const message = error instanceof Error ? error.message : 'Unknown server error.'
    return jsonResponse({ error: `An unexpected server error occurred: ${message}` }, 500)
  }
})
