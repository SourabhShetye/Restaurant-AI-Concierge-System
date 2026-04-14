import { useState, useEffect } from 'react'
import { CheckCircle, X, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { bookingApi } from '@/services/api'
import type { Booking } from '@/types'
import { format, parseISO } from 'date-fns'

export default function BookingsManager() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [purging, setPurging] = useState<string | null>(null)
  const [showPurgeAll, setShowPurgeAll] = useState(false)

  const fetch = async () => {
    try {
      const res = await bookingApi.getStaffBookings()
      setBookings(res.data)
    } catch { toast.error('Failed to load bookings') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  const confirm = async (id: string) => {
    try { await bookingApi.confirmBooking(id); toast.success('Booking confirmed'); fetch() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  const cancel = async (id: string) => {
    try { await bookingApi.staffCancelBooking(id); toast.success('Booking cancelled'); fetch() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  const purge = async (id: string) => {
    setPurging(id)
    try {
      await bookingApi.purgeBooking(id)
      toast.success('Booking removed')
      setBookings(prev => prev.filter(b => b.id !== id))
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to purge')
    } finally {
      setPurging(null)
    }
  }

  const purgeAll = async () => {
    const cancelled = bookings.filter(b => b.status === 'cancelled')
    let count = 0
    for (const b of cancelled) {
      try {
        await bookingApi.purgeBooking(b.id)
        count++
      } catch {}
    }
    toast.success(`Removed ${count} cancelled booking${count !== 1 ? 's' : ''}`)
    setBookings(prev => prev.filter(b => b.status !== 'cancelled'))
    setShowPurgeAll(false)
  }

  // Split into sections
  const now = new Date()
  const todayStr = now.toDateString()

  const todayBookings = bookings.filter(b =>
    new Date(b.booking_time).toDateString() === todayStr &&
    b.status !== 'cancelled'
  )
  const upcomingBookings = bookings.filter(b =>
    new Date(b.booking_time) > now &&
    new Date(b.booking_time).toDateString() !== todayStr &&
    b.status !== 'cancelled'
  )
  const pastBookings = bookings.filter(b =>
    new Date(b.booking_time) < now &&
    new Date(b.booking_time).toDateString() !== todayStr &&
    b.status !== 'cancelled'
  )
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled')

  if (loading) return <div className="text-center py-20 text-gray-400">Loading bookings...</div>

  const BookingCard = ({ b, showCancelBtn = true }: { b: Booking; showCancelBtn?: boolean }) => (
    <div key={b.id} className="card flex justify-between items-center">
      <div>
        <p className="font-semibold">{b.customer_name}</p>
        <p className="text-sm text-gray-500">
          {format(parseISO(b.booking_time), 'EEE MMM d · h:mm a')} · {b.party_size} guest{b.party_size !== 1 ? 's' : ''}
        </p>
        {b.special_requests && (
          <p className="text-xs text-gray-400 mt-0.5">📝 {b.special_requests}</p>
        )}
        {b.assigned_table_number && (
          <p className="text-xs text-primary-600 mt-0.5">🪑 Table {b.assigned_table_number}</p>
        )}
        <span className={`badge mt-1 text-xs ${
          b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {b.status}
        </span>
      </div>
      <div className="flex gap-1 items-center">
        {b.status !== 'confirmed' && showCancelBtn && (
          <button onClick={() => confirm(b.id)}
            className="text-green-500 hover:text-green-700 p-2" title="Confirm booking">
            <CheckCircle size={20} />
          </button>
        )}
        {b.status !== 'cancelled' && showCancelBtn && (
          <button onClick={() => cancel(b.id)}
            className="text-red-400 hover:text-red-600 p-2" title="Cancel booking">
            <X size={20} />
          </button>
        )}
        {b.status === 'cancelled' && (
          <button
            onClick={() => purge(b.id)}
            disabled={purging === b.id}
            className="text-gray-400 hover:text-red-500 p-2 transition-colors"
            title="Permanently delete this record"
          >
            {purging === b.id
              ? <span className="text-xs text-gray-400">...</span>
              : <Trash2 size={16} />
            }
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Bookings Manager</h2>
        <button onClick={fetch} className="text-gray-400 hover:text-gray-600">
          <RefreshCw size={18} />
        </button>
      </div>

      {bookings.length === 0 && (
        <div className="text-center py-16 text-gray-300">
          <p className="text-5xl mb-3">📅</p>
          <p>No bookings yet.</p>
        </div>
      )}

      {/* Today */}
      {todayBookings.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-600 mb-3">
            Today · {todayBookings.length} booking{todayBookings.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-3">
            {todayBookings.map(b => <BookingCard key={b.id} b={b} />)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingBookings.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-600 mb-3">
            Upcoming · {upcomingBookings.length} booking{upcomingBookings.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-3">
            {upcomingBookings.map(b => <BookingCard key={b.id} b={b} />)}
          </div>
        </div>
      )}

      {/* Past (non-cancelled) */}
      {pastBookings.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-600 mb-3">
            Past · {pastBookings.length} booking{pastBookings.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-3">
            {pastBookings.map(b => <BookingCard key={b.id} b={b} showCancelBtn={false} />)}
          </div>
        </div>
      )}

      {/* Cancelled — with purge controls */}
      {cancelledBookings.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-500">
              Cancelled · {cancelledBookings.length} record{cancelledBookings.length !== 1 ? 's' : ''}
            </h3>
            <button
              onClick={() => setShowPurgeAll(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 px-3 py-1.5 border border-red-200 rounded-xl hover:bg-red-50 transition-all"
            >
              <Trash2 size={12} /> Purge All
            </button>
          </div>

          {/* Purge all confirmation */}
          {showPurgeAll && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">
                  Permanently delete all {cancelledBookings.length} cancelled bookings?
                </p>
                <p className="text-xs text-red-500 mt-0.5">This cannot be undone.</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={purgeAll}
                    className="px-4 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600">
                    Yes, delete all
                  </button>
                  <button onClick={() => setShowPurgeAll(false)}
                    className="px-4 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-lg border border-gray-200 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 opacity-70">
            {cancelledBookings.map(b => <BookingCard key={b.id} b={b} showCancelBtn={false} />)}
          </div>
        </div>
      )}
    </div>
  )
}