'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  QrCode, LogOut, RefreshCw, FileSpreadsheet, 
  Edit, Save, X, Calendar, UserX, CheckCircle, 
  AlertCircle, Trash2, PlusCircle
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

// Tipe Data
type Attendance = {
  id: string
  user_email: string
  user_name: string | null
  date: string
  check_in: string
  check_out: string | null
  duration: string | null
  work_category: string | null
  task_list: string | null
  notes: string | null
  weekend_reason: string | null
}

type StaffStatus = {
    email: string
    name: string
    status: 'HADIR' | 'TIDAK HADIR'
    record?: Attendance | null 
}

export default function DashboardPage() {
  const [dailyReport, setDailyReport] = useState<StaffStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  
  const [editingRow, setEditingRow] = useState<Attendance | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  const supabase = createClient()
  const router = useRouter()

  const fetchDailyData = async () => {
    setLoading(true)
    try {
        const { data: allHistory } = await supabase.from('attendance').select('user_email, user_name')
        
        const uniqueStaff = new Map<string, string>()
        if (allHistory) {
            allHistory.forEach(row => {
                if (!uniqueStaff.has(row.user_email)) {
                    uniqueStaff.set(row.user_email, row.user_name || row.user_email.split('@')[0]) 
                }
            })
        }

        const { data: todayPresence } = await supabase.from('attendance').select('*').eq('date', selectedDate)
        
        const report: StaffStatus[] = []
        uniqueStaff.forEach((name, email) => {
            const presence = todayPresence?.find(p => p.user_email === email)
            report.push({
                email: email,
                name: presence?.user_name || name,
                status: presence ? 'HADIR' : 'TIDAK HADIR',
                record: presence || null
            })
        })

        report.sort((a, b) => {
            if (a.status === b.status) return a.name.localeCompare(b.name)
            return a.status === 'HADIR' ? -1 : 1
        })
        setDailyReport(report)
    } catch (error) {
        showToast("Gagal memuat data", 'error')
    } finally {
        setLoading(false)
    }
  }

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) router.push('/')
      else fetchDailyData()
    }
    checkSession()
  }, [selectedDate])

  // --- HANDLE EDIT KLIK (Logic Baru) ---
  const handleEditClick = (item: StaffStatus) => {
    if (item.record) {
        // Jika data ada -> EDIT
        setEditingRow(item.record)
    } else {
        // Jika data kosong -> INPUT BARU (Manual)
        setEditingRow({
            id: '', // ID Kosong tandanya Insert Baru
            user_email: item.email,
            user_name: item.name,
            date: selectedDate, // Tanggal sesuai yang dipilih di dashboard
            check_in: `${selectedDate}T08:00:00`, // Default jam 8 pagi
            check_out: null,
            duration: null,
            work_category: 'Administrasi', // Default
            task_list: '',
            notes: 'Input Manual Admin',
            weekend_reason: null
        })
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRow) return
    setIsSaving(true)
    const res = await updateAttendanceData(editingRow)
    if (res.success) {
        await fetchDailyData()
        showToast('Data tersimpan!', 'success')
        setEditingRow(null)
    } else {
        showToast(res.message, 'error')
    }
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Hapus data absen ini?")) return;
    setIsSaving(true)
    const res = await deleteAttendanceData(id)
    if (res.success) { await fetchDailyData(); showToast('Data dihapus.', 'success') } 
    else { showToast(res.message, 'error') }
    setIsSaving(false)
  }

  const handleExport = () => {
    const dataToExport = dailyReport.map(item => ({
        Tanggal: selectedDate,
        Nama: item.name,
        Email: item.email,
        Status: item.status,
        'Jam Masuk': item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-',
        'Jam Pulang': item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-',
        Durasi: item.record?.duration || '-',
        Keterangan: item.record?.weekend_reason ? `(Weekend: ${item.record.weekend_reason})` : (item.record?.notes || item.record?.task_list || '-')
    }))
    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Harian")
    XLSX.writeFile(wb, `Laporan_Harian_${selectedDate}.xlsx`)
  }

  const showToast = (message: string, type: 'success' | 'error') => setToast({ message, type })
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) } }, [toast])

  const toLocalISOString = (isoString: string | null) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
    return localDate.toISOString().slice(0, 16)
  }

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '-'
    return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 relative">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border-l-8 bg-white ${
            toast.type === 'success' ? 'border-green-500' : 'border-red-500'
        }`}>
            {toast.type === 'success' ? <CheckCircle className="text-green-500" /> : <AlertCircle className="text-red-500" />}
            <span className="font-medium text-sm">{toast.message}</span>
            <button onClick={() => setToast(null)}><X size={16} className="text-slate-400"/></button>
        </div>
      )}

      <nav className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">SDM</div>
            <h1 className="text-lg font-bold text-slate-800 hidden md:block">Admin Dashboard</h1>
        </div>
        <div className="flex gap-3">
            <button onClick={() => router.push('/admin/qr')} className="btn bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-2">
              <QrCode size={18} /> <span className="hidden sm:inline">QR Code</span>
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }} className="btn bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-2">
              <LogOut size={18} /> <span className="hidden sm:inline">Keluar</span>
            </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-end gap-4">
            <div className="w-full md:w-auto">
                <h2 className="text-2xl font-bold text-slate-800 mb-1">Monitoring Harian</h2>
                <p className="text-slate-500 text-sm mb-4">Pantau kehadiran staff per hari.</p>
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 p-1 pr-4 rounded-lg w-fit">
                    <div className="bg-blue-600 text-white p-2 rounded-md"><Calendar size={20} /></div>
                    <input type="date" className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}/>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { setLoading(true); fetchDailyData(); }} className="p-3 bg-white border rounded-lg hover:bg-slate-50 text-slate-500"><RefreshCw size={20} className={loading ? 'animate-spin' : ''}/></button>
                <button onClick={handleExport} className="btn bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-sm"><FileSpreadsheet size={20} /> Export Harian</button>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b uppercase text-xs tracking-wider">
                        <tr>
                            <th className="px-6 py-4 w-[50px]">Status</th>
                            <th className="px-6 py-4">Nama Staff</th>
                            <th className="px-6 py-4">Jam Masuk</th>
                            <th className="px-6 py-4">Jam Pulang</th>
                            <th className="px-6 py-4">Keterangan</th>
                            <th className="px-6 py-4 text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? ( <tr><td colSpan={6} className="p-10 text-center text-slate-400">Memuat data...</td></tr> ) 
                        : dailyReport.length === 0 ? ( <tr><td colSpan={6} className="p-10 text-center text-slate-400">Belum ada data staff.</td></tr> ) 
                        : (
                            dailyReport.map((item) => (
                                <tr key={item.email} className={`hover:bg-slate-50 transition group ${item.status === 'TIDAK HADIR' ? 'bg-red-50/30' : ''}`}>
                                    <td className="px-6 py-4">
                                        {item.status === 'HADIR' ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={12}/> HADIR</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200"><UserX size={12}/> TIDAK</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{item.name}</div>
                                        <div className="text-xs text-slate-400">{item.email}</div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-slate-600">{item.record ? formatTime(item.record.check_in) : '-'}</td>
                                    <td className="px-6 py-4 font-mono text-slate-600">{item.record ? (item.record.check_out ? formatTime(item.record.check_out) : <span className="text-amber-500 text-xs italic">Belum Pulang</span>) : '-'}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500 max-w-[200px] truncate">{item.record?.weekend_reason ? <span className="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-100">Week: {item.record.weekend_reason}</span> : (item.record?.notes || item.record?.task_list || '-')}</td>
                                    
                                    {/* AKSI UNTUK SEMUA */}
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* TOMBOL EDIT SELALU MUNCUL */}
                                            <button onClick={() => handleEditClick(item)} className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition" title={item.status === 'HADIR' ? "Edit Data" : "Input Manual"}>
                                                {item.status === 'HADIR' ? <Edit size={16} /> : <PlusCircle size={16} />}
                                            </button>
                                            
                                            {/* TOMBOL HAPUS HANYA JIKA ADA DATA */}
                                            {item.record && (
                                                <button onClick={() => handleDelete(item.record!.id)} className="p-2 text-red-600 bg-red-50 rounded hover:bg-red-100 transition" title="Hapus Data">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="bg-slate-50 px-6 py-3 border-t text-xs text-slate-500 flex justify-between">
                <span>Total Staff: {dailyReport.length}</span>
                <span className="flex gap-4">
                    <span className="text-green-600 font-bold">Hadir: {dailyReport.filter(r => r.status === 'HADIR').length}</span>
                    <span className="text-red-600 font-bold">Tidak Hadir: {dailyReport.filter(r => r.status === 'TIDAK HADIR').length}</span>
                </span>
            </div>
        </div>
      </main>

      {editingRow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">{editingRow.id ? 'Koreksi Data' : 'Input Manual Absen'}</h3>
              <button onClick={() => setEditingRow(null)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 mb-2">
                    Staff: <strong>{editingRow.user_name}</strong> <br/>
                    Tanggal: {new Date(editingRow.date).toLocaleDateString('id-ID', {dateStyle: 'full'})}
                </div>
                <div>
                    <label className="label">Nama Staff (Tampilan)</label>
                    <input type="text" className="input" value={editingRow.user_name || ''} onChange={e => setEditingRow({...editingRow, user_name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="label">Jam Masuk</label>
                        <input type="datetime-local" className="input" value={toLocalISOString(editingRow.check_in)} onChange={e => setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})} />
                     </div>
                     <div>
                        <label className="label">Jam Pulang</label>
                        <input type="datetime-local" className="input" value={toLocalISOString(editingRow.check_out)} onChange={e => setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})} />
                     </div>
                </div>
                <div>
                    <label className="label text-amber-600">Alasan Weekend</label>
                    <select className="input bg-amber-50" value={editingRow.weekend_reason || ''} onChange={e => setEditingRow({...editingRow, weekend_reason: e.target.value})}>
                        <option value="">- Bukan Weekend -</option>
                        <option value="Lembur Project">Lembur Project</option>
                        <option value="Event Kampus">Event Kampus</option>
                        <option value="Ganti Jam">Ganti Jam</option>
                        <option value="Lainnya">Lainnya</option>
                    </select>
                </div>
                <div>
                    <label className="label">List Pekerjaan / Catatan</label>
                    <textarea className="input" value={editingRow.task_list || editingRow.notes || ''} onChange={e => setEditingRow({...editingRow, task_list: e.target.value})} placeholder="Keterangan kehadiran..." />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={() => setEditingRow(null)} className="btn bg-slate-100 text-slate-600 hover:bg-slate-200">Batal</button>
                    <button type="submit" disabled={isSaving} className="btn bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
                        {isSaving ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>} Simpan
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .btn { @apply px-4 py-2 rounded-lg text-sm font-medium transition; }
        .label { @apply text-xs font-bold text-slate-500 uppercase mb-1 block; }
        .input { @apply w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none; }
      `}</style>
    </div>
  )
}