import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NearbyFriend } from '../types/radar';
import { distanceKm } from '../utils/haversine';
import { CurrentPosition } from './useLocationSharing';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const MAX_DISTANCE_KM = 50;

export function useNearbyFriends(myId: string | null, myPosition: CurrentPosition) {
  const [nearbyFriends, setNearbyFriends] = useState<NearbyFriend[]>([]);
  const [loading, setLoading] = useState(true);

  // Keep a map of raw location rows keyed by userId for realtime merging
  const locationMapRef = useRef<Record<string, any>>({});
  const friendDataMapRef = useRef<Record<string, { username: string; avatarUrl: string | null }>>({});
  const friendIdSetRef = useRef<Set<string>>(new Set());
  const myPositionRef = useRef(myPosition);

  useEffect(() => {
    myPositionRef.current = myPosition;
    recompute();
  }, [myPosition]);

  useEffect(() => {
    if (!myId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      setLoading(true);

      // 1. Fetch all linked friend IDs
      const { data: linkRows, error: linkError } = await supabase
        .from('links')
        .select('user_a_id, user_b_id')
        .or(`user_a_id.eq.${myId},user_b_id.eq.${myId}`);

      console.log('[Radar] links rows:', linkRows, 'error:', linkError);

      const friendIds = (linkRows ?? []).map((r: any) =>
        r.user_a_id === myId ? r.user_b_id : r.user_a_id
      );

      console.log('[Radar] friend IDs found:', friendIds);

      if (friendIds.length === 0) {
        console.log('[Radar] No linked friends found — accounts must be linked via the link/friend flow first');
        setNearbyFriends([]);
        setLoading(false);
        return;
      }

      friendIdSetRef.current = new Set(friendIds);

      // 2. Fetch location + user data for sharing friends
      const { data: locationRows, error: locError } = await supabase
        .from('user_locations')
        .select('user_id, lat, lng, updated_at, is_sharing')
        .in('user_id', friendIds)
        .eq('is_sharing', true);

      console.log('[Radar] location rows:', locationRows, 'error:', locError);

      const sharingIds = (locationRows ?? []).map((r: any) => r.user_id);

      // 3. Fetch user profiles for those with locations
      let userMap: Record<string, { username: string; avatarUrl: string | null }> = {};
      if (sharingIds.length > 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, username, avatar_url')
          .in('id', sharingIds);
        for (const u of userData ?? []) {
          userMap[u.id] = { username: u.username, avatarUrl: u.avatar_url };
        }
      }

      // Store in refs for realtime updates
      locationMapRef.current = {};
      for (const row of locationRows ?? []) {
        locationMapRef.current[row.user_id] = row;
      }
      friendDataMapRef.current = userMap;

      console.log('[Radar] locationMap after init:', Object.keys(locationMapRef.current));
      console.log('[Radar] friendDataMap after init:', Object.keys(friendDataMapRef.current));
      setLoading(false);
      recompute();

      // 4. Subscribe to realtime updates on user_locations
      channel = supabase
        .channel('radar-friend-locations')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_locations' },
          async (payload: any) => {
            const row = payload.new;
            if (!row || !friendIdSetRef.current.has(row.user_id)) return;

            if (!row.is_sharing) {
              delete locationMapRef.current[row.user_id];
              recompute();
              return;
            }

            // Fetch user data if we don't have it yet
            if (!friendDataMapRef.current[row.user_id]) {
              const { data: userData } = await supabase
                .from('users')
                .select('id, username, avatar_url')
                .eq('id', row.user_id)
                .maybeSingle();
              if (userData) {
                friendDataMapRef.current[row.user_id] = {
                  username: userData.username,
                  avatarUrl: userData.avatar_url,
                };
              }
            }

            locationMapRef.current[row.user_id] = row;
            recompute();
          }
        )
        .subscribe();
    }

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [myId]);

  function recompute() {
    const pos = myPositionRef.current;
    const now = Date.now();

    const friends: NearbyFriend[] = [];

    for (const [userId, row] of Object.entries(locationMapRef.current)) {
      if (!row.is_sharing) continue;

      // Filter out stale positions
      const age = now - new Date(row.updated_at).getTime();
      if (age > TWO_HOURS_MS) continue;

      const userData = friendDataMapRef.current[userId];
      if (!userData) continue;

      let dist = 0;
      if (pos) {
        dist = distanceKm(pos.lat, pos.lng, row.lat, row.lng);
        if (dist > MAX_DISTANCE_KM) continue;
      }

      friends.push({
        userId,
        username: userData.username,
        avatarUrl: userData.avatarUrl,
        lat: row.lat,
        lng: row.lng,
        distanceKm: dist,
        updatedAt: row.updated_at,
      });
    }

    // Sort by distance ascending
    friends.sort((a, b) => a.distanceKm - b.distanceKm);
    setNearbyFriends(friends);
  }

  return { nearbyFriends, loading };
}
