-- Mouillages proposés par les utilisateurs de La Route des Orques.
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
create table if not exists public.mooring_proposals (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pseudo      text,
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  name        text not null check (char_length(name) between 2 and 80),
  kind        text not null check (kind in ('corps_mort','ponton','deconseille')),
  bottom      text check (bottom in ('sable','vase','roche','herbier')),
  shelter     text[] not null default '{}',
  status      text not null default 'pending' check (status in ('pending','approved','rejected'))
);

alter table public.mooring_proposals enable row level security;

-- Tout utilisateur connecté voit les propositions (sauf les rejetées).
create policy "mooring_proposals_read" on public.mooring_proposals
  for select to authenticated using (status <> 'rejected');

-- On ne peut proposer qu'en son propre nom, et toujours en "pending".
create policy "mooring_proposals_insert" on public.mooring_proposals
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- Chacun peut supprimer ses propres propositions.
create policy "mooring_proposals_delete_own" on public.mooring_proposals
  for delete to authenticated using (user_id = auth.uid());

create index if not exists mooring_proposals_geo on public.mooring_proposals (lat, lon);
