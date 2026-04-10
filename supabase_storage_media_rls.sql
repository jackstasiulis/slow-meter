-- Fix: cover (and other) uploads fail with "new row violates row level security policy"
-- Run in Supabase SQL Editor (or add via migration).
--
-- Cause is usually storage.objects INSERT/UPDATE policies on bucket `media` that are too
-- narrow (e.g. only `avatar.*` or only `posts/*`), or missing policies for your folder layout.
-- App paths: `{auth.uid()}/avatar.ext`, `{auth.uid()}/cover.ext`, `{auth.uid()}/posts/...`
--
-- 1) Inspect existing policies: Dashboard → Storage → media bucket → Policies
-- 2) If you already have broad "own folder" policies, skip or adjust names below to avoid duplicates.

-- ---------------------------------------------------------------------------
-- storage.objects — allow authenticated users full control under their user-id folder
-- ---------------------------------------------------------------------------

drop policy if exists "media_insert_own_folder" on storage.objects;
create policy "media_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "media_update_own_folder" on storage.objects;
create policy "media_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "media_delete_own_folder" on storage.objects;
create policy "media_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Optional: if objects should be publicly readable via public URL, you may already have:
--   select for anon/authenticated on bucket media
-- If downloads fail in the browser, add a SELECT policy as needed for your setup.

-- ---------------------------------------------------------------------------
-- public.users — ensure the signed-in user can UPDATE their own row (cover_url, etc.)
-- Only apply if your users UPDATE fails after upload succeeds; merge with existing policies.
-- ---------------------------------------------------------------------------

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
