export type Role = 'director' | 'secretary' | 'accountant' | 'teacher' | 'parent' | 'student'

export interface Profile { id: string; school_id: string; full_name: string; phone: string | null; role: Role; is_active: boolean }
export interface School { id: string; name: string; city: string | null; address: string | null; phone: string | null; email: string | null; currency: string }
export interface AcademicYear { id: string; name: string; start_date: string; end_date: string; is_current: boolean }
export interface ClassRow { id: string; name: string; level: string | null; academic_year_id: string; option_id: string | null }
export interface Student {
  id: string; matricule: string; first_name: string; last_name: string; middle_name: string | null
  gender: 'M' | 'F' | null; birth_date: string | null; birth_place: string | null; address: string | null; status: string
}
export interface Enrollment { id: string; student_id: string; class_id: string; academic_year_id: string; status: string }
export interface FeeSchedule { id: string; name: string; amount: number; class_id: string | null; due_date: string | null; academic_year_id: string }
export interface Payment {
  id: string; enrollment_id: string; fee_schedule_id: string | null; amount: number; method: 'cash' | 'mobile_money' | 'bank' | 'other'
  reference: string | null; paid_at: string; receipt_number: string; note: string | null
}
export interface Balance { enrollment_id: string; student_id: string; class_id: string; total_due: number; total_paid: number; remaining: number }

export const ROLE_LABELS: Record<Role, string> = {
  director: 'Directeur', secretary: 'Secrétaire', accountant: 'Comptable', teacher: 'Enseignant', parent: 'Parent', student: 'Élève',
}
export const METHOD_LABELS: Record<Payment['method'], string> = {
  cash: 'Espèces', mobile_money: 'Mobile money', bank: 'Banque', other: 'Autre',
}
export const STAFF_ROLES: Role[] = ['director', 'secretary', 'accountant', 'teacher']
