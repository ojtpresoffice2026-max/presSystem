
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import {
  MessageCircle,
  Send,
  X,
  Users,
  LoaderCircle,
  Trash2,
} from 'lucide-react'

import { supabase } from '../lib/supabase'

type ChatMessage = {
  id: string
  sender_id: string
  body: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_path: string | null
}

type ChatProfile = {
  name: string
  avatarUrl: string | null
}

function displayTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function displayDateTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return '?'

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getAvatarUrl(path: string | null) {
  if (!path) return null

  const { data } = supabase.storage
    .from('avatars')
    .getPublicUrl(path)

  return data.publicUrl || null
}

function ChatAvatar({
  name,
  avatarUrl,
  own = false,
}: {
  name: string
  avatarUrl: string | null
  own?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [avatarUrl])

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
        own
          ? 'border-blue-300 bg-blue-100 text-blue-800'
          : 'border-slate-200 bg-slate-200 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100'
      }`}
      title={name}
      aria-label={`${name}'s profile picture`}
    >
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt={`${name}'s profile`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-xs font-bold">
          {getInitials(name)}
        </span>
      )}
    </div>
  )
}

export default function StaffGroupChat() {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [messagePendingDelete, setMessagePendingDelete] =
    useState<ChatMessage | null>(null)
  const [myName, setMyName] = useState('Staff member')
  const [myAvatar, setMyAvatar] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [profiles, setProfiles] = useState<
    Record<string, ChatProfile>
  >({})

  const [draft, setDraft] = useState('')
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  const panelRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const userIdRef = useRef(userId)
  const readRequestRef = useRef(false)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  // Keep the displayed date and time current.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  // Close the panel when clicking outside it, including
  // navigation links, other system features, or the header.
  useEffect(() => {
    if (!open) return

    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) return

      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return

      setOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener(
      'pointerdown',
      handleOutsidePointer,
      true,
    )
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointer,
        true,
      )
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  // Load the currently authenticated user's profile.
  const loadIdentity = useCallback(async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) throw authError

    if (!user) {
      setUserId(null)
      userIdRef.current = null
      return
    }

    setUserId(user.id)
    userIdRef.current = user.id

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_path, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError

    const name =
      data?.full_name?.trim() ||
      user.email ||
      'Staff member'

    const avatarUrl = getAvatarUrl(
      data?.avatar_path ?? null,
    )

    setMyName(name)
    setMyAvatar(avatarUrl)
    setIsAdmin(String(data?.role ?? '').toLowerCase() === 'admin')

    setProfiles((current) => ({
      ...current,
      [user.id]: {
        name,
        avatarUrl,
      },
    }))
  }, [])

  // Load messages and sender information.
  const loadMessages = useCallback(
    async (markRead: boolean) => {
      setLoading(true)
      setError('')

      try {
        const { data, error: messageError } = await supabase
          .from('staff_chat_messages')
          .select('id, sender_id, body, created_at, deleted_at, deleted_by')
          .order('created_at', { ascending: true })
          .limit(200)

        if (messageError) throw messageError

        const rows = (data || []) as ChatMessage[]
        setMessages(rows)

        const senderIds = [
          ...new Set(
            rows.flatMap((message) => [message.sender_id, message.deleted_by])
              .filter((id): id is string => Boolean(id)),
          ),
        ]

        if (senderIds.length > 0) {
          const { data: people, error: peopleError } =
            await supabase
              .from('profiles')
              .select('id, full_name, avatar_path')
              .in('id', senderIds)

          if (peopleError) throw peopleError

          const nextProfiles: Record<string, ChatProfile> = {}

          ;((people || []) as ProfileRow[]).forEach((person) => {
            nextProfiles[person.id] = {
              name: person.full_name?.trim() || 'Staff member',
              avatarUrl: getAvatarUrl(person.avatar_path),
            }
          })

          setProfiles((current) => ({
            ...current,
            ...nextProfiles,
          }))
        }

        if (markRead) {
          const { error: readError } = await supabase.rpc(
            'staff_chat_mark_read',
          )

          if (readError) throw readError

          setUnread(0)
        } else {
          const { data: count, error: countError } =
            await supabase.rpc('staff_chat_unread_count')

          if (countError) throw countError

          setUnread(Number(count || 0))
        }
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : 'Unable to load group chat.'

        console.error('Staff chat load error:', e)
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Mark messages as read.
  const markMessagesRead = useCallback(async () => {
    if (readRequestRef.current || !userIdRef.current) return

    readRequestRef.current = true

    try {
      const { error: readError } = await supabase.rpc(
        'staff_chat_mark_read',
      )

      if (readError) throw readError

      setUnread(0)
    } catch (e) {
      console.error('Unable to mark chat as read:', e)
    } finally {
      readRequestRef.current = false
    }
  }, [])

  useEffect(() => {
    void loadIdentity().catch((e) => {
      const message =
        e instanceof Error
          ? e.message
          : 'Unable to identify user.'

      console.error('Staff chat identity error:', e)
      setError(message)
    })
  }, [loadIdentity])

  // Subscribe to new messages using Supabase Realtime.
  useEffect(() => {
    if (!userId) return

    void loadMessages(openRef.current)

    const channel = supabase
      .channel('pres-system-staff-chat')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_chat_messages',
        },
        (payload) => {
          const message = payload.new as ChatMessage

          setMessages((current) => {
            if (
              current.some((item) => item.id === message.id)
            ) {
              return current
            }

            return [...current, message].slice(-200)
          })

          // The sender should not receive their own notification.
          if (message.sender_id === userIdRef.current) return

          if (openRef.current) {
            void markMessagesRead()
          } else {
            setUnread((count) => count + 1)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'staff_chat_messages',
        },
        async (payload) => {
          const updatedMessage = payload.new as ChatMessage
          setMessages((current) =>
            current.map((item) =>
              item.id === updatedMessage.id ? updatedMessage : item,
            ),
          )

          // Load the deleting user's name so every connected client can show it.
          if (updatedMessage.deleted_by) {
            const { data: person } = await supabase
              .from('profiles')
              .select('id, full_name, avatar_path')
              .eq('id', updatedMessage.deleted_by)
              .maybeSingle()

            if (person) {
              setProfiles((current) => ({
                ...current,
                [person.id]: {
                  name: person.full_name?.trim() || 'Administrator',
                  avatarUrl: getAvatarUrl(person.avatar_path ?? null),
                },
              }))
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setError(
            'Chat connection failed. Check Supabase Realtime settings.',
          )
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, loadMessages, markMessagesRead])

  // Opening the panel loads messages and marks them as read.
  useEffect(() => {
    if (!open) return

    void loadMessages(true)
  }, [open, loadMessages])

  // Scroll to the latest message when appropriate.
  useEffect(() => {
    if (!open) return

    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages.length, open])

  // Send messages using the authenticated user's ID.
  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const body = draft.trim()

    if (!body || sending) return

    setSending(true)
    setError('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        throw new Error(
          'Your session has expired. Please sign in again.',
        )
      }

      const { error: sendError } = await supabase
        .from('staff_chat_messages')
        .insert({
          sender_id: user.id,
          body,
        })

      if (sendError) throw sendError

      setDraft('')
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'Unknown error while sending message.'

      console.error('Staff chat send error:', e)
      setError(`Unable to send message: ${message}`)
    } finally {
      setSending(false)
    }
  }

  // Soft-delete a message so everyone can see who deleted it.
  // Supabase RLS must authorize this UPDATE for admins.
  async function deleteMessage(message: ChatMessage) {
    if (!isAdmin || deletingId) return

    setDeletingId(message.id)
    setMessagePendingDelete(null)
    setError('')

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const { data: updatedMessage, error: deleteError } = await supabase
        .from('staff_chat_messages')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
        .eq('id', message.id)
        .is('deleted_at', null)
        .select('id, sender_id, body, created_at, deleted_at, deleted_by')
        .maybeSingle()

      if (deleteError) throw deleteError
      if (!updatedMessage) {
        throw new Error('No message was marked as deleted. Check the admin UPDATE RLS policy and confirm your profiles.role is admin.')
      }

      setMessages((current) => current.map((item) =>
        item.id === message.id ? updatedMessage as ChatMessage : item,
      ))

      const { data: deleterProfile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_path')
        .eq('id', user.id)
        .maybeSingle()

      setProfiles((current) => ({
        ...current,
        [user.id]: {
          name: deleterProfile?.full_name?.trim() || myName,
          avatarUrl: getAvatarUrl(deleterProfile?.avatar_path ?? null),
        },
      }))
    } catch (e: unknown) {
      const messageText =
        typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string'
          ? e.message
          : String(e)
      console.error('Staff chat soft-delete error:', e)
      setError(`Unable to mark message as deleted: ${messageText}`)
    } finally {
      setDeletingId(null)
    }
  }

  // Enter sends; Shift+Enter adds a line.
  function handleMessageKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()

    if (draft.trim() && !sending) {
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="relative">
      {/* Header chat button and unread red dot */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          unread > 0
            ? 'Open staff group chat. New messages'
            : 'Open staff group chat'
        }
        title="Staff group chat"
        aria-expanded={open}
        className="relative rounded-xl border border-slate-200 p-3 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:hover:bg-slate-700"
      >
        <MessageCircle size={19} />

        {unread > 0 && !open && (
          <span
            className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-800"
            aria-label="Unread messages"
            title="New messages"
          />
        )}
      </button>

      {open && (
        <section
          ref={panelRef}
          aria-label="Staff group chat"
          className="fixed bottom-4 right-4 z-[100] flex h-[min(850px,calc(100vh-32px))] w-[min(750px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          {/* Chat header and real-time clock */}
          <header className="flex items-center gap-3 bg-[#172554] px-5 py-4 text-white">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600">
              <Users size={22} />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                President's Office
              </h2>
              <p className="text-xs text-blue-200">
                All staff and administrators
              </p>
              <p
                className="mt-1 text-[11px] text-blue-100"
                aria-live="off"
              >
                {displayDateTime(now)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              title="Close chat"
              className="rounded-lg p-2 transition hover:bg-white/10"
            >
              <X size={20} />
            </button>
          </header>

          {/* Message history */}
          <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950">
            {loading && messages.length === 0 && (
              <div className="flex justify-center py-8 text-slate-500">
                <LoaderCircle
                  className="animate-spin"
                  size={22}
                />
              </div>
            )}

            {!loading &&
              messages.length === 0 &&
              !error && (
                <div className="py-16 text-center">
                  <MessageCircle
                    className="mx-auto mb-3 text-slate-400"
                    size={38}
                  />
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    No messages yet
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Send the first message to your team.
                  </p>
                </div>
              )}

            {messages.map((message) => {
              const own = message.sender_id === userId
              const profile = profiles[message.sender_id]

              const senderName = own
                ? myName
                : profile?.name || 'Staff member'

              const avatarUrl = own
                ? myAvatar
                : profile?.avatarUrl || null
              const deletedByProfile = message.deleted_by ? profiles[message.deleted_by] : null
              const deletedByName = message.deleted_by === userId
                ? myName
                : deletedByProfile?.name || 'An administrator'

              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-3 ${
                    own ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!own && (
                    <ChatAvatar
                      name={senderName}
                      avatarUrl={avatarUrl}
                    />
                  )}

                  <div
                    className={`flex min-w-0 max-w-[78%] flex-col ${
                      own ? 'items-end' : 'items-start'
                    }`}
                  >
                    <p
                      className={`mb-1 px-1 text-xs font-semibold ${
                        own
                          ? 'text-right text-blue-700 dark:text-blue-300'
                          : 'text-left text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {own ? `${senderName} (You)` : senderName}
                    </p>

                    <div className="flex items-start gap-2">
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          message.deleted_at
                            ? 'border border-dashed border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                            : own
                              ? 'rounded-br-md bg-blue-600 text-white'
                              : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {message.deleted_at ? (
                          <p className="text-sm italic">{deletedByName} deleted a message</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                        )}

                        <p className={`mt-2 text-right text-[10px] ${own && !message.deleted_at ? 'text-blue-100' : 'text-slate-500'}`}>
                          {displayTime(message.created_at)}
                        </p>
                      </div>

                      {isAdmin && !message.deleted_at && (
                        <button
                          type="button"
                          onClick={() => setMessagePendingDelete(message)}
                          disabled={deletingId !== null}
                          aria-label={`Delete message from ${senderName}`}
                          title="Delete message"
                          className="mt-1 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          {deletingId === message.id ? (
                            <LoaderCircle size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {own && (
                    <ChatAvatar
                      name={senderName}
                      avatarUrl={avatarUrl}
                      own
                    />
                  )}
                </div>
              )
            })}

            <div ref={bottomRef} />
          </div>

          {/* Actual Supabase errors */}
          {error && (
            <div
              role="alert"
              className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Message composer */}
          <form
            onSubmit={sendMessage}
            className="flex items-end gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <ChatAvatar
              name={myName}
              avatarUrl={myAvatar}
              own
            />

            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleMessageKeyDown}
              rows={1}
              maxLength={4000}
              placeholder={`Message as ${myName}...`}
              aria-label="Message"
              className="max-h-32 min-h-12 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              title="Send message"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <LoaderCircle
                  size={20}
                  className="animate-spin"
                />
              ) : (
                <Send size={20} />
              )}
            </button>
          </form>

          {/* In-chat delete confirmation; avoids the browser alert dialog. */}
          {isAdmin && messagePendingDelete && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !deletingId) {
                  setMessagePendingDelete(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-chat-message-title"
                aria-describedby="delete-chat-message-description"
                className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                  <Trash2 size={21} />
                </div>
                <h3 id="delete-chat-message-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  Delete this message?
                </h3>
                <p id="delete-chat-message-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  The message text will be replaced with a notice showing who deleted it. This cannot be undone.
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setMessagePendingDelete(null)}
                    disabled={deletingId !== null}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMessage(messagePendingDelete)}
                    disabled={deletingId !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === messagePendingDelete.id && (
                      <LoaderCircle size={16} className="animate-spin" />
                    )}
                    Delete message
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
