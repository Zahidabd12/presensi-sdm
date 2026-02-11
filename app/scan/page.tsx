'use client'

import { useEffect, useState, useRef } from 'react'
import { handleAttendance } from '@/app/actions'
import { getDistance } from 'geolib'
import { 
  LogOut, Camera, XCircle, CheckCircle, RefreshCw, 
  AlertTriangle, Calendar, Repeat, MapPin, 
  ArrowRightCircle, ArrowLeftCircle, ShieldCheck, Moon, Star, Heart,
  Lock, Timer, PartyPopper, Clock
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'

const OFFICE_LOC = { 
  latitude: -7.310985585337482, 
  longitude: 112.72895791145474
} 
const MAX_RADIUS = 500 
const SECRET_TOKEN = "ABSENSI-SDM-TOKEN-RAHASIA-2026" 

// --- CONFIG JAM ---
const WORK_END_HOUR = 15 
const OVERTIME_HOUR = 18 
const LATE_LIMIT_HOUR = 12 
const MIN_WORK_HOURS = 4 // Minimal 4 Jam Kerja

export default function ScanPage() {
  const [step, setStep] = useState<'GPS' | 'READY' | 'WEEKEND_CHECK' | 'EARLY_LEAVE_CHECK' | 'SCANNING' | 'RESULT'>('GPS')
  const [status, setStatus] = useState('Mendeteksi lokasi...')
  const [debugMsg, setDebugMsg] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  
  // State Logic
  const [weekendReason, setWeekendReason] = useState('Lembur Project')
  const [earlyLeaveReason, setEarlyLeaveReason] = useState('')
  const [isOvertime, setIsOvertime] = useState(false)

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState<{ check_in: string | null, check_out: string | null } | null>(null)
  
  const [userName, setUserName] = useState('') 
  const [upcomingHoliday, setUpcomingHoliday] = useState<{tanggal: string, keterangan: string} | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    return () => {
        if (html5QrCodeRef.current?.isScanning) {
            html5QrCodeRef.current.stop().catch(console.error)
            html5QrCodeRef.current.clear()
        }
    }
  }, [])

  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email?.toLowerCase().includes('admin')) {
            router.replace('/admin/dashboard')
            return
        }

        if (user) {
            // AMBIL NAMA MASTER
            const { data: staffData } = await supabase.from('staff').select('name').eq('email', user.email).single()
            setUserName(staffData?.name || user.email?.split('@')[0] || 'Kawan')

            const d = new Date()
            const localDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
            
            const { data } = await supabase
                .from('attendance')
                .select('check_in, check_out')
                .eq('user_email', user.email)
                .eq('date', localDate)
                .single()
            
            if (data) setTodayRecord(data)

            const { data: holiday } = await supabase
                .from('libur_nasional')
                .select('*')
                .gte('tanggal', localDate)
                .order('tanggal', { ascending: true })
                .limit(1)
                .single()
            
            if (holiday) setUpcomingHoliday(holiday)
        }

        if (!navigator.geolocation) { setDebugMsg('Browser tidak support GPS.'); return }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const userLoc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
                const distance = getDistance(userLoc, OFFICE_LOC)
                if (distance > MAX_RADIUS) {
                    setDebugMsg(`❌ Kejauhan! Jarak: ${distance}m`)
                } else {
                    setStep('READY')
                    setStatus('Lokasi Aman. Siap Scan.')
                }
            },
            (err) => setDebugMsg(`❌ Gagal GPS: ${err.message}`),
            { enableHighAccuracy: true }
        )
    }
    init()
  }, [])

  const handleStartButton = () => {
    const currentHour = new Date().getHours()
    
    // 1. Cek Batas Jam 12 Siang (Masuk)
    if (!todayRecord?.check_in && currentHour >= LATE_LIMIT_HOUR) {
        setDebugMsg('❌ Absen Masuk ditutup jam 12:00!')
        return
    }

    // 2. CEK MINIMAL 4 JAM (PULANG)
    if (todayRecord?.check_in && !todayRecord?.check_out) {
        const checkInTime = new Date(todayRecord.check_in).getTime()
        const now = new Date().getTime()
        const diffHours = (now - checkInTime) / (1000 * 60 * 60)

        if (diffHours < MIN_WORK_HOURS) {
            const remaining = Math.ceil((MIN_WORK_HOURS - diffHours) * 60)
            setDebugMsg(`⚠️ Belum 4 Jam Kerja! Tunggu ${remaining} menit lagi.`)
            return
        }
    }

    const day = new Date().getDay()
    if (day === 0 || day === 6) {
        setStep('WEEKEND_CHECK') 
        return
    } 
    startCamera(facingMode)
  }

  const startCamera = async (mode: "environment" | "user") => {
    setDebugMsg('')
    setStep('SCANNING')
    if (html5QrCodeRef.current) { try { if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear() } catch (e) {} }
    await new Promise(r => setTimeout(r, 300))
    try {
      const html5QrCode = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5QrCode
      const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }
      await html5QrCode.start({ facingMode: mode }, config, onScanSuccess, () => {})
    } catch (err: any) {
      setStep('READY')
      setDebugMsg(`❌ Gagal akses kamera.`)
    }
  }

  const switchCamera = async () => {
     setStep('READY') 
     if (html5QrCodeRef.current) { try { if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop() } catch(e) {} }
     const newMode = facingMode === "environment" ? "user" : "environment"
     setFacingMode(newMode)
     setTimeout(() => startCamera(newMode), 500)
  }

  const onScanSuccess = async (decodedText: string) => {
      if (html5QrCodeRef.current) { try { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear() } catch (e) {} }
      
      if (decodedText !== SECRET_TOKEN) {
         setStep('RESULT')
         setDebugMsg('❌ QR Code Salah!')
         setIsSuccess(false)
         return
      }

      const currentHour = new Date().getHours()

      // Logic Pulang
      if (todayRecord?.check_in && !todayRecord?.check_out) {
          if (currentHour < WORK_END_HOUR) {
              setStep('EARLY_LEAVE_CHECK') // Masih muncul jika < 15:00 tapi > 4 jam
              return
          }
          if (currentHour >= OVERTIME_HOUR) {
              setIsOvertime(true) 
          }
      }

      setStep('RESULT')
      const note = (currentHour >= OVERTIME_HOUR && !weekendReason) ? "Lembur (Auto)" : undefined
      processAttendance(note)
  }

  const processAttendance = async (reason?: string) => {
    setStatus('Mengirim data...')
    const noteToSend = step === 'WEEKEND_CHECK' ? weekendReason : (reason || undefined)
    const result = await handleAttendance(noteToSend)
    setStatus(result.message)
    setIsSuccess(result.success)
  }

  const formatTimeInfo = (isoString: string | null | undefined) => {
      if (!isoString) return '--:--'
      return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  const getWorkDuration = () => {
    if (!todayRecord?.check_in || !todayRecord?.check_out) return '0j 0m'
    const start = new Date(todayRecord.check_in).getTime()
    const end = new Date(todayRecord.check_out).getTime()
    const diff = end - start
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}j ${minutes}m`
  }

  const getDaysUntilHoliday = (holidayDate: string) => {
    const today = new Date()
    today.setHours(0,0,0,0)
    const target = new Date(holidayDate)
    const diffTime = target.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Hari Ini'
    if (diffDays === 1) return 'Besok'
    return `H-${diffDays}`
  }

  const dateString = time.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const timeString = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const isDoneToday = todayRecord?.check_in && todayRecord?.check_out
  const currentHour = time.getHours()
  const isLate = !todayRecord?.check_in && currentHour >= LATE_LIMIT_HOUR

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-white font-sans overflow-hidden">
      
      <header className="bg-slate-800/80 backdrop-blur-md border-b border-slate-700 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">SDM</div>
            <div className="flex flex-col">
                <span className="font-bold text-sm tracking-wide leading-none">PRESENSI</span>
                <span className="text-[10px] text-slate-400 font-normal">Halo, {userName}</span>
            </div>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/') }} className="text-xs font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full hover:bg-red-400/20 transition flex items-center gap-1">
          <LogOut size={14} /> Keluar
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-md mx-auto space-y-6">

        <div className="w-full text-center space-y-1 pt-2">
            <div className="text-blue-400 text-sm font-medium uppercase tracking-widest flex items-center justify-center gap-2">
                <Calendar size={14}/> {dateString}
            </div>
            <div className="text-6xl font-mono font-bold text-white tracking-tighter drop-shadow-lg">
                {timeString}
            </div>
            
            {upcomingHoliday && (
                <div className="mt-2 mx-auto w-fit animate-in fade-in slide-in-from-top-4">
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 flex items-center gap-2 text-amber-300">
                        <PartyPopper size={14} className="animate-bounce" />
                        <div className="text-xs font-medium flex gap-1">
                            <span className="font-bold">{getDaysUntilHoliday(upcomingHoliday.tanggal)}:</span> 
                            <span className="opacity-90 max-w-[150px] truncate">{upcomingHoliday.keterangan}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="grid grid-cols-2 gap-3 w-full animate-in slide-in-from-bottom-2">
            <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center relative overflow-hidden ${todayRecord?.check_in ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1 z-10"><ArrowRightCircle size={14} className={todayRecord?.check_in ? 'text-blue-400' : 'text-slate-500'}/> Masuk</div>
                <div className={`text-2xl font-mono font-bold z-10 ${todayRecord?.check_in ? 'text-blue-400' : 'text-slate-500'}`}>{formatTimeInfo(todayRecord?.check_in)}</div>
            </div>

            <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center relative overflow-hidden ${todayRecord?.check_out ? 'bg-amber-900/20 border-amber-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1 z-10"><ArrowLeftCircle size={14} className={todayRecord?.check_out ? 'text-amber-400' : 'text-slate-500'}/> Pulang</div>
                <div className={`text-2xl font-mono font-bold z-10 ${todayRecord?.check_out ? 'text-amber-400' : 'text-slate-500'}`}>{formatTimeInfo(todayRecord?.check_out)}</div>
            </div>
        </div>

        {debugMsg && (
          <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-center w-full animate-in fade-in">
            <AlertTriangle size={24} className="mx-auto text-red-400 mb-2" />
            <p className="text-red-200 font-medium text-sm">{debugMsg}</p>
          </div>
        )}

        {isDoneToday ? (
             <div className="w-full bg-gradient-to-br from-green-800/40 to-emerald-900/40 border border-green-500/30 p-8 rounded-3xl text-center animate-in zoom-in duration-500 shadow-2xl relative overflow-hidden">
                <div className="bg-green-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-green-500/10">
                    <ShieldCheck size={48} className="text-green-400"/>
                </div>
                
                <div className="mb-6 bg-emerald-950/50 border border-emerald-500/20 py-2 px-4 rounded-xl w-fit mx-auto flex items-center gap-2">
                    <Timer size={16} className="text-emerald-400"/>
                    <span className="text-emerald-200 font-mono font-bold text-sm tracking-wide">
                        Durasi: {getWorkDuration()}
                    </span>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">Tugas Selesai!</h2>
                <p className="text-green-100 font-medium text-lg mb-1">Terima kasih, {userName}!</p>
                <p className="text-green-200/60 mb-6 text-sm leading-relaxed">Selamat beristirahat.</p>
                <div className="flex items-center justify-center gap-2 text-emerald-400 bg-emerald-900/30 py-2 px-4 rounded-full text-xs font-bold w-fit mx-auto">
                    <Moon size={12}/> Sampai Jumpa Besok
                </div>
             </div>
        ) : (
             /* LOGIC TOMBOL */
             step === 'READY' && (
                <div className="w-full space-y-4 animate-in slide-in-from-bottom-5">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-xs bg-slate-800/50 py-1 px-3 rounded-full w-fit mx-auto">
                        <MapPin size={12}/> Lokasi Terjangkau
                    </div>

                    {isLate ? (
                         <div className="w-full bg-slate-800 text-slate-500 font-bold py-5 rounded-2xl border border-slate-700 flex flex-col items-center justify-center gap-2 cursor-not-allowed">
                            <Lock size={32} className="text-red-500/50" />
                            <span>Absen Masuk Ditutup (Lewat 12:00)</span>
                        </div>
                    ) : (
                        <button onClick={handleStartButton} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-3 transition active:scale-95 text-lg group">
                            <div className="bg-white/20 p-2 rounded-full group-hover:scale-110 transition"><Camera size={24} /></div>
                            {todayRecord?.check_in ? 'SCAN PULANG' : 'SCAN MASUK'}
                        </button>
                    )}
                </div>
             )
        )}

        {step === 'GPS' && !debugMsg && (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 w-full text-center space-y-4 animate-pulse">
                <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto" />
                <p className="text-slate-400 text-sm">Mencari lokasi...</p>
            </div>
        )}

        <div className={`w-full ${step === 'SCANNING' ? 'block' : 'hidden'} animate-in fade-in`}>
            <div className="relative rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black">
                <div id="reader" className="w-full h-[350px] bg-black object-cover"></div>
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-64 border-2 border-blue-500/50 rounded-lg relative">
                        <div className="w-full h-0.5 bg-blue-500 absolute top-1/2 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse"></div>
                    </div>
                </div>
                <div className="absolute bottom-4 left-0 w-full flex justify-center items-center gap-4 z-20 px-4">
                    <button onClick={switchCamera} className="bg-white/10 backdrop-blur p-3 rounded-full hover:bg-white/20 border border-white/20 active:scale-95 transition"><Repeat size={20} /></button>
                </div>
            </div>
            <button onClick={() => { if (html5QrCodeRef.current?.isScanning) html5QrCodeRef.current.stop().catch(console.error); setStep('READY') }} className="mt-6 w-full py-3 text-slate-400 bg-slate-800 rounded-xl font-bold hover:bg-slate-700 hover:text-white transition">Batalkan</button>
        </div>

        {step === 'EARLY_LEAVE_CHECK' && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                <div className="bg-slate-800 border border-slate-600 w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-4">
                    <div className="flex items-center gap-3 text-amber-400 font-bold text-lg"><AlertTriangle size={24} /> Pulang Awal?</div>
                    <div className="bg-amber-500/10 p-3 rounded-lg text-amber-200/80 text-sm">Sekarang belum jam 15:00. Mohon isi alasan kenapa pulang lebih awal.</div>
                    <textarea className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-amber-500 outline-none h-24" placeholder="Contoh: Izin sakit, jemput anak..." value={earlyLeaveReason} onChange={(e) => setEarlyLeaveReason(e.target.value)}/>
                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setStep('READY')} className="flex-1 py-3 bg-slate-700 rounded-xl font-bold text-slate-300">Batal</button>
                        <button disabled={!earlyLeaveReason.trim()} onClick={() => { setStep('RESULT'); processAttendance(earlyLeaveReason) }} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-white">Konfirmasi</button>
                    </div>
                </div>
             </div>
        )}

        {step === 'WEEKEND_CHECK' && (
             <div className="w-full bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl animate-in zoom-in">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-4 text-lg border-b border-slate-700 pb-4"><Calendar size={24}/> Presensi Hari Libur</div>
                <div className="space-y-3 mb-6">
                    {['Lembur Project', 'Event Kampus', 'Ganti Jam', 'Lainnya'].map((reason) => (
                        <label key={reason} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${weekendReason === reason ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-700/50 border-transparent text-slate-400 hover:bg-slate-700'}`}>
                            <input type="radio" name="reason" value={reason} checked={weekendReason === reason} onChange={(e) => setWeekendReason(e.target.value)} className="w-4 h-4 accent-blue-500"/>{reason}
                        </label>
                    ))}
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setStep('READY')} className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-slate-300">Batal</button>
                    <button onClick={() => startCamera(facingMode)} className="flex-1 bg-blue-600 py-3 rounded-xl font-bold text-white hover:bg-blue-500">Lanjut</button>
                </div>
             </div>
        )}

        {step === 'RESULT' && (
             <div className={`w-full p-8 rounded-3xl text-center border shadow-2xl animate-in zoom-in 
                ${isSuccess 
                    ? (isOvertime ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-green-500/10 border-green-500/50') 
                    : 'bg-red-500/10 border-red-500/50'
                }`}>
                
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 relative
                    ${isSuccess 
                        ? (isOvertime ? 'bg-indigo-500/20 text-indigo-400 ring-4 ring-indigo-500/10' : 'bg-green-500/20 text-green-400 ring-4 ring-green-500/10') 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                    {isSuccess ? (isOvertime ? <Moon size={48} className="fill-indigo-400"/> : <CheckCircle size={48} />) : <XCircle size={48} />}
                    {isSuccess && isOvertime && <Star size={20} className="absolute top-0 right-0 text-yellow-400 fill-yellow-400 animate-bounce"/>}
                </div>

                <h2 className={`text-3xl font-bold mb-2 ${isSuccess ? (isOvertime ? 'text-indigo-300' : 'text-green-400') : 'text-red-400'}`}>
                    {isSuccess ? (isOvertime ? 'Lembur Tercatat!' : 'Berhasil!') : 'Gagal'}
                </h2>
                
                <div className="h-px w-20 bg-white/10 mx-auto my-4"></div>

                {isSuccess && isOvertime ? (
                    <div className="space-y-2">
                        <p className="text-indigo-200 text-lg font-medium">Terima kasih atas dedikasinya, {userName}!</p>
                        <p className="text-slate-400 text-sm flex items-center justify-center gap-1">
                            <Heart size={12} className="text-red-500 fill-red-500"/> Hati-hati di jalan pulang.
                        </p>
                    </div>
                ) : isSuccess ? (
                    <div className="space-y-2">
                        <p className="text-green-200 text-lg font-medium">Terima kasih atas kontribusinya, {userName}!</p>
                        <p className="text-slate-400 text-sm whitespace-pre-line">{status}</p>
                    </div>
                ) : (
                    <p className="text-slate-200 text-lg leading-relaxed whitespace-pre-line font-medium">{status}</p>
                )}

                <button onClick={() => window.location.reload()} className="w-full bg-slate-700 px-6 py-4 rounded-xl font-bold hover:bg-slate-600 transition mt-8 text-white shadow-lg">Tutup</button>
             </div>
        )}

      </main>
      <footer className="p-4 text-center text-xs text-slate-600">&copy; {new Date().getFullYear()} Presensi SDM</footer>
    </div>
  )
}