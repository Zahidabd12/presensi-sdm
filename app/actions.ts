'use server'

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  // 1. TENTUKAN NAMA TAMPILAN
  const emailName = user.email ? user.email.split('@')[0] : 'Partner'
  let displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1)

  // Cek Database untuk nama terakhir
  const { data: lastRecord } = await supabase
    .from('attendance')
    .select('user_name')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (lastRecord && lastRecord.user_name) {
    displayName = lastRecord.user_name
  }

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const day = now.getDay()
  const isWeekend = day === 0 || day === 6

  const { data: record, error: fetchError } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') return { success: false, message: 'Gagal koneksi database.' }

  if (!record) {
    // INSERT MASUK
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id,
      user_email: user.email,
      user_name: displayName,
      date: today,
      check_in: now.toISOString(),
      weekend_reason: weekendReason || null
    })
    
    if (error) return { success: false, message: 'Gagal Masuk: ' + error.message }
    const weekendMsg = isWeekend ? `\n(Lembur Weekend: ${weekendReason})` : ''
    return { success: true, message: `Selamat Pagi, ${displayName}! ☀️\nSemangat berkarya.${weekendMsg}\nAbsen masuk berhasil!` }

  } else if (record.check_in && !record.check_out) {
    // UPDATE PULANG
    const checkInTime = new Date(record.check_in)
    const diffMs = now.getTime() - checkInTime.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
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
  
  // Hitung Durasi Otomatis
  let newDuration = formData.duration
  if (formData.check_in && formData.check_out) {
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
      newDuration = null
  }

  // --- LOGIC: INSERT ATAU UPDATE ---
  if (!formData.id) {
    // A. JIKA TIDAK ADA ID -> INSERT BARU (Manual Input Admin)
    
    // Cari user_id dari history attendance atau staff table
    const { data: historyUser } = await supabase
        .from('attendance')
        .select('user_id')
        .eq('user_email', formData.user_email)
        .limit(1)
        .single()
    
    // Fallback: Jika tidak ada di history, generate random UUID (karena ini input manual admin)
    const userId = historyUser?.user_id || crypto.randomUUID()

    const { error } = await supabase
        .from('attendance')
        .insert({
            user_id: userId, 
            user_email: formData.user_email,
            user_name: formData.user_name,
            date: formData.date,
            check_in: formData.check_in,
            check_out: formData.check_out,
            work_category: formData.work_category,
            task_list: formData.task_list,
            notes: formData.notes,
            weekend_reason: formData.weekend_reason,
            duration: newDuration
        })
    
    if (error) return { success: false, message: 'Gagal Input Baru: ' + error.message }

  } else {
    // B. JIKA ADA ID -> UPDATE DATA LAMA
    const { error } = await supabase
        .from('attendance')
        .update({
        user_name: formData.user_name,
        check_in: formData.check_in,
        check_out: formData.check_out,
        work_category: formData.work_category,
        task_list: formData.task_list,
        notes: formData.notes,
        weekend_reason: formData.weekend_reason,
        duration: newDuration
        })
        .eq('id', formData.id)

    if (error) return { success: false, message: 'Gagal update: ' + error.message }
  }

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
// 4. MANAJEMEN STAFF (MASTER DATA) - BARU!
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