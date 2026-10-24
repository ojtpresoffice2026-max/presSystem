
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProfileAvatar from './ProfileAvatar'

type HeaderProfile = {
  full_name: string | null
  avatar_path: string | null
}

export default function HeaderProfileButton() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<HeaderProfile | null>(null)

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        setProfile(null)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_path')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      setProfile(data)
    } catch (error) {
      console.error('Unable to load header profile:', error)
    }
  }, [])

  useEffect(() => {
    void loadProfile()

    const handleProfileUpdate = () => {
      void loadProfile()
    }

    window.addEventListener(
      'profile-avatar-updated',
      handleProfileUpdate,
    )

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadProfile()
    })

    return () => {
      window.removeEventListener(
        'profile-avatar-updated',
        handleProfileUpdate,
      )
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const avatarUrl = profile?.avatar_path
    ? supabase.storage
        .from('avatars')
        .getPublicUrl(profile.avatar_path).data.publicUrl
    : null

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      aria-label="Open profile settings"
      title="Profile Settings"
      className="rounded-full transition hover:ring-4 hover:ring-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-200"
    >
      <ProfileAvatar
        src={avatarUrl}
        name={profile?.full_name}
        size={44}
      />
    </button>
  )
}
