-- Modération des mouillages proposés : les modérateurs (profiles.is_moderator) voient tout,
-- peuvent valider / rejeter / corriger (UPDATE) et supprimer.
-- A exécuter une fois dans Supabase > SQL Editor (coller le CONTENU, pas le nom du fichier).

create policy "mooring_proposals moderators select"
  on public.mooring_proposals for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_moderator));

create policy "mooring_proposals moderators update"
  on public.mooring_proposals for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_moderator))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_moderator));

create policy "mooring_proposals moderators delete"
  on public.mooring_proposals for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_moderator));
