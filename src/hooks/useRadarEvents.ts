import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { RadarEvent } from '../types/radar';
import { parseRadarEventDate } from '../utils/radarEventDate';

function isUpcoming(dateStr: string | null): boolean {
  // Events with no date shown in Upcoming (undated/open plans)
  if (!dateStr) return true;
  const eventDate = parseRadarEventDate(dateStr);
  if (!eventDate) return true; // Unparseable — show rather than hide
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(today.getDate() + 30);
  return eventDate >= today && eventDate <= horizon;
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
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Fetch all events in the user's conversations — date filtering done client-side
    // because dates are stored as human-readable strings ("Friday, April 10"), not ISO
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, time, location, location_lat, location_lng, image_url, conversation_id, created_by, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    console.log('[RadarEvents] events query result:', eventsData, 'error:', eventsError);

    if (!eventsData || eventsData.length === 0) {
      setUpcoming([]);
      setLater([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Fetch group names
    const uniqueConvIds = [...new Set(eventsData.map((e: any) => e.conversation_id))];
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, name')
      .in('id', uniqueConvIds);
    const convMap: Record<string, string> = {};
    for (const c of convData ?? []) convMap[c.id] = c.name;

    // Fetch RSVP counts
    const eventIds = eventsData.map((e: any) => e.id);
    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'yes');
    const rsvpCounts: Record<string, number> = {};
    for (const r of rsvpData ?? []) {
      rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] ?? 0) + 1;
    }

    const events: RadarEvent[] = eventsData.map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date ?? null,
      time: e.time ?? null,
      location: e.location ?? null,
      locationLat: e.location_lat ?? null,
      locationLng: e.location_lng ?? null,
      imageUrl: e.image_url ?? null,
      conversationId: e.conversation_id,
      groupName: convMap[e.conversation_id] ?? null,
      createdBy: e.created_by,
      createdAt: e.created_at,
      rsvpCount: rsvpCounts[e.id] ?? 0,
    }));

    setUpcoming(events.filter((e) => isUpcoming(e.date)));
    setLater(events.filter((e) => isLater(e.date)));
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

  return { upcoming, later, loading, refreshing, refresh };
}
