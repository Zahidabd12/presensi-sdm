'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  FileSpreadsheet, Edit, Save, X, UserX, CheckCircle, 
  Trash2, Search, Clock, Coffee, Stethoscope, User, 
  CalendarDays, Filter, DownloadCloud, AlertCircle, RefreshCw, Palmtree,
  AlertTriangle, MessageSquare
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

// --- KONFIGURASI ---
const HOURLY_RATE = 8000
const MAX_PAYABLE_HOURS = 8
const MIN_WORK_HOURS = 4

// --- TIPE DATA ---
type Attendance = {
  id: string; user_email: string; user_name: string | null; date: string;
  check_in: string; check_out: string | null; duration: string | null;
  work_category: string | null; task_list: string | null; notes: string | null; weekend_reason: string | null;
}

type StaffStatus = { 
    email: string; 
    name: string; 
    dateStr: string; 
    position?: string;
    status: 'HADIR' | 'KERJA' | 'ALPHA' | 'IZIN' | 'SAKIT' | 'LIBUR'; 
    record?: Attendance | null;
    holidayInfo?: string | null;
    stats?: {
        rawHours: number;
        paidHours: number;
        wage: number;
        isLess4Hours: boolean;
    }
}

// --- HELPER LOGIC ---
const calculateStats = (inTime: string | null | undefined, outTime: string | null | undefined) => {
    if (!inTime || !outTime) return { rawHours: 0, paidHours: 0, wage: 0, isLess4Hours: false };
    const start = new Date(inTime).getTime();
    const end = new Date(outTime).getTime();
    const diffMs = end - start;
    if (diffMs < 0) return { rawHours: 0, paidHours: 0, wage: 0, isLess4Hours: false };

    const rawHours = diffMs / (1000 * 60 * 60);
    const paidHours = Math.min(rawHours, MAX_PAYABLE_HOURS);
    const wage = Math.floor(paidHours * HOURLY_RATE);

    return { rawHours, paidHours, wage, isLess4Hours: rawHours < MIN_WORK_HOURS };
}

const formatRupiah = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);

const formatDurationStr = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}j ${m}m`;
}

const getTodayISO = () => {
    const d = new Date()
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
}

const getDatesInRange = (startDate: string, endDate: string) => {
    const dates = []
    const current = new Date(startDate)
    const end = new Date(endDate)
    while (current <= end) {
        dates.push(new Date(current).toISOString().split('T')[0])
        current.setDate(current.getDate() + 1)
    }
    return dates
}

const generateExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data); 
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan"); 
    XLSX.writeFile(wb, fileName);
}

export default function RekapPage() {
  const [startDate, setStartDate] = useState(getTodayISO())
  const [endDate, setEndDate] = useState(getTodayISO())
  const [selectedStaff, setSelectedStaff] = useState('ALL') 
  const [staffList, setStaffList] = useState<{email:string, name:string}[]>([])

  const [tableData, setTableData] = useState<StaffStatus[]>([]) 
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'DAILY' | 'RANGE'>('DAILY') 
  const [totalRevenue, setTotalRevenue] = useState(0)

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

        // 1. DATA ABSEN
        let query = supabase.from('attendance').select('*').gte('date', startDate).lte('date', endDate)
        if (selectedStaff !== 'ALL') query = query.eq('user_email', selectedStaff)
        const { data: presenceData, error } = await query
        if (error) throw error

        // 2. DATA LIBUR & STAFF
        const { data: holidayData } = await supabase.from('libur_nasional').select('*').gte('tanggal', startDate).lte('tanggal', endDate)
        const { data: allStaff } = await supabase.from('staff').select('*').order('name')

        let finalReport: StaffStatus[] = []
        let tempTotalRevenue = 0

        const staffToProcess = selectedStaff === 'ALL' ? allStaff : allStaff?.filter(s => s.email === selectedStaff)
        const dateRange = getDatesInRange(startDate, endDate)

        staffToProcess?.forEach(staff => {
            dateRange.forEach(dateStr => {
                // LOGIC 5 HARI KERJA
                const dateObj = new Date(dateStr)
                const day = dateObj.getDay()
                const isWeekend = day === 0 || day === 6
                
                const record = presenceData?.find(p => p.user_email === staff.email && p.date === dateStr)
                
                // SKIP WEEKEND JIKA KOSONG
                if (isWeekend && !record) return 

                const holiday = holidayData?.find(h => h.tanggal === dateStr)
                let status: any = 'ALPHA'
                let holidayInfo = null
                let stats = { rawHours: 0, paidHours: 0, wage: 0, isLess4Hours: false }

                if (record) {
                    if (record.work_category === 'Izin') status = 'IZIN'
                    else if (record.work_category === 'Sakit') status = 'SAKIT'
                    else if (record.check_out) {
                        status = 'HADIR'
                        stats = calculateStats(record.check_in, record.check_out)
                    } else {
                        status = 'KERJA'
                    }
                } else {
                    if (holiday) {
                        status = 'LIBUR'
                        holidayInfo = holiday.keterangan
                    }
                }

                tempTotalRevenue += stats.wage

                finalReport.push({
                    email: staff.email,
                    name: staff.name,
                    dateStr: dateStr,
                    status: status,
                    record: record || null,
                    holidayInfo: holidayInfo,
                    stats: stats
                })
            })
        })

        finalReport.sort((a, b) => {
            if (a.dateStr !== b.dateStr) return new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime()
            return a.name.localeCompare(b.name)
        })

        setTableData(finalReport)
        setTotalRevenue(tempTotalRevenue)

    } catch (e: any) {
        showToast(e.message, 'error')
    } finally {
        setLoading(false)
    }
  }

  const handleExport = () => {
    if (tableData.length === 0) { showToast("Data kosong", 'error'); return }
    const dataToExport = tableData.map(item => ({
        Tanggal: item.dateStr, Nama: item.name, Status: item.status === 'KERJA' ? 'Belum Pulang' : item.status,
        'Masuk': (item.status === 'HADIR' || item.status === 'KERJA') && item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-',
        'Pulang': (item.status === 'HADIR') && item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-',
        'Durasi': item.stats?.rawHours ? formatDurationStr(item.stats.rawHours) : '-',
        'Gaji': item.stats?.wage || 0,
        'Keterangan': item.status === 'LIBUR' ? item.holidayInfo : (item.record?.notes || '-')
    }))
    generateExcel(dataToExport, `Gaji_${startDate}_sd_${endDate}.xlsx`)
    showToast("Berhasil Download Excel", 'success')
  }

  const handleEditClick = (item: StaffStatus) => {
    // Set Form Type berdasarkan status data
    if (item.status === 'IZIN') setFormType('IZIN')
    else if (item.status === 'SAKIT') setFormType('SAKIT')
    else setFormType('HADIR')

    if (item.record) {
        setEditingRow(item.record)
    } else {
        // Init data baru untuk Alpha/Libur
        setEditingRow({ 
            id: '', 
            user_email: item.email, 
            user_name: item.name, 
            date: item.dateStr, 
            check_in: `${item.dateStr}T08:00`, 
            check_out: null, 
            duration: null, 
            work_category: 'Administrasi', 
            task_list: '', 
            notes: '', // Notes kosong awal
            weekend_reason: null 
        })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if(!editingRow) return; setIsSaving(true)
    const dataToSave = { ...editingRow }
    
    // LOGIC FORM TYPE
    if (formType !== 'HADIR') { 
        dataToSave.work_category = formType === 'IZIN' ? 'Izin' : 'Sakit'; 
        // Reset jam jika izin/sakit
        if(!dataToSave.date) dataToSave.date=startDate; 
        dataToSave.check_in=`${dataToSave.date}T00:00:00`; 
        dataToSave.check_out=`${dataToSave.date}T00:00:00` 
    } else { 
        if (dataToSave.work_category === 'Izin' || dataToSave.work_category === 'Sakit') dataToSave.work_category = 'Administrasi' 
    }
    
    let errorMsg = null
    // Cek ID untuk insert/update
    if (!dataToSave.id) {
        // Gunakan upsert di backend via actions.ts agar aman
        const res = await updateAttendanceData(dataToSave) 
        if (!res.success) errorMsg = res.message
    } else {
        const res = await updateAttendanceData(dataToSave)
        if (!res.success) errorMsg = res.message
    }

    if (!errorMsg) { await fetchData(); showToast('Tersimpan', 'success'); setEditingRow(null) } else showToast(errorMsg, 'error')
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => { if(!confirm("Hapus data?")) return; setIsSaving(true); const res = await deleteAttendanceData(id); if(res.success) { await fetchData(); showToast('Terhapus', 'success') } setIsSaving(false) }
  const showToast = (msg: string, type: 'success'|'error') => { setToast({message: msg, type}); setTimeout(() => setToast(null), 3000) }
  const toLocalISO = (str: string | null) => { if(!str) return ''; const d = new Date(str); return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) }

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans">
      {toast && <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 border-l-8 ${toast.type === 'success' ? 'bg-white text-slate-800 border-green-500' : 'bg-white text-slate-800 border-red-500'}`}> <span className="font-bold">{toast.message}</span></div>}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div><h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="text-blue-600" /> Rekap & Gaji</h1><p className="text-slate-500 text-sm mt-1">Pantau kehadiran dan hitung gaji staff.</p></div>
        <div className="flex gap-3">
            <div className="bg-emerald-50 border border-emerald-200 px-5 py-2 rounded-xl flex flex-col items-end"><span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Total Estimasi Gaji</span><span className="text-xl font-bold text-emerald-800">{formatRupiah(totalRevenue)}</span></div>
            <button onClick={handleExport} disabled={tableData.length === 0} className="group flex items-center gap-3 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition disabled:opacity-50"><DownloadCloud size={20} /> Export</button>
        </div>
      </div>

      {/* FILTER */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-2 mb-4"><Filter size={18} className="text-blue-600"/> Filter Data</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Dari Tanggal</label><div className="relative"><CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/><input type="date" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div></div>
            <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Sampai Tanggal</label><div className="relative"><CalendarDays className="absolute left-3 top-3 text-slate-400" size={18}/><input type="date" className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div></div>
            <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase ml-1">Pilih Staff</label><div className="relative"><User className="absolute left-3 top-3 text-slate-400" size={18}/><select className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none" value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)}><option value="ALL">Semua Staff</option>{staffList.map(s => <option key={s.email} value={s.email}>{s.name}</option>)}</select></div></div>
            <div className="flex items-end"><button onClick={fetchData} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"><Search size={18}/> Tampilkan</button></div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px] flex flex-col">
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center text-xs font-bold text-slate-500 gap-2">
            <div className="flex gap-2"><span className="bg-white px-2 py-1 rounded border shadow-sm">MODE: {mode === 'DAILY' ? 'HARIAN' : 'RANGE'}</span><span className="bg-white px-2 py-1 rounded border shadow-sm">DATA: {tableData.length} Baris</span></div>
            <div className="flex flex-wrap gap-2 justify-end"><div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Hadir</div><div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Alpha</div><div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500"></span> Libur</div></div>
        </div>
        <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold border-b border-slate-100">
                    <tr><th className="px-6 py-4">Tanggal</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Nama Staff</th><th className="px-6 py-4">Jam Kerja</th><th className="px-6 py-4">Durasi</th><th className="px-6 py-4 text-right">Pendapatan</th><th className="px-6 py-4 text-right">Aksi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {loading ? ( <tr><td colSpan={7} className="p-12 text-center text-slate-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24}/> Memuat data...</td></tr> ) : tableData.length === 0 ? ( <tr><td colSpan={7} className="p-12 text-center text-slate-400"><div className="flex flex-col items-center gap-2 opacity-50"><Search size={32}/> <p>Tidak ada data.</p></div></td></tr> ) : (
                     tableData.map((item, idx) => (
                        <tr key={idx} className={`hover:bg-blue-50/30 transition group ${item.status==='ALPHA' ? 'bg-red-50/20' : item.status==='LIBUR' ? 'bg-pink-50/30' : ''}`}>
                            <td className="px-6 py-4 font-mono text-slate-600 font-medium">{new Date(item.dateStr).toLocaleDateString('id-ID', {day:'2-digit', month:'short'})}</td>
                            <td className="px-6 py-4">{item.status==='HADIR' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={12}/> SELESAI</span>}{item.status==='KERJA' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200 animate-pulse"><Clock size={12}/> KERJA</span>}{item.status==='ALPHA' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><UserX size={12}/> ALPHA</span>}{item.status==='LIBUR' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-pink-100 text-pink-700 border border-pink-200"><Palmtree size={12}/> LIBUR</span>}{(item.status==='IZIN' || item.status==='SAKIT') && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><Coffee size={12}/> {item.status}</span>}</td>
                            <td className="px-6 py-4 font-bold text-slate-700">{item.name}<div className="text-[10px] text-slate-400 font-normal">{item.email}</div></td>
                            <td className="px-6 py-4 font-mono text-slate-600 text-xs">{(item.status === 'IZIN' || item.status === 'SAKIT' || item.status === 'LIBUR') ? '-' : (<><div className="text-green-600">IN: {item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}</div><div className="text-red-500">OUT: {item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-'}</div></>)}</td>
                            <td className="px-6 py-4">{item.stats && item.status === 'HADIR' ? (<div className="flex flex-col"><span className="font-bold text-slate-700">{formatDurationStr(item.stats.rawHours)}</span>{item.stats.rawHours > MAX_PAYABLE_HOURS && <span className="text-[10px] text-slate-400 line-through">Max: 8 Jam</span>}{item.stats.isLess4Hours && <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1"><AlertTriangle size={10}/> Kurang Jam</span>}</div>) : '-'}</td>
                            <td className="px-6 py-4 text-right font-mono font-bold text-emerald-700">{item.stats?.wage ? formatRupiah(item.stats.wage) : '-'}</td>
                            <td className="px-6 py-4 text-right"><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"><button onClick={() => handleEditClick(item)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition shadow-sm"><Edit size={14}/></button>{item.record && <button onClick={() => handleDelete(item.record!.id)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition shadow-sm"><Trash2 size={14}/></button>}</div></td>
                        </tr>
                    )))}
                </tbody>
            </table>
        </div>
      </div>

      {/* --- MODAL EDIT YANG DIPERBAIKI --- */}
      {editingRow && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit size={18} className="text-blue-600"/> Edit Absensi</h3><button onClick={()=>setEditingRow(null)}><X size={20}/></button></div>
                <div className="p-6 space-y-5">
                    
                    {/* User Info */}
                    <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold">{editingRow.user_name ? editingRow.user_name.charAt(0).toUpperCase() : 'U'}</div>
                        <div><p className="font-bold text-slate-800">{editingRow.user_name}</p><p className="text-xs text-blue-600 font-medium">Tanggal: {new Date(editingRow.date).toLocaleDateString('id-ID', {dateStyle:'full'})}</p></div>
                    </div>

                    {/* Button Selector */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Status Kehadiran</label>
                        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-xl">
                            <button onClick={() => setFormType('HADIR')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='HADIR'?'bg-white shadow text-blue-600 ring-1 ring-blue-100':'text-slate-500 hover:bg-slate-200'}`}>Hadir Kerja</button>
                            <button onClick={() => setFormType('IZIN')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='IZIN'?'bg-white shadow text-amber-600 ring-1 ring-amber-100':'text-slate-500 hover:bg-slate-200'}`}>Izin</button>
                            <button onClick={() => setFormType('SAKIT')} className={`py-2 rounded-lg text-xs font-bold transition-all ${formType==='SAKIT'?'bg-white shadow text-purple-600 ring-1 ring-purple-100':'text-slate-500 hover:bg-slate-200'}`}>Sakit</button>
                        </div>
                    </div>

                    <form onSubmit={handleSave} className="space-y-4">
                        {formType === 'HADIR' ? (
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                <div><label className="text-xs font-bold text-slate-500 mb-1 block">Masuk</label><input type="datetime-local" className="w-full border border-slate-300 p-2.5 rounded-lg text-sm" value={toLocalISO(editingRow.check_in)} onChange={e=>setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})}/></div>
                                <div><label className="text-xs font-bold text-slate-500 mb-1 block">Pulang</label><input type="datetime-local" className="w-full border border-slate-300 p-2.5 rounded-lg text-sm" value={toLocalISO(editingRow.check_out)} onChange={e=>setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})}/></div>
                            </div>
                        ) : (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                                <AlertCircle size={18} className="text-amber-500 mt-0.5"/>
                                <p className="text-xs text-amber-800 leading-relaxed">Jam kerja akan direset. Anda <strong>WAJIB</strong> mengisi alasan pada kolom keterangan di bawah ini.</p>
                            </div>
                        )}

                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                {formType==='HADIR' ? 'Catatan Tambahan (Opsional)' : 'Alasan Izin / Sakit (Wajib)'}
                                {formType!=='HADIR' && <span className="text-red-500">*</span>}
                            </label>
                            <textarea 
                                required={formType!=='HADIR'} 
                                className={`w-full border p-3 rounded-xl h-24 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none ${formType!=='HADIR' ? 'border-amber-300 bg-amber-50/30' : 'border-slate-300'}`}
                                placeholder={formType==='HADIR' ? "Contoh: Lupa absen pulang..." : "Tulis alasan detail kenapa izin/sakit..."} 
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