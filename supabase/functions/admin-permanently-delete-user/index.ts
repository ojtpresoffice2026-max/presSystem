
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? 'Unknown error') }
  }

  const value = error as Record<string, unknown>

  return {
    message: value.message ?? 'Unknown error',
    code: value.code ?? null,
    details: value.details ?? null,
    hint: value.hint ?? null,
    status: value.status ?? null,
    name: value.name ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed.' },
      405,
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error('Missing required Supabase environment variables.')

      return jsonResponse({
        success: false,
        error: 'Server configuration is incomplete.',
      }, 500)
    }

    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return jsonResponse({
        success: false,
        error: 'You must sign in before deleting an account.',
      }, 401)
    }

    // Verify the signed-in caller.
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
      data: { user: adminUser },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !adminUser) {
      return jsonResponse({
        success: false,
        error: 'Your session is invalid or has expired. Sign in again.',
      }, 401)
    }

    // Create a service-role client only after verifying the caller.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    // Confirm the caller is an active administrator.
    const { data: adminProfile, error: adminProfileError } =
      await adminClient
        .from('profiles')
        .select('role, is_active')
        .eq('id', adminUser.id)
        .maybeSingle()

    if (adminProfileError) {
      console.error(
        'Administrator verification failed:',
        getErrorDetails(adminProfileError),
      )

      return jsonResponse({
        success: false,
        error: 'Unable to verify administrator permissions.',
      }, 500)
    }

    if (
      !adminProfile ||
      adminProfile.role !== 'admin' ||
      adminProfile.is_active !== true
    ) {
      return jsonResponse({
        success: false,
        error: 'Only active administrators can delete accounts.',
      }, 403)
    }

    const body = await req.json().catch(() => null)
    const targetUserId = body?.user_id

    if (
      typeof targetUserId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetUserId,
      )
    ) {
      return jsonResponse({
        success: false,
        error: 'A valid user ID is required.',
      }, 400)
    }

    if (targetUserId === adminUser.id) {
      return jsonResponse({
        success: false,
        error: 'You cannot delete your own account.',
      }, 400)
    }

    // Confirm that the target exists in Supabase Auth.
    const {
      data: { user: targetUser },
      error: targetLookupError,
    } = await adminClient.auth.admin.getUserById(targetUserId)

    if (targetLookupError || !targetUser) {
      console.error(
        'Target Auth account lookup failed:',
        getErrorDetails(targetLookupError),
      )

      return jsonResponse({
        success: false,
        error: 'The selected authentication account was not found.',
      }, 404)
    }

    // Attempt permanent Auth deletion.
    // Related database records are not manually deleted here.
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(targetUserId)

    if (deleteError) {
      const details = getErrorDetails(deleteError)

      console.error(
        'Permanent account deletion failed:',
        JSON.stringify({
          targetUserId,
          error: details,
        }),
      )

      return jsonResponse({
        success: false,
        code: 'AUTH_DELETE_FAILED',
        error: 'Supabase Auth could not delete this account.',
        diagnostic: details,
      }, 409)
    }

    console.log(
      `Permanent account deletion succeeded for ${targetUserId}`,
    )

    return jsonResponse({
      success: true,
      user_id: targetUserId,
      message: 'The authentication account was permanently deleted.',
    })
  } catch (error) {
    console.error(
      'Unexpected permanent deletion error:',
      getErrorDetails(error),
    )

    return jsonResponse({
      success: false,
      error: 'An unexpected server error occurred.',
      diagnostic: getErrorDetails(error),
    }, 500)
  }
})
