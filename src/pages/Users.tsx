import { useMemo, useState, type FormEvent } from 'react'
import { Copy, KeyRound, Plus, UserCheck, UserX } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { generatePassword, manageUsers } from '../lib/api'
import { dateFr, fullName } from '../lib/format'
import { ROLE_LABELS, type Profile, type Role } from '../lib/types'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Info { id: string; email: string | null; last_sign_in_at: string | null }
interface Cred { name: string; email: string; password: string }

export default function Users() {
  const { profile, can } = useAuth()
  const toast = useToast()
  const isDirector = can('director')
  const creatable: Role[] = isDirector ? ['teacher', 'secretary', 'accountant', 'parent', 'student'] : ['parent', 'student']
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ role: 'teacher' as Role, full_name: '', email: '', phone: '', password: '', teacher_id: '', guardian_id: '', student_id: '' })
  const [children, setChildren] = useState<string[]>([])
  const [childFilter, setChildFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cred, setCred] = useState<Cred | null>(null)
  const [reset, setReset] = useState<Profile | null>(null)
  const [newPwd, setNewPwd] = useState('')

  const { data, loading, error, reload } = useLoad(async () => {
    const [pr, te, gu, st] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('teachers').select('id,full_name,profile_id').order('full_name'),
      supabase.from('guardians').select('id,full_name,profile_id').order('full_name'),
      supabase.from('students').select('id,first_name,last_name,middle_name,matricule,profile_id').order('last_name'),
    ])
    let infos: Info[] = []
    if (isDirector) { try { infos = (await manageUsers<{ users: Info[] }>({ action: 'list' })).users } catch { /* e-mails indisponibles */ } }
    return { profiles: rows<Profile>(pr), teachers: rows<any>(te), guardians: rows<any>(gu), students: rows<any>(st), infos }
  }, [isDirector])

  const free = useMemo(() => ({
    teachers: (data?.teachers ?? []).filter((t: any) => !t.profile_id),
    guardians: (data?.guardians ?? []).filter((g: any) => !g.profile_id),
    students: (data?.students ?? []).filter((s: any) => !s.profile_id),
  }), [data])

  function startNew() {
    setF({ role: creatable[0], full_name: '', email: '', phone: '', password: generatePassword(), teacher_id: '', guardian_id: '', student_id: '' })
    setChildren([]); setChildFilter(''); setErr(null); setOpen(true)
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  function pick(kind: 'teacher_id' | 'guardian_id' | 'student_id', id: string) {
    const name = kind === 'teacher_id' ? free.teachers.find((t: any) => t.id === id)?.full_name
      : kind === 'guardian_id' ? free.guardians.find((g: any) => g.id === id)?.full_name
      : (() => { const s = free.students.find((x: any) => x.id === id); return s ? fullName(s) : '' })()
    setF((p) => ({ ...p, [kind]: id, full_name: name || p.full_name }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.full_name.trim().length < 2) return setErr('Indiquez le nom complet.')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Adresse e-mail invalide.')
    if (f.password.length < 8) return setErr('Le mot de passe doit contenir au moins 8 caractères.')
    if (f.role === 'student' && !f.student_id) return setErr('Choisissez l’élève à qui ce compte appartient.')
    setBusy(true)
    try {
      await manageUsers({
        action: 'create', role: f.role, full_name: f.full_name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, password: f.password,
        teacher_id: f.teacher_id || null, guardian_id: f.guardian_id || null, student_id: f.student_id || null, child_ids: children,
      })
      setCred({ name: f.full_name.trim(), email: f.email.trim().toLowerCase(), password: f.password })
      setOpen(false)
      reload()
    } catch (x) {
      setErr((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: Profile) {
    const { error: e } = await supabase.from('profiles').update({ is_active: !p.is_active }).eq('id', p.id)
    if (e) return toast('error', e.message)
    toast('success', p.is_active ? 'Compte désactivé.' : 'Compte réactivé.')
    reload()
  }

  async function doReset() {
    if (!reset) return
    if (newPwd.length < 8) return toast('error', 'Le mot de passe doit contenir au moins 8 caractères.')
    setBusy(true)
    try {
      await manageUsers({ action: 'reset_password', user_id: reset.id, password: newPwd })
      setCred({ name: reset.full_name, email: data?.infos.find((i) => i.id === reset.id)?.email ?? '', password: newPwd })
      setReset(null)
    } catch (x) { toast('error', (x as Error).message) } finally { setBusy(false) }
  }

  const copy = async (c: Cred) => {
    const text = `SCHOOLIA — ${window.location.origin}\nIdentifiant : ${c.email}\nMot de passe provisoire : ${c.password}`
    try { await navigator.clipboard.writeText(text); toast('success', 'Copié.') } catch { toast('error', 'Copie impossible : notez les identifiants à la main.') }
  }

  const kids = data?.students ?? []
  const filteredKids = kids.filter((s: any) => fullName(s).toLowerCase().includes(childFilter.trim().toLowerCase())).slice(0, 40)

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Comptes d’accès de l’école" actions={<Button onClick={startNew}><Plus className="h-4 w-4" aria-hidden /> Nouveau compte</Button>} />
      <Card>
        {loading ? <Spinner /> : error ? <div className="p-4"><Alert>{error}</Alert></div> : !data?.profiles.length ? <EmptyState title="Aucun utilisateur" /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Nom</th><th className="th">Rôle</th>{isDirector && <th className="th">E-mail</th>}{isDirector && <th className="th">Dernière connexion</th>}<th className="th">Statut</th>{isDirector && <th className="th" />}</tr></thead>
            <tbody className="divide-y divide-marine-100">
              {data.profiles.map((p) => {
                const info = data.infos.find((i) => i.id === p.id)
                return (
                  <tr key={p.id}>
                    <td className="td font-semibold">{p.full_name}{p.id === profile?.id && <span className="ml-2 text-xs text-slate-400">(vous)</span>}</td>
                    <td className="td">{ROLE_LABELS[p.role]}</td>
                    {isDirector && <td className="td">{info?.email ?? '—'}</td>}
                    {isDirector && <td className="td">{info?.last_sign_in_at ? dateFr(info.last_sign_in_at) : 'Jamais'}</td>}
                    <td className="td">{p.is_active ? <Badge tone="ok">Actif</Badge> : <Badge tone="bad">Désactivé</Badge>}</td>
                    {isDirector && (
                      <td className="td text-right whitespace-nowrap">
                        {p.id !== profile?.id && <>
                          <button onClick={() => { setNewPwd(generatePassword()); setReset(p) }} aria-label={`Nouveau mot de passe pour ${p.full_name}`} className="rounded-lg p-2 text-marine hover:bg-marine-50"><KeyRound className="h-4 w-4" /></button>
                          <button onClick={() => void toggleActive(p)} aria-label={p.is_active ? `Désactiver ${p.full_name}` : `Réactiver ${p.full_name}`} className="rounded-lg p-2 text-marine hover:bg-marine-50">{p.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</button>
                        </>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau compte" wide>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Type de compte"><select className="field" value={f.role} onChange={(e) => { setF((p) => ({ ...p, role: e.target.value as Role, teacher_id: '', guardian_id: '', student_id: '' })); setChildren([]) }}>{creatable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>

          {f.role === 'teacher' && <Field label="Fiche enseignant" hint="Choisissez un enseignant déjà créé, ou laissez vide pour en créer un nouveau."><select className="field" value={f.teacher_id} onChange={(e) => pick('teacher_id', e.target.value)}><option value="">Nouvel enseignant</option>{free.teachers.map((t: any) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></Field>}
          {f.role === 'parent' && <>
            <Field label="Fiche parent"><select className="field" value={f.guardian_id} onChange={(e) => pick('guardian_id', e.target.value)}><option value="">Nouveau parent</option>{free.guardians.map((g: any) => <option key={g.id} value={g.id}>{g.full_name}</option>)}</select></Field>
            <Field label="Enfants rattachés" hint={`${children.length} sélectionné(s)`}>
              <input className="field mb-2" placeholder="Filtrer par nom…" value={childFilter} onChange={(e) => setChildFilter(e.target.value)} aria-label="Filtrer les élèves" />
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-marine-100 p-2">
                {filteredKids.length === 0 ? <p className="p-2 text-sm text-slate-400">Aucun élève.</p> : filteredKids.map((s: any) => (
                  <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-papier"><input type="checkbox" className="h-4 w-4" checked={children.includes(s.id)} onChange={(e) => setChildren((c) => e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id))} />{fullName(s)} <span className="text-xs text-slate-400">{s.matricule}</span></label>
                ))}
              </div>
            </Field>
          </>}
          {f.role === 'student' && <Field label="Élève"><select className="field" value={f.student_id} onChange={(e) => pick('student_id', e.target.value)}><option value="">Choisir…</option>{free.students.map((s: any) => <option key={s.id} value={s.id}>{fullName(s)} — {s.matricule}</option>)}</select></Field>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom complet"><input className="field" value={f.full_name} onChange={set('full_name')} /></Field>
            <Field label="Téléphone"><input className="field" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Adresse e-mail (identifiant)"><input className="field" type="email" autoComplete="off" value={f.email} onChange={set('email')} /></Field>
            <Field label="Mot de passe provisoire">
              <div className="flex gap-2"><input className="field font-mono" value={f.password} onChange={set('password')} autoComplete="off" /><Button type="button" variant="secondary" onClick={() => setF((p) => ({ ...p, password: generatePassword() }))}>Générer</Button></div>
            </Field>
          </div>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={busy}>Créer le compte</Button></div>
        </form>
      </Modal>

      <Modal open={reset !== null} onClose={() => setReset(null)} title="Nouveau mot de passe">
        <p className="mb-3 text-sm text-slate-600">Définir un mot de passe provisoire pour <strong>{reset?.full_name}</strong>.</p>
        <Field label="Mot de passe provisoire"><div className="flex gap-2"><input className="field font-mono" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} /><Button type="button" variant="secondary" onClick={() => setNewPwd(generatePassword())}>Générer</Button></div></Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReset(null)}>Annuler</Button><Button loading={busy} onClick={() => void doReset()}>Enregistrer</Button></div>
      </Modal>

      <Modal open={cred !== null} onClose={() => setCred(null)} title="Identifiants à transmettre">
        {cred && <>
          <Alert tone="success">Compte prêt pour <strong>{cred.name}</strong>. Transmettez ces identifiants de façon privée : le mot de passe ne sera plus affiché.</Alert>
          <dl className="mt-4 space-y-2 rounded-lg bg-papier p-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Adresse</dt><dd className="font-mono">{window.location.origin}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Identifiant</dt><dd className="font-mono">{cred.email || '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Mot de passe</dt><dd className="font-mono font-bold">{cred.password}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">La personne pourra le changer dans Paramètres, section « Mot de passe ».</p>
          <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCred(null)}>Fermer</Button><Button onClick={() => void copy(cred)}><Copy className="h-4 w-4" aria-hidden /> Copier</Button></div>
        </>}
      </Modal>
    </>
  )
}
