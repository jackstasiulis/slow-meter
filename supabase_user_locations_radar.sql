-- Radar "Friends Nearby" needs linked users to read each other's shared locations.
--
-- App flow: reads public.links for friend IDs, then public.user_locations where is_sharing = true.
-- If everyone is linked and sharing but nobody appears, RLS is almost always blocking SELECT on
-- other users' rows.
--
-- Prerequisites:
-- - RLS enabled on public.user_locations with policies so users can SELECT/INSERT/UPDATE their
--   own row (user_id = auth.uid()). If you only add the policy below and enable RLS from scratch,
--   uncomment the "own row" block at the bottom first.
--
-- Add this policy so you can SELECT a linked friend's row only when they opted in (is_sharing):

drop policy if exists "user_locations_select_linked_sharing" on public.user_locations;
create policy "user_locations_select_linked_sharing"
  on public.user_locations
  for select
  to authenticated
  using (
    is_sharing = true
    and exists (
      select 1
      from public.links
      where
        (links.user_a_id = auth.uid() and links.user_b_id = user_locations.user_id)
        or (links.user_b_id = auth.uid() and links.user_a_id = user_locations.user_id)
    )
  );

-- Realtime: Dashboard → Database → Publications → include public.user_locations in
-- supabase_realtime if you want live Radar updates.

-- Optional: minimal own-row policies if the table has no RLS yet (comment out if you already have these)
-- alter table public.user_locations enable row level security;
-- drop policy if exists "user_locations_select_self" on public.user_locations;
-- create policy "user_locations_select_self" on public.user_locations
--   for select to authenticated using (user_id = auth.uid());
-- drop policy if exists "user_locations_insert_self" on public.user_locations;
-- create policy "user_locations_insert_self" on public.user_locations
--   for insert to authenticated with check (user_id = auth.uid());
-- drop policy if exists "user_locations_update_self" on public.user_locations;
-- create policy "user_locations_update_self" on public.user_locations
--   for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
