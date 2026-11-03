import { supabase } from './supabase'
import { rows } from './db'

export interface TeacherScope { classCourseIds: Set<string>; classIds: Set<string> }

// Pour un enseignant : classes et cours qui lui sont affectés (la base applique de toute façon le même filtre via RLS).
export async function teacherScope(profileId: string): Promise<TeacherScope> {
  const t = rows<{ id: string }>(await supabase.from('teachers').select('id').eq('profile_id', profileId))
  if (!t.length) return { classCourseIds: new Set(), classIds: new Set() }
  const cc = rows<{ id: string; class_id: string }>(await supabase.from('class_courses').select('id,class_id').in('teacher_id', t.map((x) => x.id)))
  return { classCourseIds: new Set(cc.map((x) => x.id)), classIds: new Set(cc.map((x) => x.class_id)) }
}
