'use server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// --- CONFIG ---
const MIN_WORK_HOURS = 4 // Validasi Server-side

// --- SETUP CLIENT ---
async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { try { cookieStore.set(name, value, options) } catch (error) {} },
        remove(name: string, options: CookieOptions) { try { cookieStore.set(name, '', { ...options, maxAge: 0 }) } catch (error) {} },
      },
    }
  )
}

// ==========================================
// 1. SCAN QR (ABSENSI STAFF)
// ==========================================
export async function handleAttendance(weekendReason?: string) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Sesi habis. Silakan login ulang.' }

  // 1. TENTUKAN NAMA TAMPILAN (Ambil dari Tabel Staff dulu biar sinkron)
  let displayName = user.email?.split('@')[0] || 'Partner'
  
  const { data: staffRecord } = await supabase
    .from('staff')
    .select('name')
    .eq('email', user.email)
    .single()
  
  if (staffRecord) displayName = staffRecord.name

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const day = now.getDay()
  const isWeekend = day === 0 || day === 6

  // Cek Record Hari Ini
  const { data: record, error: fetchError } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_email', user.email) // Cek by Email biar konsisten
    .eq('date', today)
    .single()

  // Handle error selain "Row not found"
  if (fetchError && fetchError.code !== 'PGRST116') return { success: false, message: 'Gagal koneksi database.' }

  // --- LOGIC MASUK ---
  if (!record) {
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id,
      user_email: user.email,
      user_name: displayName,
      date: today,
      check_in: now.toISOString(),
      weekend_reason: weekendReason || null
    })
    
    // Handle Duplicate (Race Condition)
    if (error) {
        if (error.code === '23505') return { success: false, message: 'Anda sudah absen masuk barusan.' }
        return { success: false, message: 'Gagal Masuk: ' + error.message }
    }

    const weekendMsg = isWeekend ? `\n(Lembur Weekend: ${weekendReason})` : ''
    return { success: true, message: `Selamat Pagi, ${displayName}! ☀️\nSemangat berkarya.${weekendMsg}\nAbsen masuk berhasil!` }

  } 
  // --- LOGIC PULANG ---
  else if (record.check_in && !record.check_out) {
    
    // VALIDASI 4 JAM (SERVER SIDE PROTECTOR)
    const checkInTime = new Date(record.check_in).getTime()
    const diffHours = (now.getTime() - checkInTime) / (1000 * 60 * 60)

    if (diffHours < MIN_WORK_HOURS) {
        const remainingMin = Math.ceil((MIN_WORK_HOURS - diffHours) * 60)
        return { success: false, message: `⚠️ Belum 4 Jam Kerja!\nMohon tunggu ${remainingMin} menit lagi untuk absen pulang.` }
    }

    // Hitung Durasi
    const hours = Math.floor(diffHours)
    const minutes = Math.floor((diffHours % 1) * 60)
    const durationStr = `${hours} jam ${minutes} menit`

    const { error } = await supabase.from('attendance').update({
      check_out: now.toISOString(),
      duration: durationStr
    }).eq('id', record.id)

    if (error) return { success: false, message: 'Gagal Absen Pulang.' }
    return { success: true, message: `Terima Kasih, ${displayName}! 👋\nTotal: ${durationStr}.\nHati-hati di jalan pulang!` }
  } else {
    return { success: false, message: '⚠️ Kamu sudah absen pulang hari ini.' }
  }
}

// ==========================================
// 2. UPDATE ABSENSI (ADMIN DASHBOARD)
// ==========================================
export async function updateAttendanceData(formData: any) {
  const supabase = await createSupabaseServer()
  
  // Hitung Durasi Otomatis (Jika Hadir)
  let newDuration = formData.duration
  if (formData.check_in && formData.check_out && formData.work_category !== 'Izin' && formData.work_category !== 'Sakit') {
      const start = new Date(formData.check_in).getTime()
      const end = new Date(formData.check_out).getTime()
      if (end > start) {
          const diffMs = end - start
          const hours = Math.floor(diffMs / (1000 * 60 * 60))
          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
          newDuration = `${hours} jam ${minutes} menit`
      } else {
          newDuration = "Error Waktu"
      }
  } else {
      // Jika Izin/Sakit durasi null atau custom
      newDuration = formData.work_category === 'Izin' || formData.work_category === 'Sakit' ? '0 jam' : null
  }

  // Cari user_id (jika insert baru manual oleh admin)
  let targetUserId = formData.user_id
  if (!targetUserId) {
      // Coba cari dari tabel staff
      const { data: staff } = await supabase.from('staff').select('id').eq('email', formData.user_email).single()
      targetUserId = staff?.id || crypto.randomUUID() // Fallback random jika staff blm terdaftar
  }

  // --- LOGIC UPSERT (Insert or Update) ---
  // Menggunakan Upsert agar aman dari duplikat Unique Key (user_email, date)
  const { error } = await supabase
    .from('attendance')
    .upsert({
        id: formData.id || undefined, // Jika ID ada, dia update. Jika tidak, insert baru.
        user_id: targetUserId,
        user_email: formData.user_email,
        user_name: formData.user_name,
        date: formData.date,
        check_in: formData.check_in,
        check_out: formData.check_out,
        work_category: formData.work_category, // 'Izin', 'Sakit', 'Administrasi'
        task_list: formData.task_list,
        notes: formData.notes, // <--- KETERANGAN IZIN/SAKIT MASUK SINI
        weekend_reason: formData.weekend_reason,
        duration: newDuration
    }, {
        onConflict: 'user_email, date' // <--- KUNCI PENJAGA DUPLIKAT
    })

  if (error) return { success: false, message: 'Gagal Simpan: ' + error.message }

  return { success: true, message: 'Data berhasil disimpan!' }
}

// ==========================================
// 3. DELETE ABSENSI
// ==========================================
export async function deleteAttendanceData(id: string) {
    const supabase = await createSupabaseServer()
    const { error } = await supabase.from('attendance').delete().eq('id', id)
    if (error) return { success: false, message: 'Gagal hapus: ' + error.message }
    return { success: true, message: 'Data berhasil dihapus permanen.' }
}

// ==========================================
// 4. MANAJEMEN STAFF (MASTER DATA)
// ==========================================

export async function addStaff(formData: any) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('staff').insert({
    email: formData.email,
    name: formData.name,
    position: formData.position
  })
  if (error) return { success: false, message: 'Gagal tambah staff: ' + error.message }
  return { success: true, message: 'Staff berhasil ditambahkan!' }
}

export async function updateStaff(formData: any) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('staff').update({
    name: formData.name,
    position: formData.position,
    email: formData.email
  }).eq('id', formData.id)
  if (error) return { success: false, message: 'Gagal update: ' + error.message }
  return { success: true, message: 'Data staff diperbarui!' }
}

export async function deleteStaff(id: string) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) return { success: false, message: 'Gagal hapus: ' + error.message }
  return { success: true, message: 'Staff dihapus dari database.' }
}