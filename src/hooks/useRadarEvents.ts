import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { RadarEvent, RadarGoingPreview } from '../types/radar';
import { parseRadarEventDate } from '../utils/radarEventDate';

/** Match EventDetailScreen RSVP + any legacy rows */
const GOING_STATUSES = ['going', 'yes'] as const;

const MAX_GOING_FACE_PILE = 5;

function isUpcoming(dateStr: string | null): boolean {
  // Events with no date shown in Upcoming (undated/open plans)
  if (!dateStr) return true;
  const eventDate = parseRadarEventDate(dateStr);
  if (!eventDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 30);
  return eventDate >= today && eventDate <= horizon;
}

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const eventDate = parseRadarEventDate(dateStr);
  if (!eventDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
}

function isLater(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const eventDate = parseRadarEventDate(dateStr);
  if (!eventDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 30);
  horizon.setHours(0, 0, 0, 0);
  return eventDate > horizon;
}

export function useRadarEvents(myId: string | null) {
  const [upcoming, setUpcoming] = useState<RadarEvent[]>([]);
  const [later, setLater] = useState<RadarEvent[]>([]);
  const [past, setPast] = useState<RadarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!myId) return;

    // Collect all conversation IDs the user is part of
    const [{ data: participantRows }, { data: dmRows }] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', myId),
      supabase
        .from('conversations')
        .select('id')
        .or(`user1_id.eq.${myId},user2_id.eq.${myId}`)
        .eq('is_group', false),
    ]);

    const convIds = [
      ...new Set([
        ...(participantRows ?? []).map((r: any) => r.conversation_id),
        ...(dmRows ?? []).map((r: any) => r.id),
      ]),
    ];

    console.log('[RadarEvents] conversation IDs found:', convIds);

    if (convIds.length === 0) {
      console.log('[RadarEvents] No conversations found for user', myId);
      setUpcoming([]);
      setLater([]);
      setPast([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Fetch all events in the user's conversations — date filtering done client-side
    // because dates are stored as human-readable strings ("Friday, April 10"), not ISO
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, time, location, image_url, conversation_id, created_by, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    console.log('[RadarEvents] events query result:', eventsData, 'error:', eventsError);

    if (!eventsData || eventsData.length === 0) {
      setUpcoming([]);
      setLater([]);
      setPast([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Fetch group names and avatars
    const uniqueConvIds = [...new Set(eventsData.map((e: any) => e.conversation_id))];
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, name, avatar_url')
      .in('id', uniqueConvIds);
    const convMap: Record<string, string> = {};
    const convImageMap: Record<string, string | null> = {};
    for (const c of convData ?? []) {
      convMap[c.id] = c.name;
      convImageMap[c.id] = c.avatar_url ?? null;
    }

    const eventIds = eventsData.map((e: any) => e.id);
    const { data: rsvpRows } = await supabase
      .from('event_rsvps')
      .select('event_id, user_id, user:users(avatar_url, username)')
      .in('event_id', eventIds)
      .in('status', [...GOING_STATUSES]);

    const rsvpCounts: Record<string, number> = {};
    const goingPreviewByEvent: Record<string, RadarGoingPreview[]> = {};

    for (const row of rsvpRows ?? []) {
      const eid = (row as { event_id: string }).event_id;
      rsvpCounts[eid] = (rsvpCounts[eid] ?? 0) + 1;

      const list = goingPreviewByEvent[eid] ?? [];
      if (list.length >= MAX_GOING_FACE_PILE) continue;

      const rawUser = (row as { user?: unknown }).user;
      const u = (Array.isArray(rawUser) ? rawUser[0] : rawUser) as
        | { avatar_url?: string | null; username?: string | null }
        | null
        | undefined;

      list.push({
        userId: (row as { user_id: string }).user_id,
        avatarUrl: u?.avatar_url ?? null,
        username: u?.username ?? '?',
      });
      goingPreviewByEvent[eid] = list;
    }

    const events: RadarEvent[] = eventsData.map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date ?? null,
      time: e.time ?? null,
      location: e.location ?? null,
      locationLat: null,
      locationLng: null,
      imageUrl: e.image_url ?? null,
      conversationId: e.conversation_id,
      groupName: convMap[e.conversation_id] ?? null,
      groupImageUrl: convImageMap[e.conversation_id] ?? null,
      createdBy: e.created_by,
      createdAt: e.created_at,
      rsvpCount: rsvpCounts[e.id] ?? 0,
      goingPreview: goingPreviewByEvent[e.id] ?? [],
    }));

    setUpcoming(events.filter((e) => isUpcoming(e.date)));
    setLater(events.filter((e) => isLater(e.date)));
    setPast(events.filter((e) => isPast(e.date)));
    setLoading(false);
    setRefreshing(false);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return { upcoming, later, past, loading, refreshing, refresh };
}
