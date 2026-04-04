create table if not exists public.availability_checks (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  preset text not null check (preset in ('tonight', 'tomorrow', 'this_weekend', 'next_week', 'custom')),
  title text not null,
  timezone text,
  range_start timestamptz,
  range_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  availability_check_id uuid not null references public.availability_checks(id) on delete cascade,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort_order integer not null default 0
);

create table if not exists public.availability_votes (
  availability_check_id uuid not null references public.availability_checks(id) on delete cascade,
  availability_slot_id uuid not null references public.availability_slots(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (availability_slot_id, user_id)
);

alter table public.messages
add column if not exists availability_check_id uuid references public.availability_checks(id) on delete set null;

alter table public.messages
add column if not exists deleted_at timestamptz;

alter table public.messages
add column if not exists deleted_by uuid references public.users(id) on delete set null;

create index if not exists availability_checks_conversation_id_idx
  on public.availability_checks (conversation_id, created_at desc);

create index if not exists availability_slots_check_id_sort_idx
  on public.availability_slots (availability_check_id, sort_order);

create index if not exists availability_votes_check_id_idx
  on public.availability_votes (availability_check_id);

alter table public.availability_checks enable row level security;
alter table public.availability_slots enable row level security;
alter table public.availability_votes enable row level security;

create or replace function public.can_access_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and (
        (c.is_group = false and (c.user1_id = auth.uid() or c.user2_id = auth.uid()))
        or exists (
          select 1
          from public.conversation_participants cp
          where cp.conversation_id = c.id
            and cp.user_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "availability_checks_select" on public.availability_checks;
create policy "availability_checks_select"
on public.availability_checks
for select
using (public.can_access_conversation(conversation_id));

drop policy if exists "availability_checks_insert" on public.availability_checks;
create policy "availability_checks_insert"
on public.availability_checks
for insert
with check (
  created_by = auth.uid()
  and public.can_access_conversation(conversation_id)
);

drop policy if exists "availability_checks_delete" on public.availability_checks;
create policy "availability_checks_delete"
on public.availability_checks
for delete
using (created_by = auth.uid());

drop policy if exists "availability_checks_update" on public.availability_checks;
create policy "availability_checks_update"
on public.availability_checks
for update
using (public.can_access_conversation(conversation_id))
with check (public.can_access_conversation(conversation_id));

drop policy if exists "availability_slots_select" on public.availability_slots;
create policy "availability_slots_select"
on public.availability_slots
for select
using (
  exists (
    select 1
    from public.availability_checks ac
    where ac.id = availability_check_id
      and public.can_access_conversation(ac.conversation_id)
  )
);

drop policy if exists "availability_slots_insert" on public.availability_slots;
create policy "availability_slots_insert"
on public.availability_slots
for insert
with check (
  exists (
    select 1
    from public.availability_checks ac
    where ac.id = availability_check_id
      and ac.created_by = auth.uid()
      and public.can_access_conversation(ac.conversation_id)
  )
);

drop policy if exists "availability_votes_select" on public.availability_votes;
create policy "availability_votes_select"
on public.availability_votes
for select
using (
  exists (
    select 1
    from public.availability_checks ac
    where ac.id = availability_check_id
      and public.can_access_conversation(ac.conversation_id)
  )
);

drop policy if exists "availability_votes_insert" on public.availability_votes;
create policy "availability_votes_insert"
on public.availability_votes
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.availability_checks ac
    where ac.id = availability_check_id
      and public.can_access_conversation(ac.conversation_id)
  )
);

drop policy if exists "availability_votes_delete" on public.availability_votes;
create policy "availability_votes_delete"
on public.availability_votes
for delete
using (user_id = auth.uid());
