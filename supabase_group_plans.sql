-- Group chat quick plans (timeless mini-plans with Yes/No/Maybe RSVPs)
-- Apply after public.users and public.conversations exist. Uses can_access_conversation from availability migration if present.
--
-- Realtime: in the Supabase dashboard, enable replication for `group_plan_rsvps` (and optionally `messages`)
-- so the client subscription in ConversationScreen receives RSVP updates.

create table if not exists public.reusable_plan_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  location text,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_plans (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  location text,
  details text,
  created_at timestamptz not null default now()
);

-- If you applied an older version of this file (column `place`), migrate to `location` and add `details`.
alter table public.reusable_plan_templates add column if not exists location text;
alter table public.reusable_plan_templates add column if not exists details text;
alter table public.group_plans add column if not exists location text;
alter table public.group_plans add column if not exists details text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reusable_plan_templates' and column_name = 'place'
  ) then
    update public.reusable_plan_templates set location = place where location is null;
    alter table public.reusable_plan_templates drop column place;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_plans' and column_name = 'place'
  ) then
    update public.group_plans set location = place where location is null;
    alter table public.group_plans drop column place;
  end if;
end $$;

create table if not exists public.group_plan_rsvps (
  plan_id uuid not null references public.group_plans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table public.messages
  add column if not exists group_plan_id uuid references public.group_plans(id) on delete set null;

create index if not exists group_plans_conversation_id_idx
  on public.group_plans (conversation_id, created_at desc);

create index if not exists group_plan_rsvps_plan_id_idx
  on public.group_plan_rsvps (plan_id);

create index if not exists reusable_plan_templates_user_id_idx
  on public.reusable_plan_templates (user_id, updated_at desc);

alter table public.reusable_plan_templates enable row level security;
alter table public.group_plans enable row level security;
alter table public.group_plan_rsvps enable row level security;

-- Ensure helper exists (idempotent if already applied with availability)
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

-- --- reusable_plan_templates: private per user ---
drop policy if exists "reusable_plan_templates_select" on public.reusable_plan_templates;
create policy "reusable_plan_templates_select"
on public.reusable_plan_templates
for select
using (user_id = auth.uid());

drop policy if exists "reusable_plan_templates_insert" on public.reusable_plan_templates;
create policy "reusable_plan_templates_insert"
on public.reusable_plan_templates
for insert
with check (user_id = auth.uid());

drop policy if exists "reusable_plan_templates_update" on public.reusable_plan_templates;
create policy "reusable_plan_templates_update"
on public.reusable_plan_templates
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "reusable_plan_templates_delete" on public.reusable_plan_templates;
create policy "reusable_plan_templates_delete"
on public.reusable_plan_templates
for delete
using (user_id = auth.uid());

-- --- group_plans ---
drop policy if exists "group_plans_select" on public.group_plans;
create policy "group_plans_select"
on public.group_plans
for select
using (public.can_access_conversation(conversation_id));

drop policy if exists "group_plans_insert" on public.group_plans;
create policy "group_plans_insert"
on public.group_plans
for insert
with check (
  created_by = auth.uid()
  and public.can_access_conversation(conversation_id)
);

drop policy if exists "group_plans_delete" on public.group_plans;
create policy "group_plans_delete"
on public.group_plans
for delete
using (created_by = auth.uid());

drop policy if exists "group_plans_update" on public.group_plans;
create policy "group_plans_update"
on public.group_plans
for update
using (public.can_access_conversation(conversation_id))
with check (public.can_access_conversation(conversation_id));

-- --- group_plan_rsvps ---
drop policy if exists "group_plan_rsvps_select" on public.group_plan_rsvps;
create policy "group_plan_rsvps_select"
on public.group_plan_rsvps
for select
using (
  exists (
    select 1
    from public.group_plans gp
    where gp.id = plan_id
      and public.can_access_conversation(gp.conversation_id)
  )
);

drop policy if exists "group_plan_rsvps_insert" on public.group_plan_rsvps;
create policy "group_plan_rsvps_insert"
on public.group_plan_rsvps
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_plans gp
    where gp.id = plan_id
      and public.can_access_conversation(gp.conversation_id)
  )
);

drop policy if exists "group_plan_rsvps_update" on public.group_plan_rsvps;
create policy "group_plan_rsvps_update"
on public.group_plan_rsvps
for update
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_plans gp
    where gp.id = plan_id
      and public.can_access_conversation(gp.conversation_id)
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_plans gp
    where gp.id = plan_id
      and public.can_access_conversation(gp.conversation_id)
  )
);

drop policy if exists "group_plan_rsvps_delete" on public.group_plan_rsvps;
create policy "group_plan_rsvps_delete"
on public.group_plan_rsvps
for delete
using (user_id = auth.uid());
