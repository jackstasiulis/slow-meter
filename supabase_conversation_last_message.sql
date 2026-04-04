-- One round-trip for Messages / Groups list: latest message per conversation (avoids N+1 queries).
-- Run once in Supabase SQL editor. RLS on `messages` still applies.

create or replace function public.last_message_preview_for_conversations(conv_ids uuid[])
returns table (
  conversation_id uuid,
  body text,
  created_at timestamptz,
  deleted_at timestamptz,
  post_id uuid,
  event_id uuid,
  poll_id uuid,
  availability_check_id uuid,
  group_plan_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.conversation_id)
    m.conversation_id,
    m.body,
    m.created_at,
    m.deleted_at,
    m.post_id,
    m.event_id,
    m.poll_id,
    m.availability_check_id,
    m.group_plan_id
  from public.messages m
  where m.conversation_id = any(conv_ids)
  order by m.conversation_id, m.created_at desc;
$$;

grant execute on function public.last_message_preview_for_conversations(uuid[]) to authenticated;
