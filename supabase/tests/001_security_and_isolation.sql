-- SCHOOLIA : suite de tests de sécurité (isolation entre écoles, rôles, finances, facturation).
-- Exécution : coller ce fichier dans Supabase > SQL Editor, puis « Run ».
-- Tout est annulé à la fin (aucune donnée n'est conservée) ; le résultat s'affiche dans le message d'erreur final :
--   « TESTS: n/n réussis »  = tout est bon       |       « ECHECS: … »  = à corriger.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); acc uuid := gen_random_uuid();
  tch uuid := gen_random_uuid(); par uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  sa uuid; sb uuid; y uuid; cls uuid; cls2 uuid; stu uuid; stu2 uuid; enr uuid; enr2 uuid; cc uuid; cc2 uuid; tid uuid; gid uuid; pay uuid; pay2 uuid; per uuid;
  n bigint; ok boolean; tname text; rem_before numeric; rem_after numeric; fails text[] := '{}'; total int := 0; v_plan uuid;
begin
  create temp table t_res (name text, ok boolean) on commit drop;
  create function pg_temp.chk(p_name text, p_ok boolean) returns void language sql security definer as $f$ insert into pg_temp.t_res values (p_name, coalesce(p_ok, false)) $f$;
  create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$ begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; end $f$;
  create function pg_temp.as_postgres() returns void language plpgsql as $f$ begin execute 'reset role'; end $f$;

  insert into auth.users (id, aud, role, email) select x, 'authenticated', 'authenticated', x || '@t.local' from unnest(array[a, b, acc, tch, par, adm]) x;
  insert into public.platform_admins (user_id) values (adm);

  -- École A (directeur a) avec démonstration ; école B (directeur b)
  perform pg_temp.as_user(a);
  sa := public.register_school('Ecole A', 'Directeur A');
  perform public.seed_demo_data();
  perform pg_temp.as_user(b);
  sb := public.register_school('Ecole B', 'Directeur B');
  perform pg_temp.as_postgres();

  select id into y from public.academic_years where school_id = sa and is_current;
  select id into per from public.periods where school_id = sa and sequence = 1;
  select id into cls from public.classes where school_id = sa and academic_year_id = y order by name limit 1;
  select id into cls2 from public.classes where school_id = sa and academic_year_id = y order by name desc limit 1;
  select e.id, e.student_id into enr, stu from public.enrollments e where e.class_id = cls limit 1;
  select e.id, e.student_id into enr2, stu2 from public.enrollments e where e.class_id = cls2 limit 1;
  select id into cc from public.class_courses where class_id = cls limit 1;
  select id into cc2 from public.class_courses where class_id = cls2 limit 1;

  -- comptes de l'école A : comptable, enseignant (affecté à cc), parent (de stu)
  insert into public.profiles (id, school_id, full_name, role) values (acc, sa, 'Comptable A', 'accountant'), (tch, sa, 'Prof A', 'teacher'), (par, sa, 'Parent A', 'parent');
  insert into public.teachers (school_id, profile_id, full_name) values (sa, tch, 'Prof A') returning id into tid;
  update public.class_courses set teacher_id = tid where id = cc;
  insert into public.guardians (school_id, full_name, profile_id) values (sa, 'Parent A', par) returning id into gid;
  insert into public.student_guardians (school_id, student_id, guardian_id) values (sa, stu, gid);

  ----------------------------------------------------------------------------------------------------
  -- 1. ISOLATION : l'école B ne voit et ne touche rien de l'école A
  ----------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(b);
  foreach tname in array array['students','enrollments','classes','guardians','student_guardians','teachers','staff','courses','class_courses','timetable_slots','periods','academic_years','options','grades','attendance','fee_schedules','payments','expenses','other_income','notifications','messages','announcements','ai_conversations','ai_messages','audit_logs','profiles'] loop
    execute format('select count(*) from public.%I where school_id <> $1', tname) using sb into n;
    perform pg_temp.chk('B ne voit aucune ligne de A dans ' || tname, n = 0);
  end loop;
  select count(*) into n from public.schools where id <> sb;               perform pg_temp.chk('B ne voit pas la fiche école de A', n = 0);
  select count(*) into n from public.v_student_balances where school_id <> sb; perform pg_temp.chk('B ne voit pas les soldes de A', n = 0);
  select count(*) into n from public.v_absence_summary where school_id <> sb;  perform pg_temp.chk('B ne voit pas les absences de A', n = 0);
  select count(*) into n from public.class_ranking(cls, per);               perform pg_temp.chk('B ne peut pas classer une classe de A', n = 0);
  select count(*) into n from public.student_year_averages(y);              perform pg_temp.chk('B ne voit pas les moyennes de A', n = 0);
  update public.students set first_name = 'Pirate' where id = stu;           get diagnostics n = row_count; perform pg_temp.chk('B ne peut pas modifier un élève de A', n = 0);
  delete from public.classes where id = cls;                                 get diagnostics n = row_count; perform pg_temp.chk('B ne peut pas supprimer une classe de A', n = 0);
  ok := false; begin insert into public.students (school_id, first_name, last_name) values (sa, 'X', 'Y'); exception when others then ok := true; end;
  perform pg_temp.chk('B ne peut pas créer un élève dans A', ok);
  ok := false; begin insert into public.students (first_name, last_name) values ('Z', 'Z'); insert into public.enrollments (student_id, class_id, academic_year_id) select id, cls, y from public.students where first_name = 'Z'; exception when others then ok := true; end;
  perform pg_temp.chk('B ne peut pas inscrire un élève dans une classe de A', ok);
  ok := false; begin perform public.publish_announcement('Pirate', 'Message pirate', 'class', cls); exception when others then ok := true; end;
  perform pg_temp.chk('B ne peut pas publier dans une classe de A', ok);

  ----------------------------------------------------------------------------------------------------
  -- 2. ANONYME : aucun accès
  ----------------------------------------------------------------------------------------------------
  perform pg_temp.as_postgres();
  execute 'set local role anon';
  ok := false; begin perform count(*) from public.students; exception when others then ok := true; end;
  perform pg_temp.chk('Un visiteur non connecté ne lit pas les élèves', ok);
  ok := false; begin perform count(*) from public.payments; exception when others then ok := true; end;
  perform pg_temp.chk('Un visiteur non connecté ne lit pas les paiements', ok);
  ok := false; begin perform public.register_school('X', 'Y'); exception when others then ok := true; end;
  perform pg_temp.chk('Un visiteur non connecté ne crée pas d''école', ok);
  perform pg_temp.as_postgres();

  ----------------------------------------------------------------------------------------------------
  -- 3. RÔLES dans l'école A
  ----------------------------------------------------------------------------------------------------
  -- Comptable
  perform pg_temp.as_user(acc);
  select count(*) into n from public.payments;       perform pg_temp.chk('Comptable : lit les paiements', n > 0);
  select count(*) into n from public.grades;         perform pg_temp.chk('Comptable : ne lit pas les notes', n = 0);
  select count(*) into n from public.audit_logs;     perform pg_temp.chk('Comptable : ne lit pas le journal d''audit', n = 0);
  ok := false; begin insert into public.students (first_name, last_name) values ('A', 'B'); exception when others then ok := true; end;
  perform pg_temp.chk('Comptable : ne crée pas d''élève', ok);
  ok := false; begin perform public.admin_stats(); exception when others then ok := true; end;
  perform pg_temp.chk('Comptable : pas d''accès aux statistiques de la plateforme', ok);

  -- Enseignant
  perform pg_temp.as_user(tch);
  select count(*) into n from public.payments;       perform pg_temp.chk('Enseignant : ne lit pas les paiements', n = 0);
  select count(*) into n from public.expenses;       perform pg_temp.chk('Enseignant : ne lit pas les dépenses', n = 0);
  select count(*) into n from public.v_student_balances; perform pg_temp.chk('Enseignant : ne lit pas les soldes', n = 0);
  ok := false; begin insert into public.grades (enrollment_id, class_course_id, period_id, score) values (enr2, cc2, per, 10); exception when others then ok := true; end;
  perform pg_temp.chk('Enseignant : ne note pas un cours qui n''est pas le sien', ok);
  ok := true; begin insert into public.grades (enrollment_id, class_course_id, period_id, score) values (enr, cc, per, 12) on conflict (enrollment_id, class_course_id, period_id) do update set score = 12; exception when others then ok := false; end;
  perform pg_temp.chk('Enseignant : note son propre cours', ok);
  ok := false; begin insert into public.grades (enrollment_id, class_course_id, period_id, score) values (enr, cc, per, 99) on conflict (enrollment_id, class_course_id, period_id) do update set score = 99; exception when others then ok := true; end;
  perform pg_temp.chk('Une note au-dessus du maximum est refusée', ok);
  select count(*) into n from public.grades where class_course_id <> cc; perform pg_temp.chk('Enseignant : ne voit que les notes de ses cours', n = 0);
  ok := false; begin perform public.void_payment(gen_random_uuid(), 'tentative illégitime'); exception when others then ok := true; end;
  perform pg_temp.chk('Enseignant : ne peut pas annuler un paiement', ok);

  -- Parent
  perform pg_temp.as_user(par);
  select count(*) into n from public.students;       perform pg_temp.chk('Parent : ne voit que son enfant', n = 1);
  select count(*) into n from public.students where id <> stu; perform pg_temp.chk('Parent : ne voit aucun autre élève', n = 0);
  select count(*) into n from public.payments where enrollment_id <> enr; perform pg_temp.chk('Parent : ne voit que les paiements de son enfant', n = 0);
  select count(*) into n from public.grades where enrollment_id <> enr;   perform pg_temp.chk('Parent : ne voit que les notes de son enfant', n = 0);
  select count(*) into n from public.attendance where student_id <> stu; perform pg_temp.chk('Parent : ne voit que les absences de son enfant', n = 0);
  select count(*) into n from public.expenses;       perform pg_temp.chk('Parent : ne lit pas les dépenses', n = 0);
  select count(*) into n from public.staff;          perform pg_temp.chk('Parent : ne lit pas le personnel', n = 0);
  select count(*) into n from public.v_student_balances where student_id <> stu; perform pg_temp.chk('Parent : ne voit que le solde de son enfant', n = 0);
  select count(*) into n from public.class_ranking(cls2, per);  perform pg_temp.chk('Parent : ne voit pas le classement d''une autre classe', n = 0);
  ok := false; begin update public.students set first_name = 'Modifié' where id = stu; get diagnostics n = row_count; ok := (n = 0); exception when others then ok := true; end;
  perform pg_temp.chk('Parent : ne modifie pas la fiche de son enfant', ok);
  ok := false; begin perform public.publish_announcement('Pirate', 'Message pirate', 'all', null); exception when others then ok := true; end;
  perform pg_temp.chk('Parent : ne publie pas d''annonce', ok);
  ok := false; begin update public.profiles set role = 'director' where id = par; exception when others then ok := true; end;
  perform pg_temp.chk('Parent : ne peut pas se donner le rôle de directeur', ok);
  ok := false; begin perform public.start_new_academic_year('2099-2100', date '2099-09-01', date '2100-06-30'); exception when others then ok := true; end;
  perform pg_temp.chk('Parent : n''ouvre pas d''année scolaire', ok);

  ----------------------------------------------------------------------------------------------------
  -- 4. FINANCES : paiements non modifiables, annulation avec motif, soldes cohérents
  ----------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(acc);
  select remaining into rem_before from public.v_student_balances where enrollment_id = enr;
  insert into public.payments (enrollment_id, amount, method) values (enr, 10, 'cash') returning id into pay;
  select remaining into rem_after from public.v_student_balances where enrollment_id = enr;
  perform pg_temp.chk('Un paiement réduit le solde', rem_after = greatest(rem_before - 10, 0));
  perform pg_temp.chk('Le reçu est numéroté automatiquement', (select receipt_number from public.payments where id = pay) like 'REC-%');
  ok := false; begin update public.payments set amount = 1 where id = pay; exception when others then ok := true; end;
  perform pg_temp.chk('Un paiement ne peut pas être modifié directement', ok);
  ok := false; begin delete from public.payments where id = pay; get diagnostics n = row_count; ok := (n = 0); exception when others then ok := true; end;
  perform pg_temp.chk('Un paiement ne peut pas être supprimé directement', ok);
  ok := false; begin insert into public.payments (enrollment_id, amount, method, voided_at) values (enr, 5, 'cash', now()); exception when others then ok := true; end;
  perform pg_temp.chk('Un paiement ne peut pas être créé déjà annulé', ok);
  ok := false; begin perform public.void_payment(pay, 'ok'); exception when others then ok := true; end;
  perform pg_temp.chk('L''annulation exige un vrai motif', ok);
  pay2 := public.correct_payment(pay, 25, 'mobile_money', null, 'REF1234', null, 'Montant saisi par erreur');
  select remaining into rem_after from public.v_student_balances where enrollment_id = enr;
  perform pg_temp.chk('La correction remplace le montant dans le solde', rem_after = greatest(rem_before - 25, 0));
  perform pg_temp.chk('Le paiement corrigé est marqué annulé', (select voided_at is not null from public.payments where id = pay));
  perform pg_temp.chk('La correction crée un nouveau reçu', (select receipt_number from public.payments where id = pay2) <> (select receipt_number from public.payments where id = pay));
  perform public.void_payment(pay2, 'Doublon constaté');
  select remaining into rem_after from public.v_student_balances where enrollment_id = enr;
  perform pg_temp.chk('Après annulation, le solde revient à l''initial', rem_after = rem_before);
  ok := false; begin perform public.void_payment(pay2, 'Deuxième annulation'); exception when others then ok := true; end;
  perform pg_temp.chk('Un paiement ne peut pas être annulé deux fois', ok);

  ----------------------------------------------------------------------------------------------------
  -- 5. FACTURATION : droits et suspension
  ----------------------------------------------------------------------------------------------------
  perform pg_temp.as_user(a);
  select id into v_plan from public.plans where code = 'standard';
  perform pg_temp.chk('Directeur : voit les offres', (select count(*) from public.plans) >= 3);
  perform pg_temp.chk('Directeur : voit son abonnement uniquement', (select count(*) from public.subscriptions) = 1);
  ok := false; begin update public.plans set price_monthly = 0 where id = v_plan; get diagnostics n = row_count; ok := (n = 0); exception when others then ok := true; end;
  perform pg_temp.chk('Directeur : ne modifie pas les prix des offres', ok);
  ok := false; begin perform public.admin_extend(sa, 365); exception when others then ok := true; end;
  perform pg_temp.chk('Directeur : ne peut pas se prolonger l''abonnement', ok);
  ok := false; begin perform public.admin_set_suspended(sb, false); exception when others then ok := true; end;
  perform pg_temp.chk('Directeur : ne gère pas les autres écoles', ok);
  perform pg_temp.as_user(acc);
  ok := false; begin perform public.request_subscription(v_plan, 'monthly'); exception when others then ok := true; end;
  perform pg_temp.chk('Comptable : ne souscrit pas un abonnement', ok);
  perform pg_temp.as_user(a);
  perform public.request_subscription(v_plan, 'monthly', false);
  ok := false; begin perform public.admin_confirm_payment(gen_random_uuid()); exception when others then ok := true; end;
  perform pg_temp.chk('Directeur : ne valide pas ses propres paiements', ok);
  perform pg_temp.as_user(adm);
  perform pg_temp.chk('Administrateur plateforme : voit toutes les écoles', (select count(*) from public.admin_list_schools()) >= 2);
  perform pg_temp.chk('Administrateur plateforme : ne lit pas les élèves', (select count(*) from public.students) = 0);
  perform public.admin_set_suspended(sa, true, 'test');
  perform pg_temp.as_user(a);
  select count(*) into n from public.students;
  perform pg_temp.chk('École suspendue : plus aucun accès aux élèves', n = 0);
  perform pg_temp.chk('École suspendue : le directeur voit encore sa facture', (select count(*) from public.invoices) >= 1);
  perform pg_temp.as_user(tch);
  perform pg_temp.chk('École suspendue : l''enseignant ne voit plus rien', (select count(*) from public.students) = 0);

  perform pg_temp.as_postgres();
  select count(*), count(*) filter (where r.ok), coalesce(array_agg(r.name) filter (where not r.ok), '{}') into total, n, fails from t_res r;
  if array_length(fails, 1) is null then
    raise exception 'TESTS: %/% réussis', n, total;
  else
    raise exception 'ECHECS (% sur %): %', total - n, total, array_to_string(fails, ' | ');
  end if;
end $$;
