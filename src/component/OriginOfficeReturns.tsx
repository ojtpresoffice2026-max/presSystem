
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type ReturnedWorkflow = {
  id: string
  receiving_record_id: string
  workflow_status: string
  returned_to_origin_at: string | null
  origin_office_received_at: string | null
  president_action_remarks: string | null
}

type ReceivingDocument = {
  id: string
  reference_number: string | null
  subject: string | null
  origin_office: string | null
}

type ReturnRow = {
  workflow: ReturnedWorkflow
  document: ReceivingDocument | null
}

export default function OriginOfficeReturns() {
  const [rows, setRows] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadReturns = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data: workflows, error: workflowError } = await supabase
        .from('document_workflow')
        .select(
          'id, receiving_record_id, workflow_status, returned_to_origin_at, origin_office_received_at, president_action_remarks',
        )
        .in('workflow_status', ['returned_to_origin', 'completed'])
        .order('returned_to_origin_at', { ascending: false })

      if (workflowError) throw workflowError

      const workflowRows = (workflows ?? []) as ReturnedWorkflow[]
      const documentIds = [
        ...new Set(workflowRows.map((row) => row.receiving_record_id)),
      ]

      let documents: ReceivingDocument[] = []

      if (documentIds.length > 0) {
        const { data, error: documentError } = await supabase
          .from('receiving_records')
          .select('id, reference_number, subject, origin_office')
          .in('id', documentIds)

        if (documentError) throw documentError

        documents = (data ?? []) as ReceivingDocument[]
      }

      const documentMap = new Map(
        documents.map((document) => [document.id, document]),
      )

      setRows(
        workflowRows.map((workflow) => ({
          workflow,
          document: documentMap.get(workflow.receiving_record_id) ?? null,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load returned documents.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReturns()
  }, [loadReturns])

  async function confirmReceipt(row: ReturnRow) {
    setProcessingId(row.workflow.id)
    setMessage('')
    setError('')

    try {
      const { error: rpcError } = await supabase.rpc(
        'origin_office_confirm_receipt',
        { p_workflow_id: row.workflow.id },
      )

      if (rpcError) throw rpcError

      setMessage(
        `Receipt confirmed for ${row.document?.reference_number ?? 'the document'}.`,
      )

      await loadReturns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm receipt.')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Returned Documents
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Confirm physical receipt of documents returned from the Board Room.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadReturns()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {message && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading returned documents...
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          No returned documents found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Returned at</th>
                <th className="px-4 py-3">Workflow status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {rows.map((row) => {
                const completed = row.workflow.workflow_status === 'completed'
                const processing = processingId === row.workflow.id

                return (
                  <tr key={row.workflow.id}>
                    <td className="px-4 py-3 font-semibold">
                      {row.document?.reference_number ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      {row.document?.subject ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      {row.workflow.returned_to_origin_at
                        ? new Date(row.workflow.returned_to_origin_at).toLocaleString(
                            'en-PH',
                            { dateStyle: 'medium', timeStyle: 'short' },
                          )
                        : '—'}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          completed
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {completed ? 'Receipt confirmed' : 'Awaiting receipt'}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {completed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <CheckCircle2 size={15} />
                          Completed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void confirmReceipt(row)}
                          disabled={processing}
                          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                        >
                          {processing ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          Confirm Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
