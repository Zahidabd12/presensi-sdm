'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  FileSpreadsheet, Edit, Save, X, Calendar, UserX, CheckCircle, 
  AlertCircle, Trash2, PlusCircle, RefreshCw, Clock, Briefcase
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

type Attendance = {
  id: string; user_email: string; user_name: string | null; date: string;
  check_in: string; check_out: string | null; duration: string | null;
  work_category: string | null; task_list: string | null; notes: string | null; weekend_reason: string | null;
}

// Status lebih lengkap
type StaffStatus = { 
    email: string; 
    name: string; 
    position?: string;
    status: 'HADIR' | 'KERJA' | 'ALPHA'; // Kerja = Belum Pulang
    record?: Attendance | null 
}

const generateExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan"); XLSX.writeFile(wb, fileName);
}

export default function RekapPage() {
  const [dailyReport, setDailyReport] = useState<StaffStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  
  const [editingRow, setEditingRow] = useState<Attendance | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  // State Export
  const [exportType, setExportType] = useState<'DAILY'|'MONTHLY'|'YEARLY'|'CUSTOM'>('DAILY')
  const [exportMonth, setExportMonth] = useState(new Date().getMonth())
  const [exportYear, setExportYear] = useState(new Date().getFullYear())
  const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0])
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0])
  const [isExporting, setIsExporting] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  // --- FETCH DATA LOGIC BARU ---
  const fetchDailyData = async () => {
    setLoading(true)
    try {
        // 1. AMBIL MASTER STAFF (Wajib muncul semua)
        const { data: allStaff, error: errStaff } = await supabase
            .from('staff')
            .select('*')
            .order('name', { ascending: true })
        
        if (errStaff) throw new Error("Gagal ambil data staff. Pastikan tabel 'staff' sudah dibuat.")

        // 2. AMBIL PRESENSI HARI INI
        const { data: todayPresence, error: errToday } = await supabase
            .from('attendance')
            .select('*')
            .eq('date', selectedDate)

        if (errToday) throw new Error("Gagal ambil data presensi.")

        // 3. GABUNGKAN DATA (Mapping Status)
        const report: StaffStatus[] = []
        
        allStaff?.forEach((staff) => {
            // Cari apakah staff ini ada di daftar hadir hari ini?
            // Kita cocokkan by EMAIL
            const presence = todayPresence?.find(p => p.user_email === staff.email)
            
            let status: 'HADIR' | 'KERJA' | 'ALPHA' = 'ALPHA'
            
            if (presence) {
                if (presence.check_out) {
                    status = 'HADIR' // Sudah pulang (Lengkap)
                } else {
                    status = 'KERJA' // Masih jam kerja / Belum tap pulang
                }
            }

            report.push({
                email: staff.email,
                name: staff.name,
                position: staff.position,
                status: status,
                record: presence || null
            })
        })

        // Sort: Kerja -> Hadir -> Alpha
        const priority = { 'KERJA': 1, 'HADIR': 2, 'ALPHA': 3 }
        report.sort((a, b) => priority[a.status] - priority[b.status])

        setDailyReport(report)

    } catch (e: any) { 
        showToast(e.message, 'error')
    } finally { 
        setLoading(false) 
    }
  }

  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) router.push('/')
        else fetchDailyData()
    }
    init()
  }, [selectedDate])

  // --- EXPORT LOGIC ---
  const handleProcessExport = async () => {
    setIsExporting(true)
    let dataToExport: any[] = []
    let fileName = "Laporan.xlsx"
    try {
        if (exportType === 'DAILY') {
            dataToExport = dailyReport.map(item => ({
                Tanggal: selectedDate, 
                Nama: item.name, 
                Status: item.status === 'KERJA' ? 'Belum Pulang' : item.status,
                'Jam Masuk': item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-',
                'Jam Pulang': item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-',
                Durasi: item.record?.duration || '-',
                Ket: item.record?.weekend_reason ? `Weekend: ${item.record.weekend_reason}` : (item.record?.notes || '-')
            }))
            fileName = `Harian_${selectedDate}.xlsx`
        } else {
            let start = '', end = ''
            if (exportType === 'MONTHLY') {
                const startDateObj = new Date(exportYear, exportMonth - 1, 16) 
                const endDateObj = new Date(exportYear, exportMonth, 15)
                const toStr = (d: Date) => {
                    const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const date = String(d.getDate()).padStart(2,'0');
                    return `${y}-${m}-${date}`
                }
                start = toStr(startDateObj); end = toStr(endDateObj); fileName = `Bulanan_${exportMonth+1}_${exportYear}.xlsx`
            } 
            else if (exportType === 'YEARLY') { start = `${exportYear}-01-01`; end = `${exportYear}-12-31`; fileName = `Tahunan_${exportYear}.xlsx` }
            else { start = exportStartDate; end = exportEndDate; fileName = `Custom_${start}_${end}.xlsx` }

            const { data: rangeData } = await supabase.from('attendance').select('*').gte('date', start).lte('date', end).order('date')
            if (!rangeData || rangeData.length === 0) throw new Error("Tidak ada data di periode ini.")

            dataToExport = rangeData.map(row => ({
                Tanggal: row.date, Nama: row.user_name, 
                'Jam Masuk': row.check_in ? new Date(row.check_in).toLocaleTimeString('id-ID') : '-',
                'Jam Pulang': row.check_out ? new Date(row.check_out).toLocaleTimeString('id-ID') : '-',
                Durasi: row.duration, Ket: row.weekend_reason || row.notes || row.task_list
            }))
        }
        generateExcel(dataToExport, fileName)
        setShowExportModal(false)
        showToast('Download Selesai', 'success')
    } catch (e: any) { showToast(e.message, 'error') }
    setIsExporting(false)
  }

  // Helpers
  const handleEditClick = (item: StaffStatus) => {
    if (item.record) setEditingRow(item.record)
    else setEditingRow({
        id: '', user_email: item.email, user_name: item.name, date: selectedDate,
        check_in: `${selectedDate}T08:00`, check_out: null, duration: null,
        work_category: 'Administrasi', task_list: '', notes: 'Input Admin', weekend_reason: null
    })
  }
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSaving(true)
    const res = await updateAttendanceData(editingRow)
    if (res.success) { await fetchDailyData(); showToast('Tersimpan', 'success'); setEditingRow(null) }
    else showToast(res.message, 'error')
    setIsSaving(false)
  }
  const handleDelete = async (id: string) => {
    if(!confirm("Hapus?")) return
    setIsSaving(true)
    const res = await deleteAttendanceData(id)
    if(res.success) { await fetchDailyData(); showToast('Terhapus', 'success') }
    setIsSaving(false)
  }
  const showToast = (msg: string, type: 'success'|'error') => { setToast({message: msg, type}); setTimeout(() => setToast(null), 3000) }
  const toLocalISO = (str: string | null) => {
      if(!str) return ''; const d = new Date(str); 
      return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
  }

  return (
    <div className="space-y-6">
      {toast && <div className={`fixed bottom-6 right-6 z-[60] px-6 py-4 rounded-xl shadow-xl bg-white border-l-8 ${toast.type==='success'?'border-green-500':'border-red-500'}`}>{toast.message}</div>}

      {/* HEADER & CONTROLS */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Monitoring Harian</h2>
            <p className="text-slate-500 text-sm mb-4">Pantau kehadiran staff hari ini.</p>
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 p-1 pr-4 rounded-lg w-fit">
                <div className="bg-blue-600 text-white p-2 rounded-md"><Calendar size={20} /></div>
                <input type="date" className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}/>
            </div>
        </div>
        <div className="flex gap-2">
            <button onClick={fetchDailyData} className="p-3 bg-white border rounded-lg hover:bg-slate-50"><RefreshCw size={20}/></button>
            <button onClick={() => setShowExportModal(true)} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold shadow-sm"><FileSpreadsheet size={20}/> Export Data</button>
        </div>
      </div>

      {/* TABEL */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                    <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Nama Staff</th>
                        <th className="px-6 py-4">Masuk</th>
                        <th className="px-6 py-4">Pulang</th>
                        <th className="px-6 py-4">Ket</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr> : 
                     dailyReport.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Tabel Staff Kosong. Harap isi data di Database.</td></tr> :
                     dailyReport.map((item) => (
                        <tr key={item.email} className={`hover:bg-slate-50 transition group ${item.status==='ALPHA'?'bg-red-50/30':''}`}>
                            
                            {/* STATUS LOGIC */}
                            <td className="px-6 py-4">
                                {item.status==='HADIR' && <span className="text-green-600 font-bold flex gap-1 items-center px-2 py-1 bg-green-50 rounded-full w-fit text-xs border border-green-200"><CheckCircle size={14}/> SELESAI</span>}
                                {item.status==='KERJA' && <span className="text-blue-600 font-bold flex gap-1 items-center px-2 py-1 bg-blue-50 rounded-full w-fit text-xs border border-blue-200"><Clock size={14}/> KERJA</span>}
                                {item.status==='ALPHA' && <span className="text-red-500 font-bold flex gap-1 items-center px-2 py-1 bg-red-50 rounded-full w-fit text-xs border border-red-200"><UserX size={14}/> ALPHA</span>}
                            </td>

                            <td className="px-6 py-4 font-bold text-slate-700">
                                {item.name}
                                <div className="text-xs font-normal text-slate-400">{item.position || item.email}</div>
                            </td>
                            
                            <td className="px-6 py-4 font-mono">
                                {item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}
                            </td>
                            
                            <td className="px-6 py-4 font-mono">
                                {item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : 
                                 item.record?.check_in ? <span className="text-xs italic text-blue-500 animate-pulse">Belum Pulang</span> : '-'}
                            </td>
                            
                            <td className="px-6 py-4 text-xs max-w-[150px] truncate">
                                {item.record?.weekend_reason ? `Week: ${item.record.weekend_reason}` : (item.record?.notes || '-')}
                            </td>
                            
                            <td className="px-6 py-4 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditClick(item)} className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition">
                                    {item.status==='ALPHA' ? <PlusCircle size={16}/> : <Edit size={16}/>}
                                </button>
                                {item.record && <button onClick={() => handleDelete(item.record!.id)} className="p-2 text-red-600 bg-red-50 rounded hover:bg-red-100 transition"><Trash2 size={16}/></button>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* MODAL EXPORT & EDIT SAMA SEPERTI SEBELUMNYA... */}
      {/* ... (Copy bagian Modal Export & Modal Edit dari kode sebelumnya, tidak ada perubahan logic disitu) ... */}
      
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center"><h3 className="text-lg font-bold">Export Data</h3><button onClick={()=>setShowExportModal(false)}><X/></button></div>
                <div className="grid grid-cols-2 gap-2">
                    {['DAILY','MONTHLY','YEARLY','CUSTOM'].map((t) => (
                        <button key={t} onClick={() => setExportType(t as any)} className={`p-2 border rounded text-xs font-bold ${exportType===t?'bg-emerald-600 text-white':'hover:bg-slate-50'}`}>{t}</button>
                    ))}
                </div>
                <div className="bg-slate-50 p-4 rounded border">
                    {exportType === 'MONTHLY' && (
                        <>
                        <p className="text-xs text-slate-500 mb-2 font-bold">PERIODE (Cutoff 15)</p>
                        <div className="flex gap-2">
                            <select className="w-full p-2 border rounded" value={exportMonth} onChange={e=>setExportMonth(Number(e.target.value))}>{['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
                            <select className="w-full p-2 border rounded" value={exportYear} onChange={e=>setExportYear(Number(e.target.value))}>{[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</select>
                        </div>
                        </>
                    )}
                    {exportType === 'DAILY' && <p className="text-sm">Data Tanggal: <strong>{selectedDate}</strong></p>}
                    {exportType === 'CUSTOM' && <div className="flex gap-2"><input type="date" className="border p-1 w-full" value={exportStartDate} onChange={e=>setExportStartDate(e.target.value)}/><input type="date" className="border p-1 w-full" value={exportEndDate} onChange={e=>setExportEndDate(e.target.value)}/></div>}
                </div>
                <button onClick={handleProcessExport} disabled={isExporting} className="w-full bg-emerald-600 text-white py-3 rounded font-bold hover:bg-emerald-700">{isExporting?'Processing...':'Download .xlsx'}</button>
            </div>
        </div>
      )}

      {editingRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center"><h3 className="text-lg font-bold">{editingRow.id?'Edit Data':'Input Manual'}</h3><button onClick={()=>setEditingRow(null)}><X/></button></div>
                <form onSubmit={handleSave} className="space-y-3">
                    <input className="w-full border p-2 rounded" placeholder="Nama Staff" value={editingRow.user_name||''} onChange={e=>setEditingRow({...editingRow, user_name: e.target.value})}/>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-xs font-bold">Masuk</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_in)} onChange={e=>setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})}/></div>
                        <div><label className="text-xs font-bold">Pulang</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_out)} onChange={e=>setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})}/></div>
                    </div>
                    <textarea className="w-full border p-2 rounded" placeholder="Keterangan..." value={editingRow.notes||''} onChange={e=>setEditingRow({...editingRow, notes: e.target.value})}/>
                    <button disabled={isSaving} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">{isSaving?'Menyimpan...':'Simpan Data'}</button>
                </form>
            </div>
        </div>
      )}

    </div>
  )
}