
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Camera,
  KeyRound,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type Profile = {
  id: string
  full_name: string | null
  role: 'admin' | 'staff'
  avatar_path: string | null
  office_name: string | null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred.'
}

export default function MyProfile() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [officeName, setOfficeName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setLoading(true)
      setError('')

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) throw authError
        if (!user) throw new Error('Please sign in again.')

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role, avatar_path, office_name')
          .eq('id', user.id)
          .single()

        if (profileError) throw profileError

        if (data.role !== 'admin' && data.role !== 'staff') {
          throw new Error('Your account has an invalid role.')
        }

        if (!active) return

        setProfile(data as Profile)
        setEmail(user.email ?? '')
        setFullName(data.full_name ?? '')
        setOfficeName(data.office_name ?? '')

        if (data.avatar_path) {
          const { data: publicData } = supabase.storage
            .from('avatars')
            .getPublicUrl(data.avatar_path)

          setAvatarUrl(publicData.publicUrl)
        } else {
          setAvatarUrl('')
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError('')
    setMessage('')

    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.')
      event.target.value = ''
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('The image must be 2 MB or smaller.')
      event.target.value = ''
      return
    }

    setSelectedFile(file)
    setAvatarUrl(URL.createObjectURL(file))
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !isAdmin) return

    setSavingProfile(true)
    setError('')
    setMessage('')

    try {
      const cleanName = fullName.trim()

      if (!cleanName) {
        throw new Error('Full name is required.')
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: cleanName })
        .eq('id', profile.id)

      if (updateError) throw updateError

      setProfile({ ...profile, full_name: cleanName })
      setFullName(cleanName)
      setMessage('Your full name was updated successfully.')

      window.dispatchEvent(new Event('profile-avatar-updated'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveAvatar() {
    if (!profile || !selectedFile) return

    setUploadingAvatar(true)
    setError('')
    setMessage('')

    let uploadedPath = ''

    try {
      const extension = selectedFile.name.split('.').pop()?.toLowerCase()
      const safeExtension =
        extension === 'png' || extension === 'webp' ? extension : 'jpg'

      // Store every user's avatar inside their own user-ID folder.
      uploadedPath = `${profile.id}/avatar-${Date.now()}.${safeExtension}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(uploadedPath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: uploadedPath })
        .eq('id', profile.id)

      if (updateError) {
        // Remove the new upload if the profile row could not be updated.
        await supabase.storage.from('avatars').remove([uploadedPath])
        throw updateError
      }

      const { data: publicData } = supabase.storage
        .from('avatars')
        .getPublicUrl(uploadedPath)

      setProfile({ ...profile, avatar_path: uploadedPath })
      setAvatarUrl(publicData.publicUrl)
      setSelectedFile(null)
      setMessage('Your profile picture was updated successfully.')

      window.dispatchEvent(new Event('profile-avatar-updated'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAdmin) return

    setError('')
    setMessage('')

    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSavingPassword(true)

    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (passwordError) throw passwordError

      setNewPassword('')
      setConfirmPassword('')
      setMessage('Your password was changed successfully.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading your profile...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error || 'Your profile could not be loaded.'}
      </div>
    )
  }

  const initial = profile.full_name?.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-4xl space-y-6 overflow-y-auto overscroll-y-contain pb-6">
      <header>
        <p className="text-xs font-medium text-slate-500">
          Workspace / Account
        </p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">
          My Profile
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          View your account and manage the settings permitted for your role.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-slate-100 bg-blue-100 text-3xl font-bold text-blue-800">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Your profile"
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">
              {profile.full_name || 'My Account'}
            </h3>
            <p className="break-all text-sm text-slate-500">{email}</p>
            <span className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
              {profile.role}
            </span>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Camera size={16} />
                Choose picture
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>

              {selectedFile && (
                <button
                  type="button"
                  onClick={() => void saveAvatar()}
                  disabled={uploadingAvatar}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save size={16} />
                  {uploadingAvatar ? 'Uploading...' : 'Save picture'}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              JPG, PNG, or WebP. Maximum size: 2 MB.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <UserRound className="text-blue-700" size={21} />
          <div>
            <h3 className="font-semibold text-slate-900">Personal Information</h3>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? 'You can update your own full name.'
                : 'Your full name is managed by an administrator.'}
            </p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Full Name
            <input
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              disabled={!isAdmin}
              readOnly={!isAdmin}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email Address
            <input
              value={email}
              readOnly
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-500"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Office
            <input
              value={officeName}
              readOnly
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-500"
            />
          </label>

          {isAdmin && (
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <Save size={16} />
              {savingProfile ? 'Saving...' : 'Save Full Name'}
            </button>
          )}
        </form>
      </section>

      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <KeyRound className="text-blue-700" size={21} />
            <div>
              <h3 className="font-semibold text-slate-900">Change Password</h3>
              <p className="text-xs text-slate-500">
                Choose a strong password with at least 8 characters.
              </p>
            </div>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              New Password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Confirm New Password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </label>

            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              <KeyRound size={16} />
              {savingPassword ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </section>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <ShieldCheck size={20} className="mt-0.5 shrink-0" />
        <p>
          Your account permissions are based on your assigned role.
          {isAdmin
            ? ' You can update your own name and password, as well as your picture.'
            : ' You can update your picture. Contact an administrator if your name needs correction.'}
        </p>
      </div>
    </div>
  )
}
