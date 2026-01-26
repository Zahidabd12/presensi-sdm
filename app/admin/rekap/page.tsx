'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  FileSpreadsheet, Edit, Save, X, UserX, CheckCircle, 
  Trash2, PlusCircle, Search, Clock, Coffee, Stethoscope, User, Timer
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

// --- TIPE DATA ---
type Attendance = {
  id: string; user_email: string; user_name: string | null; date: string;
  check_in: string; check_out: string | null; duration: string | null;
  work_category: string | null; task_list: string | null; notes: string | null; weekend_reason: string | null;
}

type StaffStatus = { 
    email: string; 
    name: string; 
    position?: string;
    status: 'HADIR' | 'KERJA' | 'ALPHA' | 'IZIN' | 'SAKIT'; 
    record?: Attendance | null 
}

// --- HELPER EXCEL ---
const generateExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data); 
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan"); 
    XLSX.writeFile(wb, fileName);
}

// --- HELPER HITUNG DURASI (JAM KERJA) ---
const calculateDuration = (inTime: string | null | undefined, outTime: string | null | undefined) => {
    if (!inTime || !outTime) return '-'
    const start = new Date(inTime).getTime()
    const end = new Date(outTime).getTime()
    const diff = end - start
    
    if (diff < 0) return 'Error' // Antisipasi jam terbalik
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}j ${minutes}m`
}

// --- HELPER TIMEZONE WIB ---
const getTodayISO = () => {
    const d = new Date()
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
}

export default function RekapPage() {
  // STATE FILTER UTAMA
  const [startDate, setStartDate] = useState(getTodayISO())
  const [endDate, setEndDate] = useState(getTodayISO())
  const [selectedStaff, setSelectedStaff] = useState('ALL') 
  const [staffList, setStaffList] = useState<{email:string, name:string}[]>([])

  // STATE DATA
  const [tableData, setTableData] = useState<StaffStatus[]>([]) 
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'DAILY' | 'RANGE'>('DAILY') 

  // STATE MODAL / EDIT
  const [editingRow, setEditingRow] = useState<Attendance | null>(null)
  const [formType, setFormType] = useState<'HADIR' | 'IZIN' | 'SAKIT'>('HADIR')
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  const supabase = createClient()
  const router = useRouter()

  // 1. INIT LOAD
  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }

        const { data } = await supabase.from('staff').select('email, name').order('name')
        if (data) setStaffList(data)
        
        fetchData()
    }
    init()
  }, []) 

  // 2. LOGIC FETCH DATA
  const fetchData = async () => {
    setLoading(true)
    try {
        const isDailyMode = startDate === endDate
        setMode(isDailyMode ? 'DAILY' : 'RANGE')

        let query = supabase
            .from('attendance')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: false }) 
            .order('check_in', { ascending: true })

        if (selectedStaff !== 'ALL') {
            query = query.eq('user_email', selectedStaff)
        }

        const { data: presenceData, error } = await query
        if (error) throw error

        let finalReport: StaffStatus[] = []

        if (isDailyMode) {
            // MODE HARIAN (Gabung Master Staff)
            const { data: allStaff } = await supabase.from('staff').select('*').order('name')
            
            allStaff?.forEach((staff) => {
                if (selectedStaff !== 'ALL' && staff.email !== selectedStaff) return

                const record = presenceData?.find(p => p.user_email === staff.email)
                let status: any = 'ALPHA'
                
                if (record) {
                    if (record.work_category === 'Izin') status = 'IZIN'
                    else if (record.work_category === 'Sakit') status = 'SAKIT'
                    else if (record.check_out) status = 'HADIR'
                    else status = 'KERJA'
                }

                finalReport.push({
                    email: staff.email, name: staff.name, position: staff.position,
                    status: status, record: record || null
                })
            })
            const priority = { 'KERJA': 1, 'HADIR': 2, 'IZIN': 3, 'SAKIT': 3, 'ALPHA': 4 }
            finalReport.sort((a, b) => priority[a.status] - priority[b.status])

        } else {
            // MODE RANGE (Riwayat)
            finalReport = presenceData?.map(row => {
                let status: any = 'HADIR'
                if (row.work_category === 'Izin') status = 'IZIN'
                else if (row.work_category === 'Sakit') status = 'SAKIT'
                else if (!row.check_out) status = 'KERJA'

                return {
                    email: row.user_email,
                    name: row.user_name || row.user_email,
                    status: status,
                    record: row
                }
            }) || []
        }

        setTableData(finalReport)

    } catch (e: any) {
        showToast(e.message, 'error')
    } finally {
        setLoading(false)
    }
  }

  // 3. LOGIC EXPORT (Update ada Durasi)
  const handleExport = () => {
    if (tableData.length === 0) {
        showToast("Tidak ada data untuk di-download", 'error')
        return
    }

    const dataToExport = tableData.map(item => ({
        Tanggal: item.record?.date || startDate,
        Nama: item.name,
        Status: item.status === 'KERJA' ? 'Belum Pulang' : item.status,
        'Jam Masuk': (item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-'),
        'Jam Pulang': (item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-'),
        'Durasi Kerja': (item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : calculateDuration(item.record?.check_in, item.record?.check_out), // KOLOM BARU
        Keterangan: item.record?.notes || item.record?.weekend_reason || '-'
    }))

    let fileName = `Laporan_${startDate}`
    if (startDate !== endDate) fileName += `_sd_${endDate}`
    if (selectedStaff !== 'ALL') {
        const s = staffList.find(x => x.email === selectedStaff)
        if (s) fileName += `_${s.name.replace(/\s/g, '_')}`
    }
    fileName += '.xlsx'

    generateExcel(dataToExport, fileName)
    showToast("Berhasil Download Excel", 'success')
  }

  // 4. CRUD ACTIONS
  const handleEditClick = (item: StaffStatus) => {
    if (item.status === 'IZIN') setFormType('IZIN')
    else if (item.status === 'SAKIT') setFormType('SAKIT')
    else setFormType('HADIR')

    if (item.record) {
        setEditingRow(item.record)
    } else {
        setEditingRow({
            id: '', user_email: item.email, user_name: item.name, date: startDate,
            check_in: `${startDate}T08:00`, check_out: null, duration: null,
            work_category: 'Administrasi', task_list: '', notes: '', weekend_reason: null
        })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if(!editingRow) return
    setIsSaving(true)

    const dataToSave = { ...editingRow }
    
    if (formType === 'IZIN' || formType === 'SAKIT') {
        dataToSave.work_category = formType === 'IZIN' ? 'Izin' : 'Sakit'
        if (!dataToSave.date) dataToSave.date = startDate
        dataToSave.check_in = `${dataToSave.date}T00:00:00`
        dataToSave.check_out = `${dataToSave.date}T00:00:00`
        dataToSave.duration = '0 jam'
    } else {
        if (dataToSave.work_category === 'Izin' || dataToSave.work_category === 'Sakit') {
            dataToSave.work_category = 'Administrasi' 
        }
    }

    const res = await updateAttendanceData(dataToSave)
    if (res.success) { await fetchData(); showToast('Tersimpan', 'success'); setEditingRow(null) }
    else showToast(res.message, 'error')
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Hapus data ini?")) return
    setIsSaving(true)
    const res = await deleteAttendanceData(id)
    if(res.success) { await fetchData(); showToast('Terhapus', 'success') }
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Rekap & Laporan</h2>
                <p className="text-slate-500 text-sm">Filter data absensi dan download laporan.</p>
            </div>
            <button onClick={handleExport} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold shadow-sm transition">
                <FileSpreadsheet size={20}/> Download Excel
            </button>
        </div>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Dari Tanggal</label>
                <input type="date" className="w-full p-2 border rounded bg-white font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" 
                    value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Sampai Tanggal</label>
                <input type="date" className="w-full p-2 border rounded bg-white font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" 
                    value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Filter Staff</label>
                <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                    <select className="w-full p-2 pl-9 border rounded bg-white font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                        value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
                        <option value="ALL">Semua Staff</option>
                        {staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
                    </select>
                </div>
            </div>
            <button onClick={fetchData} className="w-full bg-blue-600 text-white p-2.5 rounded font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                <Search size={18}/> Tampilkan Data
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-xs font-bold text-slate-500">
            <span>MODE: {mode === 'DAILY' ? 'HARIAN' : 'RIWAYAT'}</span>
            <span>Total Data: {tableData.length}</span>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                    <tr>
                        <th className="px-6 py-4">Tanggal</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Nama Staff</th>
                        <th className="px-6 py-4">Masuk</th>
                        <th className="px-6 py-4">Pulang</th>
                        <th className="px-6 py-4">Durasi</th> {/* KOLOM BARU */}
                        <th className="px-6 py-4">Ket</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? <tr><td colSpan={8} className="p-8 text-center text-slate-400 animate-pulse">Sedang memuat data...</td></tr> : 
                     tableData.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">Data tidak ditemukan sesuai filter.</td></tr> :
                     tableData.map((item, idx) => (
                        <tr key={idx} className={`hover:bg-slate-50 transition group ${item.status==='ALPHA'?'bg-red-50/30':''}`}>
                            
                            <td className="px-6 py-4 font-mono text-slate-600">
                                {item.record ? new Date(item.record.date).toLocaleDateString('id-ID', {day:'2-digit', month:'short'}) : new Date(startDate).toLocaleDateString('id-ID', {day:'2-digit', month:'short'})}
                            </td>

                            <td className="px-6 py-4">
                                {item.status==='HADIR' && <span className="text-green-600 font-bold flex gap-1 items-center px-2 py-1 bg-green-50 rounded-full w-fit text-xs border border-green-200"><CheckCircle size={14}/> SELESAI</span>}
                                {item.status==='KERJA' && <span className="text-blue-600 font-bold flex gap-1 items-center px-2 py-1 bg-blue-50 rounded-full w-fit text-xs border border-blue-200"><Clock size={14}/> KERJA</span>}
                                {item.status==='ALPHA' && <span className="text-red-500 font-bold flex gap-1 items-center px-2 py-1 bg-red-50 rounded-full w-fit text-xs border border-red-200"><UserX size={14}/> ALPHA</span>}
                                {item.status==='IZIN' && <span className="text-amber-600 font-bold flex gap-1 items-center px-2 py-1 bg-amber-50 rounded-full w-fit text-xs border border-amber-200"><Coffee size={14}/> IZIN</span>}
                                {item.status==='SAKIT' && <span className="text-purple-600 font-bold flex gap-1 items-center px-2 py-1 bg-purple-50 rounded-full w-fit text-xs border border-purple-200"><Stethoscope size={14}/> SAKIT</span>}
                            </td>

                            <td className="px-6 py-4 font-bold text-slate-700">{item.name}</td>

                            <td className="px-6 py-4 font-mono">
                                {(item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-')}
                            </td>
                            <td className="px-6 py-4 font-mono">
                                {(item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : item.record?.check_in ? <span className="text-xs italic text-blue-500 animate-pulse">Belum Pulang</span> : '-')}
                            </td>

                            {/* KOLOM DURASI (BARU) */}
                            <td className="px-6 py-4 font-mono font-bold text-slate-600">
                                {(item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : calculateDuration(item.record?.check_in, item.record?.check_out)}
                            </td>

                            <td className="px-6 py-4 text-xs max-w-[150px] truncate">{item.record?.weekend_reason ? `Week: ${item.record.weekend_reason}` : (item.record?.notes || '-')}</td>

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

      {/* MODAL EDIT SAMA SEPERTI SEBELUMNYA */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in">
                <div className="flex justify-between items-center"><h3 className="text-lg font-bold">Update Status Staff</h3><button onClick={()=>setEditingRow(null)}><X/></button></div>
                
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setFormType('HADIR')} className={`p-2 rounded text-xs font-bold transition ${formType==='HADIR'?'bg-white shadow text-blue-600':'text-slate-500'}`}>Hadir Kerja</button>
                    <button onClick={() => setFormType('IZIN')} className={`p-2 rounded text-xs font-bold transition ${formType==='IZIN'?'bg-white shadow text-amber-600':'text-slate-500'}`}>Izin</button>
                    <button onClick={() => setFormType('SAKIT')} className={`p-2 rounded text-xs font-bold transition ${formType==='SAKIT'?'bg-white shadow text-purple-600':'text-slate-500'}`}>Sakit</button>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 flex justify-between">
                        <span>Staff: <strong>{editingRow.user_name}</strong></span>
                        <span>Tgl: {new Date(editingRow.date).toLocaleDateString('id-ID')}</span>
                    </div>
                    {formType === 'HADIR' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-xs font-bold text-slate-500">Masuk</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_in)} onChange={e=>setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})}/></div>
                            <div><label className="text-xs font-bold text-slate-500">Pulang</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_out)} onChange={e=>setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})}/></div>
                        </div>
                    )}
                    {(formType === 'IZIN' || formType === 'SAKIT') && (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-800 text-xs">Jam akan diabaikan. Staff tercatat sebagai <strong>{formType}</strong>.</div>
                    )}
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Keterangan</label>
                        <textarea required={formType!=='HADIR'} className="w-full border p-2 rounded h-24 focus:ring-2 focus:ring-blue-500 outline-none" placeholder={formType==='HADIR' ? "Catatan kerja..." : "Tulis alasan izin/sakit..."} value={editingRow.notes||''} onChange={e=>setEditingRow({...editingRow, notes: e.target.value})}/>
                    </div>
                    <button disabled={isSaving} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition">{isSaving?'Menyimpan...':'Simpan Perubahan'}</button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}