
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    const body = await req.json()
    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : ''

    if (!email) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase server environment variables')

      return Response.json(
        { error: 'Server configuration error' },
        { status: 500, headers: corsHeaders }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Find the Auth user by email.
    let page = 1
    let userId: string | null = null
    const perPage = 1000

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage,
      })

      if (error) {
        console.error('Auth user lookup failed:', error.message)
        throw error
      }

      const match = data.users.find(
        user => user.email?.toLowerCase() === email
      )

      if (match) {
        userId = match.id
        break
      }

      if (data.users.length < perPage) {
        break
      }

      page++
    }

    if (!userId) {
      return Response.json(
        { status: 'unknown' },
        { headers: corsHeaders }
      )
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_active')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error('Profile lookup failed:', profileError.message)
      throw profileError
    }

    if (!profile) {
      return Response.json(
        { status: 'unknown' },
        { headers: corsHeaders }
      )
    }

    return Response.json(
      {
        status: profile.is_active === true
          ? 'active'
          : 'inactive',
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Account status check failed:', error)

    return Response.json(
      { error: 'Unable to check account status' },
      { status: 500, headers: corsHeaders }
    )
  }
})
