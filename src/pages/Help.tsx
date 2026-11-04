import { useAuth } from '../auth/AuthProvider'
import type { Role } from '../lib/types'
import { Card, PageHeader } from '../components/ui'

interface Section { title: string; roles: Role[]; steps: string[] }

const SECTIONS: Section[] = [
  { title: 'Ajouter un élève', roles: ['director', 'secretary'], steps: ['Menu Élèves, puis « Nouvel élève ».', 'Remplissez les informations. Choisir une classe inscrit l’élève pour l’année en cours.', 'Vous pouvez saisir le nom et le téléphone du parent (facultatif), puis « Enregistrer ».'] },
  { title: 'Inscrire ou réinscrire un élève', roles: ['director', 'secretary'], steps: ['Menu Élèves, puis l’icône crayon sur la ligne de l’élève.', 'Choisissez la classe de l’année en cours, puis « Enregistrer ». Le même écran change un élève de classe.'] },
  { title: 'Donner un accès à un parent', roles: ['director', 'secretary'], steps: ['Menu Utilisateurs, puis « Nouveau compte », type Parent.', 'Choisissez la fiche du parent (ou « Nouveau parent »), cochez ses enfants, saisissez son e-mail.', 'Un mot de passe provisoire est généré : cliquez sur « Créer le compte », copiez les identifiants et transmettez-les au parent.'] },
  { title: 'Ajouter un enseignant et l’affecter à un cours', roles: ['director', 'secretary'], steps: ['Menu Classes et cours, onglet Enseignants, « Nouvel enseignant ».', 'Onglet Cours : choisissez la classe, « Ajouter un cours » (cours, enseignant, coefficient, note maximale).', 'Pour qu’il puisse se connecter : Utilisateurs, « Nouveau compte », type Enseignant (directeur).'] },
  { title: 'Encoder les notes', roles: ['director', 'secretary', 'teacher'], steps: ['Menu Notes : choisissez la classe, le cours et la période.', 'Saisissez la note de chaque élève, puis « Enregistrer les notes ».', 'Une note supérieure au maximum du cours est refusée. Vous pouvez corriger en enregistrant à nouveau.'] },
  { title: 'Faire l’appel', roles: ['director', 'secretary', 'teacher'], steps: ['Menu Présences : choisissez la classe et la date.', 'Tous les élèves sont présents par défaut : changez seulement les absents, retards (avec minutes) ou excusés.', 'Cliquez sur « Enregistrer l’appel ». Un parent ayant un compte reçoit une notification d’absence.'] },
  { title: 'Consulter ou imprimer un bulletin', roles: ['director', 'secretary', 'teacher', 'parent', 'student'], steps: ['Menu Bulletins : choisissez la classe et la période.', 'Le classement affiche la moyenne sur 20, le rang et la mention.', 'Cliquez sur « Bulletin » pour le détail par cours, puis « Imprimer ».'] },
  { title: 'Encaisser un paiement', roles: ['director', 'accountant'], steps: ['Menu Finances : vérifiez d’abord les frais dans l’onglet « Frais scolaires ».', 'Cliquez sur « Encaisser », choisissez l’élève, le montant (paiement partiel possible) et le mode.', 'Un reçu numéroté s’affiche : imprimez-le. Les impayés se suivent dans l’onglet « Soldes élèves ».'] },
  { title: 'Ouvrir une nouvelle année scolaire', roles: ['director'], steps: ['Menu Années scolaires, « Nouvelle année » : nom, dates, et choix de reprendre classes, cours et frais.', 'L’ancienne année est clôturée comme année en cours ; ses données restent consultables.'] },
  { title: 'Faire passer les élèves en classe supérieure', roles: ['director', 'secretary'], steps: ['Menu Années scolaires, section « Passage de classe » : année d’origine et année d’arrivée.', 'Pour chaque classe, choisissez la classe d’arrivée ; ajustez Passe, Redouble ou Sort de l’école pour chaque élève.', '« Valider le passage » crée les inscriptions de la nouvelle année.'] },
  { title: 'Publier une annonce', roles: ['director', 'secretary'], steps: ['Menu Annonces, « Nouvelle annonce » : titre, message et destinataires (toute l’école, personnel, parents, élèves ou une classe).', 'Les destinataires disposant d’un compte reçoivent aussi une notification.'] },
  { title: 'Gérer le personnel et ses responsabilités', roles: ['director'], steps: ['Menu Personnel, « Nouveau membre » : nom, fonction, responsabilités, coordonnées, date d’embauche.'] },
  { title: 'Consulter le journal d’audit', roles: ['director'], steps: ['Menu Journal d’audit : filtrez par sujet, opération ou dates.', 'Cliquez sur une ligne pour voir les valeurs avant et après modification.'] },
  { title: 'Poser une question à Schoolia AI', roles: ['director', 'secretary', 'accountant'], steps: ['Menu Schoolia AI : choisissez une suggestion ou écrivez votre question.', 'Exemples : situation générale, impayés, absences, enseignants n’ayant pas encodé leurs notes.', 'L’assistant consulte les données de l’école selon vos droits et peut produire un rapport imprimable.'] },
  { title: 'Gérer les comptes', roles: ['director'], steps: ['Menu Utilisateurs : la liste montre l’e-mail et la dernière connexion.', 'L’icône clé définit un nouveau mot de passe provisoire ; l’autre icône désactive ou réactive un compte.'] },
  { title: 'Changer mon mot de passe', roles: ['director', 'secretary', 'accountant', 'teacher', 'parent', 'student'], steps: ['Menu Paramètres, section « Mot de passe » : saisissez-le deux fois, puis « Changer le mot de passe ».'] },
  { title: 'Écrire un message', roles: ['director', 'secretary', 'accountant', 'teacher', 'parent', 'student'], steps: ['Menu Messages, « Nouveau message ». Les enseignants, parents et élèves écrivent à l’administration ; la direction peut écrire à chacun.'] },
]

export default function Help() {
  const { can } = useAuth()
  const items = SECTIONS.filter((s) => can(...s.roles))
  return (
    <>
      <PageHeader title="Aide" subtitle="Les démarches courantes, pas à pas" />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((s) => (
          <Card key={s.title} className="p-5">
            <h2 className="mb-2 font-display text-lg font-extrabold text-marine">{s.title}</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{s.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </Card>
        ))}
      </div>
    </>
  )
}
