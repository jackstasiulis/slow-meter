-- Run in Supabase SQL editor (or migrate). Fixes profile "Links" count/list when viewing
-- someone else's profile: direct queries on `links` are filtered by RLS, so viewers only
-- saw edges they participate in (often 1) instead of that user's full link count.

-- True link count for any user (bypasses links RLS).
create or replace function public.profile_link_count(p_profile_user_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.links l
  where l.user_a_id = p_profile_user_id
     or l.user_b_id = p_profile_user_id;
$$;

revoke all on function public.profile_link_count(uuid) from public;
grant execute on function public.profile_link_count(uuid) to authenticated;

-- Partner user ids for the profile "Links" sheet (bypasses links RLS).
create or replace function public.profile_link_partner_ids(p_profile_user_id uuid)
returns table (partner_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select (
    case
      when l.user_a_id = p_profile_user_id then l.user_b_id
      else l.user_a_id
    end
  )::uuid as partner_id
  from public.links l
  where l.user_a_id = p_profile_user_id
     or l.user_b_id = p_profile_user_id;
$$;

revoke all on function public.profile_link_partner_ids(uuid) from public;
grant execute on function public.profile_link_partner_ids(uuid) to authenticated;
