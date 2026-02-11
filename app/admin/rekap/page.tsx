'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  FileSpreadsheet, Edit, Save, X, UserX, CheckCircle, 
  Trash2, Search, Clock, Coffee, Stethoscope, User, 
  CalendarDays, Filter, DownloadCloud, AlertCircle, RefreshCw, Palmtree
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

// --- TIPE DATA ---
type Attendance = {
  id: string; user_email: string; user_name: string | null; date: string;
  check_in: string; check_out: string | null; duration: string | null;
  work_category: string | null; task_list: string | null; notes: string | null; weekend_reason: string | null;
}

type Holiday = {
    tanggal: string;
    keterangan: string;
}

type StaffStatus = { 
    email: string; 
    name: string; 
    position?: string;
    status: 'HADIR' | 'KERJA' | 'ALPHA' | 'IZIN' | 'SAKIT' | 'LIBUR'; 
    record?: Attendance | null;
    holidayInfo?: string | null; // Info nama hari libur
}

// --- HELPER EXCEL ---
const generateExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data); 
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan"); 
    XLSX.writeFile(wb, fileName);
}

const calculateDuration = (inTime: string | null | undefined, outTime: string | null | undefined) => {
    if (!inTime || !outTime) return '-'
    const start = new Date(inTime).getTime()
    const end = new Date(outTime).getTime()
    const diff = end - start
    if (diff < 0) return 'Error' 
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}j ${minutes}m`
}

const getTodayISO = () => {
    const d = new Date()
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
}

export default function RekapPage() {
  const [startDate, setStartDate] = useState(getTodayISO())
  const [endDate, setEndDate] = useState(getTodayISO())
  const [selectedStaff, setSelectedStaff] = useState('ALL') 
  const [staffList, setStaffList] = useState<{email:string, name:string}[]>([])

  const [tableData, setTableData] = useState<StaffStatus[]>([]) 
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'DAILY' | 'RANGE'>('DAILY') 

  const [editingRow, setEditingRow] = useState<Attendance | null>(null)
  const [formType, setFormType] = useState<'HADIR' | 'IZIN' | 'SAKIT'>('HADIR')
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)

  const supabase = createClient()
  const router = useRouter()

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

  const fetchData = async () => {
    setLoading(true)
    try {
        const isDailyMode = startDate === endDate
        setMode(isDailyMode ? 'DAILY' : 'RANGE')

        // 1. QUERY ATTENDANCE
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

        // 2. QUERY LIBUR NASIONAL (NEW FEATURE)
        const { data: holidayData } = await supabase
            .from('libur_nasional')
            .select('*')
            .gte('tanggal', startDate)
            .lte('tanggal', endDate)
        
        // 3. QUERY MASTER STAFF
        const { data: allStaff } = await supabase.from('staff').select('*').order('name')

        let finalReport: StaffStatus[] = []

        if (isDailyMode) {
            // --- MODE HARIAN ---
            
            // Cek apakah hari ini libur?
            const isTodayHoliday = holidayData?.find(h => h.tanggal === startDate)

            allStaff?.forEach((staff) => {
                if (selectedStaff !== 'ALL' && staff.email !== selectedStaff) return

                const record = presenceData?.find(p => p.user_email === staff.email)
                let status: any = 'ALPHA'
                let holidayInfo = null

                if (record) {
                    if (record.work_category === 'Izin') status = 'IZIN'
                    else if (record.work_category === 'Sakit') status = 'SAKIT'
                    else if (record.check_out) status = 'HADIR'
                    else status = 'KERJA'
                } else {
                    // Jika tidak ada record, cek apakah hari libur?
                    if (isTodayHoliday) {
                        status = 'LIBUR'
                        holidayInfo = isTodayHoliday.keterangan
                    }
                }

                finalReport.push({
                    email: staff.email, 
                    name: staff.name,
                    position: staff.position,
                    status: status, 
                    record: record || null,
                    holidayInfo: holidayInfo
                })
            })
            // Sorting: Kerja > Hadir > Izin > Sakit > Libur > Alpha
            const priority = { 'KERJA': 1, 'HADIR': 2, 'IZIN': 3, 'SAKIT': 3, 'LIBUR': 4, 'ALPHA': 5 }
            finalReport.sort((a, b) => priority[a.status] - priority[b.status])

        } else {
            // --- MODE RIWAYAT (RANGE) ---
            finalReport = presenceData?.map(row => {
                let status: any = 'HADIR'
                if (row.work_category === 'Izin') status = 'IZIN'
                else if (row.work_category === 'Sakit') status = 'SAKIT'
                else if (!row.check_out) status = 'KERJA'

                // Logic Libur di mode range agak tricky karena ini berbasis data yg SUDAH ada absennya.
                // Tapi kita bisa cek jika dia masuk pas hari libur.
                const isHoliday = holidayData?.find(h => h.tanggal === row.date)
                
                const currentStaffData = allStaff?.find(s => s.email === row.user_email)
                const realName = currentStaffData ? currentStaffData.name : (row.user_name || row.user_email)

                return {
                    email: row.user_email,
                    name: realName,
                    status: status,
                    record: row,
                    holidayInfo: isHoliday ? `Masuk saat: ${isHoliday.keterangan}` : null
                }
            }) || []
            
            // Note: Di mode Range, kita hanya menampilkan data yang ADA (orang yang absen).
            // Kalau mau menampilkan Alpha/Libur di range panjang, logic-nya harus looping tanggal x staff (kompleks & berat).
            // Jadi untuk sekarang, fitur "LIBUR" otomatis paling efektif di mode HARIAN (Daily).
        }

        setTableData(finalReport)

    } catch (e: any) {
        showToast(e.message, 'error')
    } finally {
        setLoading(false)
    }
  }

  const handleExport = () => {
    if (tableData.length === 0) {
        showToast("Tidak ada data untuk di-download", 'error')
        return
    }

    const dataToExport = tableData.map(item => ({
        Tanggal: item.record?.date || startDate,
        Nama: item.name,
        Status: item.status === 'KERJA' ? 'Belum Pulang' : item.status,
        'Jam Masuk': (item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-'),
        'Jam Pulang': (item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-'),
        'Durasi Kerja': (item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : calculateDuration(item.record?.check_in, item.record?.check_out),
        Keterangan: item.status === 'LIBUR' ? item.holidayInfo : (item.record?.notes || item.record?.weekend_reason || '-')
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
    if (res.success) { await fetchData(); showToast('Perubahan tersimpan!', 'success'); setEditingRow(null) }
    else showToast(res.message, 'error')
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Yakin ingin menghapus data ini secara permanen?")) return
    setIsSaving(true)
    const res = await deleteAttendanceData(id)
    if(res.success) { await fetchData(); showToast('Data berhasil dihapus', 'success') }
    setIsSaving(false)
  }

  const showToast = (msg: string, type: 'success'|'error') => { setToast({message: msg, type}); setTimeout(() => setToast(null), 3000) }
  const toLocalISO = (str: string | null) => {
      if(!str) return ''; const d = new Date(str); 
      return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans">
      
      {/* TOAST NOTIF */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border-l-8 ${
            toast.type === 'success' ? 'bg-white text-slate-800 border-green-500' : 'bg-white text-slate-800 border-red-500'
        }`}>
            {toast.type === 'success' ? <CheckCircle className="text-green-500"/> : <AlertCircle className="text-red-500"/>}
            <span className="font-bold">{toast.message}</span>
        </div>
      )}

      {/* --- HEADER SECTION --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="text-blue-600" /> Rekap & Laporan
            </h1>
            <p className="text-slate-500 text-sm mt-1">Pantau kehadiran staff, filter data, dan export ke Excel.</p>
        </div>
        <button 
            onClick={handleExport}
            disabled={tableData.length === 0}
            className="group flex items-center gap-3 px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <DownloadCloud size={20} className="group-hover:-translate-y-1 transition" /> 
            Export Excel
        </button>
      </div>

      {/* --- FILTER SECTION --- */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2 mb-4">
            <Filter size={18} className="text-blue-600"/> Filter Data
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Dari Tanggal</label>
                <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input type="date" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition" 
                        value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Sampai Tanggal</label>
                <div className="relative">
                    <CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input type="date" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium transition" 
                        value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase ml-1">Pilih Staff</label>
                <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <select className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium appearance-none cursor-pointer transition"
                        value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}>
                        <option value="ALL">Semua Staff</option>
                        {staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}
                    </select>
                </div>
            </div>
            <div className="flex items-end">
                <button onClick={fetchData} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition flex items-center justify-center gap-2">
                    <Search size={18}/> Tampilkan
                </button>
            </div>
        </div>
      </div>

      {/* --- TABLE SECTION --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px] flex flex-col">
        {/* Info Bar */}
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center text-xs font-bold text-slate-500 gap-2">
            <div className="flex gap-2">
                <span className="bg-white px-2 py-1 rounded border shadow-sm">MODE: {mode === 'DAILY' ? 'HARIAN' : 'RIWAYAT'}</span>
                <span className="bg-white px-2 py-1 rounded border shadow-sm">TOTAL: {tableData.length} Data</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Hadir</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alpha</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500"></span> Libur</div>
            </div>
        </div>

        <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold border-b border-slate-100">
                    <tr>
                        <th className="px-6 py-4">Tanggal</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Nama Staff</th>
                        <th className="px-6 py-4">Masuk</th>
                        <th className="px-6 py-4">Pulang</th>
                        <th className="px-6 py-4">Durasi</th>
                        <th className="px-6 py-4">Ket</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {loading ? (
                        <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                            <RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24}/> Memuat data...
                        </td></tr>
                    ) : tableData.length === 0 ? (
                        <tr><td colSpan={8} className="p-12 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-2 opacity-50">
                                <Search size={32}/> 
                                <p>Tidak ada data yang ditemukan.</p>
                            </div>
                        </td></tr>
                    ) : (
                     tableData.map((item, idx) => (
                        <tr key={idx} className={`hover:bg-blue-50/30 transition group ${item.status==='ALPHA' ? 'bg-red-50/20' : item.status==='LIBUR' ? 'bg-pink-50/30' : ''}`}>
                            
                            {/* TANGGAL */}
                            <td className="px-6 py-4 font-mono text-slate-600 font-medium">
                                {item.record ? new Date(item.record.date).toLocaleDateString('id-ID', {day:'2-digit', month:'short'}) : new Date(startDate).toLocaleDateString('id-ID', {day:'2-digit', month:'short'})}
                            </td>

                            {/* STATUS BADGES */}
                            <td className="px-6 py-4">
                                {item.status==='HADIR' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={12}/> SELESAI</span>}
                                {item.status==='KERJA' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse"><Clock size={12}/> KERJA</span>}
                                {item.status==='ALPHA' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><UserX size={12}/> ALPHA</span>}
                                {item.status==='IZIN' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><Coffee size={12}/> IZIN</span>}
                                {item.status==='SAKIT' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200"><Stethoscope size={12}/> SAKIT</span>}
                                {item.status==='LIBUR' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200"><Palmtree size={12}/> LIBUR</span>}
                            </td>

                            {/* NAMA */}
                            <td className="px-6 py-4 font-bold text-slate-700">
                                {item.name}
                                <div className="text-[10px] text-slate-400 font-normal">{item.email}</div>
                            </td>

                            {/* JAM */}
                            <td className="px-6 py-4 font-mono text-slate-600">
                                {(item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-')}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-600">
                                {(item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : item.record?.check_in ? <span className="text-xs text-blue-500 italic">--:--</span> : '-')}
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                {(item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : calculateDuration(item.record?.check_in, item.record?.check_out)}
                            </td>

                            {/* KETERANGAN */}
                            <td className="px-6 py-4 text-xs max-w-[150px] truncate text-slate-500" title={item.record?.notes || item.holidayInfo || ''}>
                                {item.status === 'LIBUR' ? <span className="text-pink-600 font-medium">{item.holidayInfo}</span> : item.record?.weekend_reason ? <span className="text-indigo-600 font-bold">Week: {item.record.weekend_reason}</span> : (item.record?.notes || '-')}
                            </td>

                            {/* ACTIONS */}
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                    <button onClick={() => handleEditClick(item)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm" title="Edit Data">
                                        <Edit size={14}/>
                                    </button>
                                    {item.record && (
                                        <button onClick={() => handleDelete(item.record!.id)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition shadow-sm" title="Hapus Data">
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )))}
                </tbody>
            </table>
        </div>
      </div>

      {/* --- MODAL EDIT --- */}
      {editingRow && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit size={18} className="text-blue-600"/> Edit Absensi</h3>
                    <button onClick={()=>setEditingRow(null)} className="text-slate-400 hover:text-red-500 transition"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-5">
                    
                    {/* Info User */}
                    <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold">
                            {editingRow.user_name ? editingRow.user_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <p className="font-bold text-slate-800">{editingRow.user_name}</p>
                            <p className="text-xs text-blue-600 font-medium">Tanggal: {new Date(editingRow.date).toLocaleDateString('id-ID', {dateStyle:'full'})}</p>
                        </div>
                    </div>

                    {/* Status Tabs */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Status Kehadiran</label>
                        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl">
                            <button onClick={() => setFormType('HADIR')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='HADIR'?'bg-white shadow text-blue-600 ring-1 ring-blue-100':'text-slate-500 hover:bg-slate-200'}`}>Hadir Kerja</button>
                            <button onClick={() => setFormType('IZIN')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='IZIN'?'bg-white shadow text-amber-600 ring-1 ring-amber-100':'text-slate-500 hover:bg-slate-200'}`}>Izin</button>
                            <button onClick={() => setFormType('SAKIT')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='SAKIT'?'bg-white shadow text-purple-600 ring-1 ring-purple-100':'text-slate-500 hover:bg-slate-200'}`}>Sakit</button>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        {formType === 'HADIR' && (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">Jam Masuk</label>
                                    <input type="datetime-local" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                                        value={toLocalISO(editingRow.check_in)} onChange={e=>setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})}/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 mb-1 block">Jam Pulang</label>
                                    <input type="datetime-local" className="w-full border border-slate-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                                        value={toLocalISO(editingRow.check_out)} onChange={e=>setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})}/>
                                </div>
                            </div>
                        )}
                        
                        {(formType === 'IZIN' || formType === 'SAKIT') && (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                                <AlertCircle size={18} className="text-amber-500 mt-0.5"/>
                                <p className="text-xs text-amber-800 leading-relaxed">
                                    Jam masuk/pulang akan direset. Staff akan tercatat sebagai <strong>{formType}</strong> pada tanggal ini.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">Catatan / Keterangan</label>
                            <textarea 
                                required={formType!=='HADIR'} 
                                className="w-full border border-slate-300 p-3 rounded-xl h-24 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none" 
                                placeholder={formType==='HADIR' ? "Contoh: Lupa absen pulang, koreksi jam..." : "Tulis alasan izin/sakit..."} 
                                value={editingRow.notes||''} 
                                onChange={e=>setEditingRow({...editingRow, notes: e.target.value})}
                            />
                        </div>

                        <div className="pt-2 flex gap-3">
                             <button type="button" onClick={()=>setEditingRow(null)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition">Batal</button>
                             <button type="submit" disabled={isSaving} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-95 transition flex justify-center items-center gap-2">
                                {isSaving ? <RefreshCw className="animate-spin" size={18}/> : <Save size={18}/>} Simpan
                             </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}