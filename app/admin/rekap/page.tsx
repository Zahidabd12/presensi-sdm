'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { 
  FileSpreadsheet, Edit, Save, X, Calendar, UserX, CheckCircle, 
  Trash2, PlusCircle, RefreshCw, Clock, Coffee, Stethoscope, User
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { updateAttendanceData, deleteAttendanceData } from '@/app/actions'

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

const generateExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan"); XLSX.writeFile(wb, fileName);
}

export default function RekapPage() {
  const [dailyReport, setDailyReport] = useState<StaffStatus[]>([])
  const [loading, setLoading] = useState(true)
  
  // FIX TANGGAL WIB
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000))
    return local.toISOString().split('T')[0]
  })

  // State Modal Edit/Input
  const [editingRow, setEditingRow] = useState<Attendance | null>(null)
  const [formType, setFormType] = useState<'HADIR' | 'IZIN' | 'SAKIT'>('HADIR')
  
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)

  // State Export
  const [exportType, setExportType] = useState<'DAILY'|'MONTHLY'|'YEARLY'|'CUSTOM'>('DAILY')
  const [exportMonth, setExportMonth] = useState(new Date().getMonth())
  const [exportYear, setExportYear] = useState(new Date().getFullYear())
  const [exportStartDate, setExportStartDate] = useState(new Date().toISOString().split('T')[0])
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0])
  
  // --- STATE BARU: TARGET STAFF ---
  const [exportTarget, setExportTarget] = useState<string>('ALL') // 'ALL' atau Email Staff
  
  const [isExporting, setIsExporting] = useState(false)

  const supabase = createClient()
  const router = useRouter()

  // --- FETCH DATA LOGIC ---
  const fetchDailyData = async () => {
    setLoading(true)
    try {
        const { data: allStaff, error: errStaff } = await supabase
            .from('staff')
            .select('*')
            .order('name', { ascending: true })
        
        if (errStaff) throw new Error("Gagal ambil data staff.")

        const { data: todayPresence, error: errToday } = await supabase
            .from('attendance')
            .select('*')
            .eq('date', selectedDate)

        if (errToday) throw new Error("Gagal ambil data presensi.")

        const report: StaffStatus[] = []
        
        allStaff?.forEach((staff) => {
            const presence = todayPresence?.find(p => p.user_email === staff.email)
            let status: 'HADIR' | 'KERJA' | 'ALPHA' | 'IZIN' | 'SAKIT' = 'ALPHA'
            
            if (presence) {
                if (presence.work_category === 'Izin') status = 'IZIN'
                else if (presence.work_category === 'Sakit') status = 'SAKIT'
                else if (presence.check_out) status = 'HADIR'
                else status = 'KERJA'
            }

            report.push({
                email: staff.email,
                name: staff.name,
                position: staff.position,
                status: status,
                record: presence || null
            })
        })

        const priority = { 'KERJA': 1, 'HADIR': 2, 'IZIN': 3, 'SAKIT': 3, 'ALPHA': 4 }
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

  // --- EXPORT LOGIC (DIPERBAIKI) ---
  const handleProcessExport = async () => {
    setIsExporting(true)
    let dataToExport: any[] = []
    let fileName = "Laporan.xlsx"
    
    // Cari nama staff untuk filename (jika tidak ALL)
    let staffNameLabel = ""
    if (exportTarget !== 'ALL') {
        const s = dailyReport.find(x => x.email === exportTarget)
        staffNameLabel = s ? `_${s.name.replace(/\s+/g, '_')}` : '_Staff'
    }

    try {
        // --- 1. EXPORT HARIAN ---
        if (exportType === 'DAILY') {
            // Filter Data Lokal
            let filteredData = dailyReport
            if (exportTarget !== 'ALL') {
                filteredData = dailyReport.filter(item => item.email === exportTarget)
            }

            dataToExport = filteredData.map(item => ({
                Tanggal: selectedDate, 
                Nama: item.name, 
                Status: item.status === 'KERJA' ? 'Belum Pulang' : item.status,
                'Jam Masuk': (item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID') : '-'),
                'Jam Pulang': (item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID') : '-'),
                Keterangan: item.record?.notes || item.record?.weekend_reason || '-'
            }))
            fileName = `Harian_${selectedDate}${staffNameLabel}.xlsx`
        
        } else {
            // --- 2. EXPORT RANGE (BULANAN/TAHUNAN) ---
            let start = '', end = ''
            if (exportType === 'MONTHLY') {
                const startDateObj = new Date(exportYear, exportMonth - 1, 16) 
                const endDateObj = new Date(exportYear, exportMonth, 15)
                const toStr = (d: Date) => {
                    const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const date = String(d.getDate()).padStart(2,'0');
                    return `${y}-${m}-${date}`
                }
                start = toStr(startDateObj); end = toStr(endDateObj); fileName = `Bulanan_${exportMonth+1}_${exportYear}${staffNameLabel}.xlsx`
            } 
            else if (exportType === 'YEARLY') { start = `${exportYear}-01-01`; end = `${exportYear}-12-31`; fileName = `Tahunan_${exportYear}${staffNameLabel}.xlsx` }
            else { start = exportStartDate; end = exportEndDate; fileName = `Custom_${start}_${end}${staffNameLabel}.xlsx` }

            // QUERY DATABASE DENGAN FILTER
            let query = supabase.from('attendance').select('*').gte('date', start).lte('date', end).order('date')
            
            // FILTER STAFF DI QUERY
            if (exportTarget !== 'ALL') {
                query = query.eq('user_email', exportTarget)
            }

            const { data: rangeData } = await query
            if (!rangeData || rangeData.length === 0) throw new Error("Tidak ada data untuk kriteria ini.")

            dataToExport = rangeData.map(row => ({
                Tanggal: row.date, Nama: row.user_name, 
                Status: (row.work_category === 'Izin' || row.work_category === 'Sakit') ? row.work_category.toUpperCase() : 'HADIR',
                'Jam Masuk': (row.work_category === 'Izin' || row.work_category === 'Sakit') ? '-' : new Date(row.check_in).toLocaleTimeString('id-ID'),
                'Jam Pulang': (row.work_category === 'Izin' || row.work_category === 'Sakit') ? '-' : (row.check_out ? new Date(row.check_out).toLocaleTimeString('id-ID') : '-'),
                Ket: row.notes || row.weekend_reason
            }))
        }
        generateExcel(dataToExport, fileName)
        setShowExportModal(false)
        showToast('Download Selesai', 'success')
    } catch (e: any) { showToast(e.message, 'error') }
    setIsExporting(false)
  }

  // --- ACTIONS ---
  const handleEditClick = (item: StaffStatus) => {
    if (item.status === 'IZIN') setFormType('IZIN')
    else if (item.status === 'SAKIT') setFormType('SAKIT')
    else setFormType('HADIR')

    if (item.record) {
        setEditingRow(item.record)
    } else {
        setEditingRow({
            id: '', user_email: item.email, user_name: item.name, date: selectedDate,
            check_in: `${selectedDate}T08:00`, check_out: null, duration: null,
            work_category: 'Administrasi', task_list: '', notes: '', weekend_reason: null
        })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if(!editingRow) return
    setIsSaving(true)

    const dataToSave = { ...editingRow }
    if (formType === 'IZIN' || formType === 'SAKIT') {
        dataToSave.work_category = formType === 'IZIN' ? 'Izin' : 'Sakit'
        dataToSave.check_in = `${selectedDate}T00:00:00`
        dataToSave.check_out = `${selectedDate}T00:00:00`
        dataToSave.duration = '0 jam'
    } else {
        if (dataToSave.work_category === 'Izin' || dataToSave.work_category === 'Sakit') {
            dataToSave.work_category = 'Administrasi' 
        }
    }

    const res = await updateAttendanceData(dataToSave)
    if (res.success) { await fetchDailyData(); showToast('Tersimpan', 'success'); setEditingRow(null) }
    else showToast(res.message, 'error')
    setIsSaving(false)
  }

  const handleDelete = async (id: string) => {
    if(!confirm("Hapus data ini?")) return
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Monitoring Harian</h2>
            <p className="text-slate-500 text-sm mb-4">Pantau status kehadiran, izin, dan sakit staff.</p>
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                    <tr>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Nama Staff</th>
                        <th className="px-6 py-4">Jam Masuk</th>
                        <th className="px-6 py-4">Jam Pulang</th>
                        <th className="px-6 py-4">Ket</th>
                        <th className="px-6 py-4 text-right">Aksi</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr> : 
                     dailyReport.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Tabel Kosong.</td></tr> :
                     dailyReport.map((item) => (
                        <tr key={item.email} className={`hover:bg-slate-50 transition group ${item.status==='ALPHA'?'bg-red-50/30':''}`}>
                            <td className="px-6 py-4">
                                {item.status==='HADIR' && <span className="text-green-600 font-bold flex gap-1 items-center px-2 py-1 bg-green-50 rounded-full w-fit text-xs border border-green-200"><CheckCircle size={14}/> SELESAI</span>}
                                {item.status==='KERJA' && <span className="text-blue-600 font-bold flex gap-1 items-center px-2 py-1 bg-blue-50 rounded-full w-fit text-xs border border-blue-200"><Clock size={14}/> KERJA</span>}
                                {item.status==='ALPHA' && <span className="text-red-500 font-bold flex gap-1 items-center px-2 py-1 bg-red-50 rounded-full w-fit text-xs border border-red-200"><UserX size={14}/> ALPHA</span>}
                                {item.status==='IZIN' && <span className="text-amber-600 font-bold flex gap-1 items-center px-2 py-1 bg-amber-50 rounded-full w-fit text-xs border border-amber-200"><Coffee size={14}/> IZIN</span>}
                                {item.status==='SAKIT' && <span className="text-purple-600 font-bold flex gap-1 items-center px-2 py-1 bg-purple-50 rounded-full w-fit text-xs border border-purple-200"><Stethoscope size={14}/> SAKIT</span>}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-700">{item.name}<div className="text-xs font-normal text-slate-400">{item.position || item.email}</div></td>
                            <td className="px-6 py-4 font-mono">
                                {(item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_in ? new Date(item.record.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-')}
                            </td>
                            <td className="px-6 py-4 font-mono">
                                {(item.status === 'IZIN' || item.status === 'SAKIT') ? '-' : (item.record?.check_out ? new Date(item.record.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : item.record?.check_in ? <span className="text-xs italic text-blue-500 animate-pulse">Belum Pulang</span> : '-')}
                            </td>
                            <td className="px-6 py-4 text-xs max-w-[150px] truncate">{item.record?.weekend_reason ? `Week: ${item.record.weekend_reason}` : (item.record?.notes || '-')}</td>
                            <td className="px-6 py-4 text-right flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEditClick(item)} className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition">{item.status==='ALPHA' ? <PlusCircle size={16}/> : <Edit size={16}/>}</button>
                                {item.record && <button onClick={() => handleDelete(item.record!.id)} className="p-2 text-red-600 bg-red-50 rounded hover:bg-red-100 transition"><Trash2 size={16}/></button>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* MODAL EXPORT TERBARU */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center"><h3 className="text-lg font-bold">Export Data</h3><button onClick={()=>setShowExportModal(false)}><X/></button></div>
                
                {/* 1. FILTER TIPE WAKTU */}
                <div className="grid grid-cols-2 gap-2">
                    {['DAILY','MONTHLY','YEARLY','CUSTOM'].map((t) => (
                        <button key={t} onClick={() => setExportType(t as any)} className={`p-2 border rounded text-xs font-bold ${exportType===t?'bg-emerald-600 text-white':'hover:bg-slate-50'}`}>{t}</button>
                    ))}
                </div>

                <div className="bg-slate-50 p-4 rounded border space-y-4">
                    
                    {/* 2. FILTER STAFF (BARU!) */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><User size={12}/> Pilih Staff</label>
                        <select className="w-full border p-2 rounded text-sm bg-white" value={exportTarget} onChange={(e) => setExportTarget(e.target.value)}>
                            <option value="ALL">Semua Staff</option>
                            {/* Loop nama staff dari tabel */}
                            {dailyReport.map(s => (
                                <option key={s.email} value={s.email}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <hr className="border-slate-200"/>

                    {/* 3. FILTER TANGGAL (Sesuai Tipe) */}
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

      {/* MODAL EDIT (Sama seperti sebelumnya) */}
      {editingRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex justify-between items-center"><h3 className="text-lg font-bold">Input Status Kehadiran</h3><button onClick={()=>setEditingRow(null)}><X/></button></div>
                
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setFormType('HADIR')} className={`p-2 rounded text-xs font-bold transition ${formType==='HADIR'?'bg-white shadow text-blue-600':'text-slate-500'}`}>Hadir Kerja</button>
                    <button onClick={() => setFormType('IZIN')} className={`p-2 rounded text-xs font-bold transition ${formType==='IZIN'?'bg-white shadow text-amber-600':'text-slate-500'}`}>Izin</button>
                    <button onClick={() => setFormType('SAKIT')} className={`p-2 rounded text-xs font-bold transition ${formType==='SAKIT'?'bg-white shadow text-purple-600':'text-slate-500'}`}>Sakit</button>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    <div className="bg-blue-50 p-2 text-xs rounded text-blue-800">Staff: <strong>{editingRow.user_name}</strong></div>

                    {formType === 'HADIR' && (
                        <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                            <div><label className="text-xs font-bold">Masuk</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_in)} onChange={e=>setEditingRow({...editingRow, check_in: new Date(e.target.value).toISOString()})}/></div>
                            <div><label className="text-xs font-bold">Pulang</label><input type="datetime-local" className="w-full border p-2 rounded" value={toLocalISO(editingRow.check_out)} onChange={e=>setEditingRow({...editingRow, check_out: new Date(e.target.value).toISOString()})}/></div>
                        </div>
                    )}

                    {(formType === 'IZIN' || formType === 'SAKIT') && (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-800 text-xs animate-in fade-in">
                            Jam masuk & pulang akan diabaikan. Staff tercatat sebagai <strong>{formType}</strong>.
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold">Keterangan / Alasan</label>
                        <textarea required={formType!=='HADIR'} className="w-full border p-2 rounded h-24" placeholder={formType==='HADIR' ? "Catatan kerja..." : "Tulis alasan izin/sakit disini..."} value={editingRow.notes||''} onChange={e=>setEditingRow({...editingRow, notes: e.target.value})}/>
                    </div>

                    <button disabled={isSaving} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700">{isSaving?'Menyimpan...':'Simpan Data'}</button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}