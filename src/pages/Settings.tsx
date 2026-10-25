
import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ImagePlus,
  Trash2,
  Save,
  UserRound,
  ArrowLeft,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SeasonalAnimationSettings from '../component/SeasonalAnimationSettings'

type Profile = {
  id: string
  full_name: string | null
  avatar_path: string | null
}

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function SettingsPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Load the current user's profile.
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
          .select('id, full_name, avatar_path')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) throw profileError

        if (!active) return

        if (!data) {
          throw new Error(
            'Your profile was not found in the profiles table.',
          )
        }

        setProfile(data as Profile)
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load your profile.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [])

  // Create and clean up the selected image preview.
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  const avatarUrl = profile?.avatar_path
    ? supabase.storage
        .from('avatars')
        .getPublicUrl(profile.avatar_path).data.publicUrl
    : ''

  function handleFileSelection(file?: File) {
    setError('')
    setMessage('')

    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('The image must be 2 MB or smaller.')
      return
    }

    setSelectedFile(file)
  }

  // Upload a new profile picture and update the profile.
  async function saveProfilePicture() {
    if (!profile || !selectedFile) return

    setSaving(true)
    setError('')
    setMessage('')

    let uploadedPath: string | null = null

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }

      const extension = extensionByType[selectedFile.type]

      if (!extension) {
        throw new Error('Unsupported image format.')
      }

      uploadedPath = `${user.id}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(uploadedPath, selectedFile, {
          contentType: selectedFile.type,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const oldPath = profile.avatar_path

      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: uploadedPath })
        .eq('id', user.id)
        .select('id, full_name, avatar_path')
        .single()

      if (updateError) throw updateError

      setProfile(updatedProfile as Profile)
      setSelectedFile(null)

      window.dispatchEvent(new Event('profile-avatar-updated'))
      setMessage('Profile picture updated successfully.')

      // Remove the old image after the new path has been saved.
      if (oldPath && oldPath !== uploadedPath) {
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([oldPath])

        if (deleteError) {
          console.error(
            'Could not delete the previous avatar:',
            deleteError,
          )
        }
      }
    } catch (err) {
      // Remove the uploaded file only if the profile was not updated to use it.
      if (uploadedPath) {
        const { data: currentUser } = await supabase.auth.getUser()

        if (currentUser.user) {
          const { data: currentProfile } = await supabase
            .from('profiles')
            .select('avatar_path')
            .eq('id', currentUser.user.id)
            .maybeSingle()

          if (currentProfile?.avatar_path !== uploadedPath) {
            await supabase.storage
              .from('avatars')
              .remove([uploadedPath])
          }
        }
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save your profile picture.',
      )
    } finally {
      setSaving(false)
    }
  }

  // Remove the profile picture.
  async function removeProfilePicture() {
    if (!profile) return

    if (!profile.avatar_path && !selectedFile) return

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      // Clear the database reference first.
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: null })
        .eq('id', user.id)
        .select('id, full_name, avatar_path')
        .single()

      if (updateError) throw updateError

      const oldPath = profile.avatar_path

      setProfile(updatedProfile as Profile)
      setSelectedFile(null)

      window.dispatchEvent(new Event('profile-avatar-updated'))

      if (oldPath) {
        const { error: deleteError } = await supabase.storage
          .from('avatars')
          .remove([oldPath])

        if (deleteError) {
          console.error('Could not delete the old avatar:', deleteError)

          setMessage(
            'Picture removed from your profile, but the old file could not be deleted.',
          )
          return
        }
      }

      setMessage('Profile picture removed.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to remove the profile picture.',
      )
    } finally {
      setSaving(false)
    }
  }

  function cancelSelection() {
    setSelectedFile(null)
    setError('')
    setMessage('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const displayedAvatar = previewUrl || avatarUrl

  const initial =
    profile?.full_name?.trim().charAt(0).toUpperCase() || ''

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <header>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"
        >
          <ArrowLeft size={17} />
          Back to Dashboard
        </button>

        <p className="text-sm text-slate-500">Workspace / Settings</p>

        <h1 className="mt-1 text-3xl font-bold text-white-950">
          Profile Settings
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Manage your profile picture and account appearance.
        </p>
      </header>

      {/* Profile picture settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 border-b border-slate-100 pb-5">
          <h2 className="text-lg font-bold text-slate-900">
            Profile Picture
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Upload a JPG, PNG, or WebP image up to 2 MB.
          </p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Loading your profile...
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              {/* Avatar preview */}
              <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-blue-100 text-blue-800 shadow-md ring-1 ring-slate-200">
                {displayedAvatar ? (
                  <img
                    src={displayedAvatar}
                    alt="Profile preview"
                    className="h-full w-full object-cover"
                  />
                ) : initial ? (
                  <span className="text-4xl font-bold">{initial}</span>
                ) : (
                  <UserRound size={46} />
                )}
              </div>

              <div className="w-full flex-1 text-center sm:text-left">
                <h3 className="text-xl font-bold text-slate-900">
                  {profile?.full_name || 'My Account'}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Your profile image appears in the application header.
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={event =>
                      handleFileSelection(event.target.files?.[0])
                    }
                  />

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectedFile ? (
                      <ImagePlus size={17} />
                    ) : (
                      <Camera size={17} />
                    )}

                    {selectedFile ? 'Choose Another' : 'Choose Picture'}
                  </button>

                  {selectedFile && (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={saveProfilePicture}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Save size={17} />
                        {saving ? 'Saving...' : 'Save Picture'}
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={cancelSelection}
                        className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {(profile?.avatar_path || selectedFile) && !selectedFile && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={removeProfilePicture}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 size={17} />
                      {saving ? 'Removing...' : 'Remove Picture'}
                    </button>
                  )}
                </div>

                <p className="mt-4 text-xs text-slate-400">
                  Supported formats: JPG, PNG, WebP. Maximum size: 2 MB.
                </p>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                role="status"
                className="mt-6 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
              >
                {message}
              </div>
            )}
          </>
        )}
      </section>

      {/* Seasonal animation controls */}
      <SeasonalAnimationSettings />
        </div>
      </div>
    </div>
  )
}
