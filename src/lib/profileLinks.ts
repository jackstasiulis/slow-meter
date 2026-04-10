import { supabase } from './supabase';

/**
 * True link count for a user. Uses SECURITY DEFINER RPC so it matches `links` even when
 * RLS only exposes edges involving the current viewer (which broke other users’ profiles).
 */
export async function fetchProfileLinkCount(profileUserId: string): Promise<number> {
  const { data, error } = await supabase.rpc('profile_link_count', {
    p_profile_user_id: profileUserId,
  });
  if (!error && data != null && !Number.isNaN(Number(data))) {
    return Number(data);
  }
  const { count } = await supabase
    .from('links')
    .select('*', { count: 'exact', head: true })
    .or(`user_a_id.eq.${profileUserId},user_b_id.eq.${profileUserId}`);
  return count ?? 0;
}

/** Partner ids for the profile Links sheet; bypasses RLS when RPC is deployed. */
export async function fetchProfileLinkPartnerIds(profileUserId: string): Promise<string[]> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc('profile_link_partner_ids', {
    p_profile_user_id: profileUserId,
  });
  if (!rpcError && rpcRows && Array.isArray(rpcRows)) {
    return rpcRows.map((r: { partner_id: string }) => r.partner_id);
  }
  const { data: rows } = await supabase
    .from('links')
    .select('user_a_id, user_b_id')
    .or(`user_a_id.eq.${profileUserId},user_b_id.eq.${profileUserId}`);
  return (rows ?? []).map((r: { user_a_id: string; user_b_id: string }) =>
    r.user_a_id === profileUserId ? r.user_b_id : r.user_a_id
  );
}
