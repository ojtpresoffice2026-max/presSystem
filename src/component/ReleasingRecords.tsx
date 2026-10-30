import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  RefreshCw,
  Eye,
  X,
  ArrowUpDown,
  Send,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Bell,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type ReleasingRecord = {
  id: string
  reference_number: string
  subject: string | null
  recipient: string | null
  destination_office: string | null
  releasing_staff: string | null
  release_date: string | null
  release_time: string | null
  release_forwarded_at: string | null
  status: string | null
  remarks: string | null
  created_at: string | null
  release_instruction: string | null
  workflow_status: string | null
  urgency: string | null
  release_received_at: string | null
  release_received_by: string | null
  release_received_by_name: string | null
  next_action_office_to_forward: string | null
  next_action_release_to: string | null
  next_action_release_at: string | null
  next_action_system_status: string | null
  next_action_date_forwarded: string | null
  next_action_recorded_by: string | null
  next_action_recorded_by_name: string | null
}

type SortField =
  | 'reference_number'
  | 'subject'
  | 'recipient'
  | 'destination_office'
  | 'releasing_staff'
  | 'release_date'
  | 'status'
  | 'release_instruction'
  | 'next_action_recorded_by_name'
  | 'next_action_office_to_forward'
  | 'next_action_release_to'
  | 'next_action_release_at'
  | 'next_action_system_status'
  | 'next_action_date_forwarded'
  | 'urgency'

const tableColumns: { label: string; field: SortField }[] = [
  { label: 'Reference No.', field: 'reference_number' },
  { label: 'Subject', field: 'subject' },
  { label: 'Urgency', field: 'urgency' },
  { label: 'Destination Office', field: 'destination_office' },
  { label: 'Releasing Staff', field: 'releasing_staff' },
  { label: 'Release Details', field: 'next_action_office_to_forward' },
  { label: 'Action Done in Unified System / Date Forwarded', field: 'next_action_system_status' },
]

export default function ReleasingRecords() {
  const [records, setRecords] = useState<ReleasingRecord[]>([])
  const [search, setSearch] = useState('')
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('ALL')
  const [urgencyFilter, setUrgencyFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const [selected, setSelected] = useState<ReleasingRecord | null>(null)
  const [releasePanelRecord, setReleasePanelRecord] = useState<ReleasingRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [nextActionOffice, setNextActionOffice] = useState('')
  const [nextActionReleaseTo, setNextActionReleaseTo] = useState('')
  const [nextActionReleaseAt, setNextActionReleaseAt] = useState('')
  const [liveDateTime, setLiveDateTime] = useState(() => toDateTimeLocalValue(new Date().toISOString()))
  const [savingNextAction, setSavingNextAction] = useState(false)
  const [nextActionMode, setNextActionMode] = useState<'view' | 'edit'>('view')
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; edited_by_name: string; edited_at: string; change_type: string; previous_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null }>>([])
  const [viewerRole, setViewerRole] = useState<'admin' | 'staff' | null>(null)
  const [urgentNotificationsOpen, setUrgentNotificationsOpen] = useState(false)
  const [assignmentNotice, setAssignmentNotice] = useState<{ message: string; urgent: boolean } | null>(null)
  const knownAssignmentIds = useRef<Set<string> | null>(null)
  const knownUrgencyById = useRef<Map<string, boolean> | null>(null)
  const recordsLoadInProgress = useRef(false)
  const notificationAudioContext = useRef<AudioContext | null>(null)
  const openSoundPlayed = useRef(false)
  const urgentCountForAudio = useRef(0)

  // Try to start audio automatically when this page mounts. Browsers may keep
  // audio suspended until the user interacts with the page; the first normal
  // interaction resumes it and plays any pending urgent alert without a button.
  useEffect(() => {
    const resumeAudio = () => {
      const audioContext = notificationAudioContext.current
      if (!audioContext) return
      if (audioContext.state !== 'running') {
        void audioContext.resume().then(() => {
          if (audioContext.state === 'running' && urgentCountForAudio.current > 0 && !openSoundPlayed.current) {
            const played = playUrgentNotificationSound()
            if (played) openSoundPlayed.current = true
          }
        }).catch(() => {})
      } else if (urgentCountForAudio.current > 0 && !openSoundPlayed.current) {
        const played = playUrgentNotificationSound()
        if (played) openSoundPlayed.current = true
      }
    }

    try {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        notificationAudioContext.current = new AudioContextClass()
        if (notificationAudioContext.current.state === 'suspended') {
          void notificationAudioContext.current.resume().catch(() => {})
        }
      }
    } catch (error) {
      console.warn('Urgent notification sound is unavailable in this browser.', error)
    }

    window.addEventListener('pointerdown', resumeAudio)
    window.addEventListener('keydown', resumeAudio)
    return () => {
      window.removeEventListener('pointerdown', resumeAudio)
      window.removeEventListener('keydown', resumeAudio)
    }
  }, [])

  function playUrgentNotificationSound(): boolean {
    const audioContext = notificationAudioContext.current
    if (!audioContext || audioContext.state !== 'running') return false

    try {
      const startAt = audioContext.currentTime
      // Two short, clear tones; no external audio file is required.
      ;[0, 0.22].forEach((offset, index) => {
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(index === 0 ? 880 : 1046.5, startAt + offset)
        gain.gain.setValueAtTime(0.0001, startAt + offset)
        gain.gain.exponentialRampToValueAtTime(0.16, startAt + offset + 0.015)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.16)
        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start(startAt + offset)
        oscillator.stop(startAt + offset + 0.17)
      })
      return true
    } catch (error) {
      console.warn('Unable to play urgent notification sound.', error)
      return false
    }
  }

  const [sortField, setSortField] =
    useState<SortField>('release_date')

  const [sortDirection, setSortDirection] =
    useState<'desc' | 'asc'>('desc')

  async function loadRecords(options: { showLoading?: boolean } = {}) {
    // Realtime and polling can fire close together; allow only one request at a time.
    if (recordsLoadInProgress.current) return
    recordsLoadInProgress.current = true
    const showLoading = options.showLoading ?? true

    if (showLoading) {
      setLoading(true)
      setError('')
    }

    try {
      // Resolve the signed-in user's profile so each releasing staff member
      // sees only documents assigned to their own profile name.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) throw new Error('Your session has expired. Please sign in again.')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) throw profileError
      if (!profile) {
        throw new Error('Your user profile could not be found.')
      }

      const isAdmin = profile.role === 'admin'
      const isReleasingStaff = profile.role === 'staff'

      setViewerRole(isAdmin ? 'admin' : isReleasingStaff ? 'staff' : null)

      if (!isAdmin && !isReleasingStaff) {
        throw new Error(
          'This page is available only to administrators and staff.',
        )
      }

      if (isReleasingStaff && !profile.full_name) {
        throw new Error('Your staff profile does not have a full name.')
      }

      // ForwardingRecords stores assignments in document_workflow.
      // Administrators can view every assignment; releasing staff can only
      // view documents assigned to their own profile name.
      let assignmentsQuery = supabase
        .from('document_workflow')
        .select(
          'id, receiving_record_id, release_assigned_to, release_instruction, release_forwarded_at, release_forwarded_by, workflow_status, urgency, release_received_at, release_received_by, release_received_by_name, next_action_office_to_forward, next_action_release_to, next_action_release_at, next_action_system_status, next_action_date_forwarded, next_action_recorded_by, next_action_recorded_by_name',
        )
        .order('release_forwarded_at', { ascending: false })

      const { data: assignments, error: assignmentError } =
        await assignmentsQuery

      if (assignmentError) throw assignmentError

      // Match staff names case-insensitively. Supabase .eq() is case-sensitive,
      // which can hide older assignments when capitalization or spaces differ.
      const normalizeStaffName = (value: unknown) =>
        String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

      const accountAssignments = isReleasingStaff
        ? (assignments ?? []).filter(row =>
            normalizeStaffName(row.release_assigned_to) === normalizeStaffName(profile.full_name),
          )
        : (assignments ?? [])

      // A document returned to its originating office is no longer an active
      // releasing assignment. Exclude it from this page and from urgent alerts.
      const workflowRows = accountAssignments.filter(row => {
        const normalizedStatus = String(row.workflow_status ?? '')
          .trim()
          .toLowerCase()
          .replaceAll('-', '_')
          .replaceAll(' ', '_')

        return normalizedStatus !== 'returned_to_origin'
      })
      if (workflowRows.length === 0) {
        const previousIds = knownAssignmentIds.current
        if (previousIds && previousIds.size > 0) {
          knownAssignmentIds.current = new Set()
          knownUrgencyById.current = new Map()
        } else {
          knownAssignmentIds.current ??= new Set()
          knownUrgencyById.current ??= new Map()
        }
        setRecords([])
        return
      }

      const receivingIds = [...new Set(
        workflowRows.map(row => row.receiving_record_id).filter(Boolean),
      )] as string[]

      if (receivingIds.length === 0) {
        knownAssignmentIds.current ??= new Set()
        knownUrgencyById.current ??= new Map()
        setRecords([])
        return
      }

      const { data: documents, error: documentsError } = await supabase
        .from('receiving_records')
        .select(
          'id, reference_number, subject, content, sender, bearer, origin_office, date_received, created_at, urgency',
        )
        .in('id', receivingIds)

      if (documentsError) throw documentsError

      if (!documents || documents.length === 0) {
        throw new Error(
          'Assignments were found, but their document details could not be retrieved. Check the receiving_record_id values and the receiving_records access policies.',
        )
      }

      const missingDocumentIds = receivingIds.filter(
        id => !(documents ?? []).some(document => document.id === id),
      )

      if (missingDocumentIds.length > 0) {
        console.warn(
          'Some assigned documents could not be retrieved from receiving_records:',
          missingDocumentIds,
        )
      }

      const documentsById = new Map(
        (documents ?? []).map(document => [document.id, document]),
      )

      const mappedRecords: ReleasingRecord[] = workflowRows.map(workflow => {
        const document = documentsById.get(workflow.receiving_record_id)
        return {
          id: workflow.id,
          reference_number: document?.reference_number || '—',
          subject: document?.subject || document?.content || null,
          recipient: document?.bearer || document?.sender || null,
          destination_office: document?.origin_office || null,
          releasing_staff: workflow.release_assigned_to || profile.full_name,
          release_date: workflow.release_forwarded_at || null,
          release_time: workflow.release_forwarded_at || null,
          // Preserve the real forwarding timestamp for the urgent bell filter.
          release_forwarded_at: workflow.release_forwarded_at || null,
          status: workflow.workflow_status || 'assigned',
          remarks: workflow.release_instruction || null,
          created_at: document?.created_at || document?.date_received || null,
          release_instruction: workflow.release_instruction || null,
          workflow_status: workflow.workflow_status || null,
          urgency: (
            [workflow.urgency, document?.urgency]
              .some(value => ['urgent', 'high', 'critical', 'very urgent'].includes(
                String(value ?? '').trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
              ))
              ? 'urgent'
              : (workflow.urgency || document?.urgency || 'normal')
          ),
          release_received_at: workflow.release_received_at || null,
          release_received_by: workflow.release_received_by || null,
          release_received_by_name: workflow.release_received_by_name || null,
          next_action_office_to_forward: workflow.next_action_office_to_forward || null,
          next_action_release_to: workflow.next_action_release_to || null,
          next_action_release_at: workflow.next_action_release_at || null,
          next_action_system_status: workflow.next_action_system_status || null,
          next_action_date_forwarded: workflow.next_action_date_forwarded || null,
          next_action_recorded_by: workflow.next_action_recorded_by || null,
          next_action_recorded_by_name: workflow.next_action_recorded_by_name || null,
        }
      })

      // On every page mount, play once if active urgent documents already exist.
      // The first successful fetch is still the baseline for assignment-change alerts.
      const previousIds = knownAssignmentIds.current
      const previousUrgency = knownUrgencyById.current
      // A row in document_workflow with a releasing staff assignment is an
      // assigned releasing document. Do not require release_forwarded_at here:
      // older valid assignments may have a missing timestamp, which would make
      // the notification count disagree with the urgent rows shown in this table.
      const sentAssignments = mappedRecords.filter(record =>
        Boolean(record.releasing_staff?.trim()),
      )

      // Administrators see all sent assignments; staff see only assignments
      // sent to their own profile name.
      const notificationRecords = isAdmin
        ? sentAssignments
        : sentAssignments.filter(record =>
            normalizeStaffName(record.releasing_staff) === normalizeStaffName(profile.full_name),
          )
      const activeUrgentRecords = notificationRecords.filter(
        record =>
          normalizeUrgency(record.urgency) === 'urgent' &&
          !isReleaseCompleted(record),
      )
      if (previousIds === null && activeUrgentRecords.length > 0) {
        urgentCountForAudio.current = activeUrgentRecords.length
        if (playUrgentNotificationSound()) openSoundPlayed.current = true
      }
      const newlyAssigned = previousIds
        ? notificationRecords.filter(record => !previousIds.has(record.id) && !isReleaseCompleted(record))
        : []
      const newlyUrgent = previousUrgency
        ? notificationRecords.filter(record =>
            normalizeUrgency(record.urgency) === 'urgent' &&
            !isReleaseCompleted(record) &&
            previousUrgency.get(record.id) === false,
          )
        : []

      if (newlyAssigned.length > 0) {
        const urgentAssignments = newlyAssigned.filter(
          record => normalizeUrgency(record.urgency) === 'urgent' && !isReleaseCompleted(record),
        )
        const latest = urgentAssignments[0] || newlyAssigned[0]
        const assignedMessage = isAdmin
          ? `for ${latest.releasing_staff || 'the assigned releasing staff'}`
          : 'to you'
        if (urgentAssignments.length > 0) {
          playUrgentNotificationSound()
        }
        setAssignmentNotice({
          urgent: urgentAssignments.length > 0,
          message: urgentAssignments.length > 0
            ? `Urgent document ${latest.reference_number} was assigned ${assignedMessage}. Check the urgent notification bell.`
            : `Document ${latest.reference_number} was assigned ${assignedMessage}.`,
        })
      } else if (newlyUrgent.length > 0) {
        const latest = newlyUrgent[0]
        playUrgentNotificationSound()
        setAssignmentNotice({
          urgent: true,
          message: `Document ${latest.reference_number} is now marked urgent. Check the urgent notification bell.`,
        })
      }

      urgentCountForAudio.current = activeUrgentRecords.length
      knownAssignmentIds.current = new Set(notificationRecords.map(record => record.id))
      knownUrgencyById.current = new Map(
        notificationRecords.map(record => [
          record.id,
          normalizeUrgency(record.urgency) === 'urgent' && !isReleaseCompleted(record),
        ]),
      )
      setRecords(mappedRecords)
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : 'Unable to load releasing records.'
      if (showLoading) {
        setError(message)
        setRecords([])
      } else {
        // Keep current rows visible if a background refresh temporarily fails.
        console.warn('Background releasing-notification refresh failed:', message)
      }
    } finally {
      recordsLoadInProgress.current = false
      if (showLoading) setLoading(false)
    }
  }

  async function confirmReceipt(record: ReleasingRecord) {
    setActionError('')
    setActionSuccess('')

    if (viewerRole !== 'admin' && viewerRole !== 'staff') {
      setActionError('Your account is not authorized to confirm physical receipt.')
      return
    }

    if (record.release_received_at) {
      setActionError('Receipt has already been confirmed for this document.')
      return
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setActionError(authError.message)
      return
    }

    if (!user) {
      setActionError('Your session has expired. Please sign in again.')
      return
    }

    const { data: receiptProfile, error: receiptProfileError } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (receiptProfileError) {
      setActionError(receiptProfileError.message)
      return
    }

    const receiptAccountName = receiptProfile?.full_name?.trim()
    if (!receiptAccountName) {
      setActionError('Your account profile must have a full name before confirming receipt.')
      return
    }

    // Admins can confirm receipt for any assignment. Staff can confirm only
    // documents assigned to their own profile name.
    if (
      viewerRole === 'staff' &&
      record.releasing_staff?.trim().replace(/\\s+/g, ' ').toLocaleLowerCase() !== receiptAccountName.replace(/\\s+/g, ' ').toLocaleLowerCase()
    ) {
      setActionError('Only the assigned releasing staff member or an administrator can confirm receipt.')
      return
    }

    setConfirmingId(record.id)

    try {
      const now = new Date().toISOString()

      const { data: updatedRecord, error: updateError } = await supabase
        .from('document_workflow')
        .update({
          workflow_status: 'action_in_progress',
          release_received_at: now,
          release_received_by: user.id,
          release_received_by_name: receiptAccountName,
        })
        .eq('id', record.id)
        .eq('release_assigned_to', record.releasing_staff)
        .is('release_received_at', null)
        .select('id, release_received_at, release_received_by, release_received_by_name')
        .maybeSingle()

      if (updateError) throw updateError

      if (!updatedRecord) {
        throw new Error(
          'Receipt was not confirmed. The document may already be confirmed, may not be assigned to you, or your database permissions may not allow this action. Refresh and try again.',
        )
      }

      await loadRecords()

      setSelected(current =>
        current?.id === record.id
          ? {
              ...current,
              release_received_at: updatedRecord.release_received_at,
              release_received_by: updatedRecord.release_received_by,
              release_received_by_name: updatedRecord.release_received_by_name,
              workflow_status: 'action_in_progress',
              status: 'action_in_progress',
            }
          : current,
      )

      setActionSuccess(
        `Physical receipt confirmed for ${record.reference_number}. You can now complete the Next Action.`,
      )
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Unable to confirm physical receipt. Check the database columns and UPDATE policy.',
      )
    } finally {
      setConfirmingId(null)
    }
  }

  async function loadNextActionLogs(recordId: string) {
    const { data, error: logsError } = await supabase
      .from('document_workflow_next_action_logs')
      .select('id, edited_by_name, edited_at, change_type, previous_values, new_values')
      .eq('document_workflow_id', recordId)
      .order('edited_at', { ascending: false })

    if (logsError) {
      setActionError(`Unable to load edit history: ${logsError.message}`)
      setAuditLogs([])
      return
    }
    setAuditLogs(data ?? [])
  }

  useEffect(() => {
    const updateClock = () => setLiveDateTime(toDateTimeLocalValue(new Date().toISOString()))
    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function saveNextAction(record: ReleasingRecord) {
    setActionError('')
    setActionSuccess('')

    if (!record.release_received_at) {
      setActionError('Confirm receipt before saving the Next Action.')
      return
    }

    const office = nextActionOffice.trim()
    const releaseTo = nextActionReleaseTo.trim()

    if (!office || !releaseTo) {
      setActionError('Please enter Office to Forward and Release To.')
      return
    }

    // Capture the actual current time when the user confirms the release.
    // The timestamp is system-generated and cannot be manually edited.
    const releaseDate = new Date()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setActionError(authError.message)
      return
    }
    if (!user) {
      setActionError('Your session has expired. Please sign in again.')
      return
    }

    setSavingNextAction(true)

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) throw profileError

      const editorName = profile?.full_name?.trim()
      if (!editorName) {
        throw new Error('Your profile must have a full name before saving this action.')
      }

      const now = new Date().toISOString()
      const releaseAt = releaseDate.toISOString()
      setNextActionReleaseAt(toDateTimeLocalValue(releaseAt))
      const isEdit = Boolean(record.next_action_release_at)
      const previousValues = {
        office_to_forward: record.next_action_office_to_forward,
        release_to: record.next_action_release_to,
        release_at: record.next_action_release_at,
        system_status: record.next_action_system_status,
        date_forwarded: record.next_action_date_forwarded,
      }
      const newValues = {
        office_to_forward: office,
        release_to: releaseTo,
        release_at: releaseAt,
        system_status: 'Forwarded',
        date_forwarded: record.next_action_date_forwarded || now,
      }

      // Editing a completed document must not reactivate its workflow.
      const workflowStatus = isEdit
        ? (record.workflow_status || 'action_completed')
        : 'action_completed'

      const { data: updatedRows, error: updateError } = await supabase
        .from('document_workflow')
        .update({
          next_action_office_to_forward: office,
          next_action_release_to: releaseTo,
          next_action_release_at: releaseAt,
          next_action_system_status: 'Forwarded',
          next_action_date_forwarded: newValues.date_forwarded,
          next_action_recorded_by: user.id,
          next_action_recorded_by_name: editorName,
          workflow_status: workflowStatus,
          updated_at: now,
        })
        .eq('id', record.id)
        .select('id')

      if (updateError) throw updateError
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error(
          'Release was not saved. Check your Supabase UPDATE permissions and row-level security policies.',
        )
      }

      const { error: logError } = await supabase
        .from('document_workflow_next_action_logs')
        .insert({
          document_workflow_id: record.id,
          edited_by: user.id,
          edited_by_name: editorName,
          edited_at: now,
          change_type: isEdit ? 'EDIT' : 'CREATE',
          previous_values: previousValues,
          new_values: newValues,
        })

      if (logError) {
        throw new Error(
          `The release was saved, but its audit log could not be saved: ${logError.message}.`,
        )
      }

      const updatedRecord: ReleasingRecord = {
        ...record,
        next_action_office_to_forward: office,
        next_action_release_to: releaseTo,
        next_action_release_at: releaseAt,
        next_action_system_status: 'Forwarded',
        next_action_date_forwarded: newValues.date_forwarded,
        next_action_recorded_by: user.id,
        next_action_recorded_by_name: editorName,
        workflow_status: workflowStatus,
        status: workflowStatus,
      }

      setRecords(current =>
        current.map(item => item.id === record.id ? updatedRecord : item),
      )
      setReleasePanelRecord(updatedRecord)
      setNextActionMode('view')
      await loadNextActionLogs(record.id)
      setActionSuccess(
        isEdit
          ? `Release details for ${record.reference_number} were updated successfully.`
          : `Document ${record.reference_number} was marked Forwarded successfully.`,
      )
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to save Next Action.',
      )
    } finally {
      setSavingNextAction(false)
    }
  }

  useEffect(() => {
    let mounted = true

    // Initial load establishes a baseline and does not alert for old assignments.
    void loadRecords()

    const refreshInBackground = () => {
      if (mounted) void loadRecords({ showLoading: false })
    }

    const channel = supabase
      .channel('releasing-urgent-workflow-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_workflow' },
        refreshInBackground,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receiving_records' },
        refreshInBackground,
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.info('Releasing notifications: Realtime connected.')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Releasing notifications: Realtime connection issue.', status, err)
        }
      })

    // Fallback for missed/unavailable Realtime events; updates while this page is open.
    const pollingId = window.setInterval(refreshInBackground, 15_000)

    return () => {
      mounted = false
      window.clearInterval(pollingId)
      void supabase.removeChannel(channel)
    }
  }, [])

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(current =>
        current === 'asc' ? 'desc' : 'asc'
      )
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function getSortValue(
    record: ReleasingRecord,
    field: SortField
  ): string {
    return record[field] || ''
  }

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()

    const filtered = records.filter(record => {
      const completed = isReleaseCompleted(record)
      const recordUrgency = normalizeUrgency(record.urgency)

      if (releaseStatusFilter === 'ACTIVE' && completed) return false
      if (releaseStatusFilter === 'AWAITING_RECEIPT' && (record.release_received_at || completed)) return false
      if (releaseStatusFilter === 'READY_TO_RELEASE' && (!record.release_received_at || completed)) return false
      if (releaseStatusFilter === 'RELEASED' && !completed) return false
      if (urgencyFilter === 'URGENT' && recordUrgency !== 'urgent') return false
      if (urgencyFilter === 'NOT_URGENT' && recordUrgency !== 'not urgent') return false

      if (!term) return true

      return [
        record.reference_number,
        record.subject,
        record.recipient,
        record.destination_office,
        record.releasing_staff,
        record.release_date,
        record.release_time,
        record.status,
        record.remarks,
        record.release_instruction,
        record.next_action_recorded_by_name,
        record.next_action_office_to_forward,
        record.next_action_release_to,
        record.next_action_system_status,
        record.urgency,
      ].some(value =>
        String(value ?? '').toLowerCase().includes(term)
      )
    })

    return [...filtered].sort((a, b) => {
      const first = getSortValue(a, sortField)
      const second = getSortValue(b, sortField)

      const comparison = first.localeCompare(
        second,
        undefined,
        { numeric: true, sensitivity: 'base' }
      )

      return sortDirection === 'asc'
        ? comparison
        : -comparison
    })
  }, [records, search, releaseStatusFilter, urgencyFilter, sortField, sortDirection])

  // Show 10 records per page. Return to page 1 when filters or search change.
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const pageStartIndex = (currentPage - 1) * pageSize
  const paginatedRecords = filteredRecords.slice(pageStartIndex, pageStartIndex + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, releaseStatusFilter, urgencyFilter])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  function formatDate(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })
  }

  function formatDateTime(value: string | null) {
    if (!value) return '—'

    const date = new Date(value)

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-PH', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
  }

  function formatReleaseTime(value: string | null) {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleTimeString('en-PH', {
          timeZone: 'Asia/Manila',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
  }

  function toDateTimeLocalValue(value: string | null) {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const pad = (number: number) => String(number).padStart(2, '0')

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function displayStatus(status: string | null) {
    return (status || 'unknown').replaceAll('_', ' ')
  }

  // A document remains in the urgent bell only while its release work is still pending.
  // Confirming receipt does NOT complete release. Saving the Complete Release / Next Action
  // sets workflow_status to action_completed and next_action_system_status to Forwarded,
  // so those records must no longer count as active urgent notifications.
  function isReleaseCompleted(record: ReleasingRecord) {
    const normalizeStatus = (value: string | null) =>
      (value || '')
        .trim()
        .toLowerCase()
        .replaceAll('-', '_')
        .replaceAll(' ', '_')

    const workflowStatus = normalizeStatus(record.workflow_status)
    const nextActionStatus = normalizeStatus(record.next_action_system_status)

    // A returned document is no longer an active releasing assignment.
    if (workflowStatus === 'returned_to_origin') return true

    // The Complete Release action saves action_completed and marks the next action Forwarded.
    const completedStatuses = [
      'action_completed',
      'released',
      'paper_released',
      'release_completed',
    ]

    return completedStatuses.includes(workflowStatus) ||
      completedStatuses.includes(nextActionStatus) ||
      nextActionStatus === 'forwarded'
  }

  function normalizeUrgency(value: string | null): 'urgent' | 'not urgent' {
    const normalized = (value || '').trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
    return ['urgent', 'high', 'critical', 'very urgent'].includes(normalized)
      ? 'urgent'
      : 'not urgent'
  }

  function urgencyBadge(value: string | null) {
    const urgency = normalizeUrgency(value)
    return urgency === 'urgent'
      ? { label: 'Urgent', className: 'border-red-200 dark:border-red-800 bg-red-50 dark:hover:bg-red-950/30 text-red-700 dark:text-red-300' }
      : { label: 'Not Urgent', className: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' }
  }

  // Bell rule: use the same assignment, urgency, and completion rules as the
  // urgent records visible in this table. A missing legacy forwarding timestamp
  // must not hide an assigned urgent document from the bell.
  // Receipt confirmation alone does not complete release; completing the Next
  // Action or returning the document removes it from the active urgent count.
  const urgentRecords = records.filter(
    record =>
      Boolean(record.releasing_staff?.trim()) &&
      normalizeUrgency(record.urgency) === 'urgent' &&
      !isReleaseCompleted(record) &&
      (viewerRole === 'admin' || viewerRole === 'staff'),
  )
  const urgentCount = urgentRecords.length

  // Attempt an alert once after the initial records load if urgent items exist.
  // If autoplay is blocked, the first ordinary page interaction resumes audio
  // and plays the pending alert; background refreshes do not repeat it.
  useEffect(() => {
    urgentCountForAudio.current = urgentCount
    if (loading || urgentCount === 0 || openSoundPlayed.current) return
    if (playUrgentNotificationSound()) openSoundPlayed.current = true
  }, [loading, urgentCount])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
      {/* Page heading */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
            presSystem Management Portal
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Releasing Documents
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {viewerRole === 'admin'
              ? 'Review release assignments, confirm receipt, and track completed document workflows.'
              : 'Confirm document receipt, manage release details, and track your assigned documents.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">

          <div className="relative">
            <button
              type="button"
              onClick={() => setUrgentNotificationsOpen(open => !open)}
              aria-label={`Urgent notifications: ${urgentCount}`}
              aria-expanded={urgentNotificationsOpen}
              title="Urgent notifications"
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-white dark:bg-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-100 ${urgentCount > 0 ? 'border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
            >
              <Bell size={18} />
              {urgentCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {urgentCount > 99 ? '99+' : urgentCount}
                </span>
              )}
            </button>
            {urgentNotificationsOpen && (
              <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Urgent Documents</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{viewerRole === 'admin' ? 'Urgent alerts go to the assigned staff account' : 'Urgent papers assigned to your account only'}</p>
                  </div>
                  <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700 dark:text-red-300">{urgentCount}</span>
                </div>
                {urgentRecords.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">No active urgent documents.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {urgentRecords.map(record => (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => {
                          setUrgencyFilter('URGENT')
                          setSearch(record.reference_number)
                          setSelected(record)
                          setUrgentNotificationsOpen(false)
                        }}
                        className="flex w-full items-start gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3 text-left transition last:border-b-0 hover:bg-red-50 dark:bg-red-950/30"
                      >
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{record.reference_number}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{record.subject || 'No subject'}</span>
                          <span className="mt-1 inline-flex rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            {(record.workflow_status || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_') === 'returned_to_origin'
                              ? 'Urgent · Returned to origin'
                              : record.release_received_at
                                ? 'Urgent · Awaiting release completion'
                                : 'Urgent · Awaiting receipt confirmation'}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-100 dark:border-slate-700 p-3">
                  <button
                    type="button"
                    onClick={() => { setUrgencyFilter('URGENT'); setSearch(''); setUrgentNotificationsOpen(false) }}
                    className="w-full rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-800"
                  >
                    View Active Urgent Documents
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-colors hover:border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:bg-blue-950/40 hover:text-blue-700 dark:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {assignmentNotice && (
        <div
          role="status"
          className={`flex shrink-0 items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            assignmentNotice.urgent
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-800'
              : 'border-blue-200 dark:border-blue-800 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
          }`}
        >
          <div className="flex items-start gap-2">
            {assignmentNotice.urgent && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>{assignmentNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setAssignmentNotice(null)}
            className="shrink-0 text-xs font-semibold underline"
            aria-label="Dismiss assignment notification"
          >
            Dismiss
          </button>
        </div>
      )}


      {/* Main table panel */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        {/* Table title and controls */}
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              <Send size={20} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {viewerRole === 'admin' ? 'All Releasing Assignments' : 'Documents Assigned to You'}
              </h3>

              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {loading
                  ? 'Loading records...'
                  : `${filteredRecords.length} of ${records.length} records`}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {/* Search and release filters */}
            <div className="relative w-full sm:w-56">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search records..."
                aria-label="Search releasing records"
                className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-xs text-slate-700 dark:text-slate-200 outline-none transition placeholder:text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <select
              value={releaseStatusFilter}
              onChange={event => setReleaseStatusFilter(event.target.value)}
              aria-label="Filter by release status"
              className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-44"
            >
              <option value="ACTIVE">Active Assignments</option>
              <option value="ALL">All Assignments (Active + Completed)</option>
              <option value="AWAITING_RECEIPT">Awaiting Receipt</option>
              <option value="READY_TO_RELEASE">Ready to Release</option>
              <option value="RELEASED">Released / Forwarded</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={event => setUrgencyFilter(event.target.value)}
              aria-label="Filter by urgency"
              className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-36"
            >
              <option value="ALL">All Urgency</option>
              <option value="URGENT">Urgent</option>
              <option value="NOT_URGENT">Not Urgent</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch('')
                setReleaseStatusFilter('ALL')
                setUrgencyFilter('ALL')
              }}
              className="h-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Clear Filters
            </button>

          </div>
        </div>

        {actionError && (
          <div role="alert" className="mx-4 mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div role="status" className="mx-4 mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-700">
            {actionSuccess}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="m-4 flex flex-col gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>Failed to load releasing records: {error}</span>

            <button
              type="button"
              onClick={() => void loadRecords()}
              className="shrink-0 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Data table */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1250px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <th className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  No.
                </th>
                {tableColumns.map(column => (
                  <th
                    key={column.field}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.field)}
                      className="inline-flex items-center gap-1.5 transition hover:text-blue-700 dark:text-blue-300"
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}

                      {sortField === column.field ? (
                        <span className="font-bold text-blue-700 dark:text-blue-300">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      ) : (
                        <ArrowUpDown
                          size={11}
                          className="text-slate-400 dark:text-slate-500"
                        />
                      )}
                    </button>
                  </th>
                ))}

                <th className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Receipt / Details
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    <RefreshCw
                      size={18}
                      className="mx-auto mb-3 animate-spin text-red-600"
                    />
                    Loading outgoing documents...
                  </td>
                </tr>
              ) : error && records.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    Records could not be loaded. Check the error above.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-14 text-center"
                  >
                    <FileText
                      size={26}
                      className="mx-auto mb-2 text-slate-300"
                    />

                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {search
                        ? 'No matching records'
                        : 'No outgoing documents yet'}
                    </p>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {search
                        ? 'Try another search term.'
                        : 'Outgoing documents will appear here when recorded.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record, index) => (
                  <tr
                    key={record.id}
                    className="transition-colors duration-150 hover:bg-blue-50 dark:bg-blue-950/40/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {filteredRecords.length - (pageStartIndex + index)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {record.reference_number || '—'}
                    </td>

                    <td className="w-[240px] min-w-[180px] max-w-[240px] whitespace-normal break-words px-4 py-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]">
                      <span title={record.subject || ''} className="block whitespace-normal break-words [overflow-wrap:anywhere]">
                        {record.subject || '—'}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      {(() => {
                        const badge = urgencyBadge(record.urgency)
                        return (
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        )
                      })()}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {record.destination_office || '—'}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{record.releasing_staff || '—'}</td>

                    <td className="px-3 py-3">
                      <div className="grid min-w-[220px] grid-cols-2 gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Office to Forward</span>
                          <span className="mt-0.5 block break-words text-xs font-medium text-slate-800 dark:text-slate-100">{record.next_action_office_to_forward || '—'}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Release To</span>
                          <span className="mt-0.5 block break-words text-xs font-medium text-slate-800 dark:text-slate-100">{record.next_action_release_to || '—'}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Date Release</span>
                          <span className="mt-0.5 block text-xs text-slate-700 dark:text-slate-200">{record.next_action_release_at ? formatDate(record.next_action_release_at) : '—'}</span>
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Time Release</span>
                          <span className="mt-0.5 block text-xs text-slate-700 dark:text-slate-200">{record.next_action_release_at ? formatReleaseTime(record.next_action_release_at) : '—'}</span>
                        </div>
                        <div className="col-span-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                          <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Released By</span>
                          <span className="mt-0.5 block break-words text-xs font-medium text-slate-800 dark:text-slate-100">{record.next_action_recorded_by_name || '—'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="min-w-[210px] px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">{isReleaseCompleted(record) ? 'Forwarded' : (record.next_action_system_status || 'Not Forwarded')}</span>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-2">
                      {record.release_received_at ? (
                        <div className="flex flex-col gap-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                          <span>Received: {formatDateTime(record.release_received_at)}</span>
                          <span className="font-semibold">Confirmed by: {record.release_received_by_name || '—'}</span>
                        </div>
                      ) : (viewerRole === 'admin' || (viewerRole === 'staff' && record.releasing_staff)) ? (
                        <button
                          type="button"
                          onClick={() => void confirmReceipt(record)}
                          disabled={confirmingId === record.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={13} />
                          {confirmingId === record.id ? 'Confirming…' : 'Confirm Receipt'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300">Awaiting receipt</span>
                      )}
                      {record.release_received_at && (
                        <button
                          type="button"
                          onClick={() => {
                            setReleasePanelRecord(record)
                            setNextActionMode(record.next_action_release_at ? 'view' : 'edit')
                            setActionError('')
                            setActionSuccess('')
                            setNextActionOffice(record.next_action_office_to_forward || '')
                            setNextActionReleaseTo(record.next_action_release_to || '')
                            setNextActionReleaseAt(record.next_action_release_at ? toDateTimeLocalValue(record.next_action_release_at) : toDateTimeLocalValue(new Date().toISOString()))
                            void loadNextActionLogs(record.id)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-800"
                        >
                          <Send size={13} /> {isReleaseCompleted(record) || record.next_action_release_at ? 'Action' : 'Complete Release'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelected(record)}
                        aria-label={`View ${record.reference_number}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
                      >
                        <Eye size={13} /> View
                      </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer and pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Showing {filteredRecords.length === 0 ? 0 : pageStartIndex + 1}–{Math.min(pageStartIndex + pageSize, filteredRecords.length)} of {filteredRecords.length} record(s)
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-[11px] text-slate-400 dark:text-slate-500">
              Select a column heading to sort the records.
            </p>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={currentPage === 1 || filteredRecords.length === 0}
              className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages || filteredRecords.length === 0}
              className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* Details modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="releasing-detail-title"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-5">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Outgoing Document
                </p>

                <h3
                  id="releasing-detail-title"
                  className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  {selected.reference_number}
                </h3>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Complete record information
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['Reference Number', selected.reference_number],
                  ['Subject', selected.subject],
                  ['Urgency', urgencyBadge(selected.urgency).label],
                  ['Destination Office', selected.destination_office],
                  ['Releasing Staff', selected.releasing_staff],
                  ['Release Date', formatDate(selected.release_date)],
                  ['Release Time', selected.release_time],
                  ['Status', displayStatus(selected.status)],
                  ['Remarks', selected.remarks],
                  ['Released By', selected.next_action_recorded_by_name || 'Not released yet'],
                  ['Release Recorded At', formatDateTime(selected.next_action_release_at)],
                  ['Created At', formatDateTime(selected.created_at)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3.5"
                  >
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {label}
                    </dt>

                    <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Physical Receipt Confirmation
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:!text-slate-300">
                  Confirm that you have physically received this document from the originating office before proceeding with the next action.
                </p>

                {selected.release_received_at ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={16} />
                      Receipt Confirmed
                    </p>
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      Confirmed on: {formatDateTime(selected.release_received_at)}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      Confirmed by: {selected.release_received_by_name || 'Account name unavailable'}
                    </p>
                  </div>
                ) : (viewerRole === 'admin' || (viewerRole === 'staff' && selected.releasing_staff)) ? (
                  <button
                    type="button"
                    onClick={() => void confirmReceipt(selected)}
                    disabled={confirmingId === selected.id}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    {confirmingId === selected.id ? 'Confirming Receipt...' : 'Confirm Receipt'}
                  </button>
                ) : (
                  <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                    Receipt is awaiting confirmation by the assigned releasing staff member.
                  </p>
                )}

              </section>
            </div>

            <div className="flex justify-end border-t border-slate-200 dark:border-slate-700 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Separate Release Panel: intentionally independent from View details. */}
      {releasePanelRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]" onClick={() => setReleasePanelRecord(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="release-panel-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-5">
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Document Workflow</p>
                <h3 id="release-panel-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">Release Panel · {releasePanelRecord.reference_number}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Record the next destination and release status. Physical receipt must be confirmed first.</p>
              </div>
              <button type="button" onClick={() => setReleasePanelRecord(null)} aria-label="Close release panel" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"><X size={18} /></button>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Subject</p><p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{releasePanelRecord.subject || '—'}</p></div>
                <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Physical Receipt</p><p className="mt-1 text-sm font-semibold">{releasePanelRecord.release_received_at ? `Confirmed · ${formatDateTime(releasePanelRecord.release_received_at)}` : 'Awaiting confirmation'}</p></div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Release Details</h4>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Office to Forward *<input value={nextActionOffice} onChange={event => setNextActionOffice(event.target.value)} disabled={!releasePanelRecord.release_received_at || (nextActionMode === 'view' && Boolean(releasePanelRecord.next_action_release_at))} placeholder="Enter destination office" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900" /></label>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Release To *<input value={nextActionReleaseTo} onChange={event => setNextActionReleaseTo(event.target.value)} disabled={!releasePanelRecord.release_received_at || (nextActionMode === 'view' && Boolean(releasePanelRecord.next_action_release_at))} placeholder="Enter receiving person" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-blue-900" /></label>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Forward At (Automatic Date and Time)
                    <input
                      type="text"
                      value={nextActionMode === 'view' && releasePanelRecord.next_action_release_at
                        ? formatDateTime(releasePanelRecord.next_action_release_at)
                        : new Date(`${liveDateTime}:00`).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' })}
                      readOnly
                      aria-readonly="true"
                      className="mt-1.5 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-normal text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <span className="mt-1 block text-[10px] font-normal text-slate-500">Automatically updated from the system clock. The exact timestamp is saved when you click Release Document.</span>
                  </label>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Action Done in Unified System
                    <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Forwarded</p>
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Date Forwarded
                    <p className="mt-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{releasePanelRecord.next_action_date_forwarded ? formatDateTime(releasePanelRecord.next_action_date_forwarded) : 'Recorded automatically when saved'}</p>
                  </div>
                </div>
                {releasePanelRecord.next_action_recorded_by && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Released by: {releasePanelRecord.next_action_recorded_by_name || 'Name unavailable'}</p>}
                {!releasePanelRecord.release_received_at && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Confirm physical receipt before releasing this document.</p>}
                {actionError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:!border-red-800 dark:!bg-red-950/30 dark:!text-red-300">{actionError}</p>}
                {actionSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:!border-emerald-800 dark:!bg-emerald-950/30 dark:!text-emerald-300">{actionSuccess}</p>}
                {auditLogs.length > 0 && <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4"><h5 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">Edit History / Audit Log</h5><div className="mt-3 space-y-2">{auditLogs.map(log => <div key={log.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-800 dark:text-slate-200">{log.edited_by_name} · {log.change_type === 'CREATE' ? 'Created Next Action' : 'Edited Next Action'}</span><span className="text-slate-500 dark:text-slate-400">{formatDateTime(log.edited_at)}</span></div>{log.previous_values && log.change_type === 'EDIT' && <p className="mt-2 text-slate-600 dark:text-slate-300">Previous: {String(log.previous_values.office_to_forward || '—')} → {String(log.previous_values.release_to || '—')} ({String(log.previous_values.system_status || '—')}; Forward At: {String(log.previous_values.release_at || '—')})</p>}{log.new_values && <p className="mt-1 text-slate-600 dark:text-slate-300">Saved: {String(log.new_values.office_to_forward || '—')} → {String(log.new_values.release_to || '—')} ({String(log.new_values.system_status || '—')}; Forward At: {String(log.new_values.release_at || '—')})</p>}</div>)}</div></div>}
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  {releasePanelRecord.next_action_release_at && nextActionMode === 'view' ? <button type="button" onClick={() => { setNextActionOffice(releasePanelRecord.next_action_office_to_forward || ''); setNextActionReleaseTo(releasePanelRecord.next_action_release_to || ''); setNextActionReleaseAt(toDateTimeLocalValue(new Date().toISOString())); setActionError(''); setNextActionMode('edit') }} disabled={!releasePanelRecord.release_received_at} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">Edit Release</button> : <button type="button" onClick={() => void saveNextAction(releasePanelRecord)} disabled={savingNextAction || !releasePanelRecord.release_received_at} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{savingNextAction ? 'Saving…' : releasePanelRecord.next_action_release_at ? 'Save Release Changes' : 'Release Document'}</button>}
                  <button type="button" onClick={() => setReleasePanelRecord(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Close Panel</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
