import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { fetchNominatimSearch } from '../lib/nominatim';

type EventDetail = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  description: string | null;
  image_url: string | null;
  conversation_id: string;
  created_by: string;
  created_at: string;
  creator?: { username: string; avatar_url: string | null } | null;
  group_name?: string | null;
};

type RSVP = {
  user_id: string;
  status: string;
  user?: { username: string; avatar_url: string | null };
};

export default function EventDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { eventId } = route.params;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRsvp, setMyRsvp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [locationImageUrl, setLocationImageUrl] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function deleteEvent() {
    Alert.alert('Delete Event?', 'This will permanently remove the event for everyone.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Null out the event_id on any messages referencing this event
          // before deleting to satisfy the foreign key constraint
          const { error: unlinkError } = await supabase
            .from('messages')
            .update({ event_id: null })
            .eq('event_id', eventId);
          if (unlinkError) { Alert.alert('Error', unlinkError.message); return; }

          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) { Alert.alert('Error', error.message); return; }
          navigation.goBack();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);

    const { data: ev } = await supabase
      .from('events')
      .select('id, title, date, time, location, description, image_url, conversation_id, created_by, created_at')
      .eq('id', eventId)
      .single();

    if (ev) {
      // Fetch creator and group name separately to avoid FK name issues
      const [{ data: creator }, { data: conv }] = await Promise.all([
        supabase.from('users').select('username, avatar_url').eq('id', ev.created_by).single(),
        supabase.from('conversations').select('name').eq('id', ev.conversation_id).single(),
      ]);

      setEvent({
        ...ev,
        creator: creator ?? null,
        group_name: conv?.name ?? null,
      });
      navigation.setOptions({
        title: ev.title,
        headerRight: user.id === ev.created_by
          ? () => (
              <TouchableOpacity onPress={deleteEvent} style={{ paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 22, color: '#1a1a1a', fontWeight: '700', letterSpacing: 1 }}>···</Text>
              </TouchableOpacity>
            )
          : undefined,
      });

      // Geocode the location to get coords for a static map
      if (!ev.image_url && ev.location) {
        try {
          const data = await fetchNominatimSearch({ q: ev.location, limit: 1, addressdetails: false });
          if (data[0]) {
            const { lat, lon } = data[0];
            setLocationImageUrl(`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=800x400&markers=${lat},${lon},red-pushpin`);
          }
        } catch { /* no map preview */ }
      }
    }

    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('user_id, status, user:users(username, avatar_url)')
      .eq('event_id', eventId);

    const rsvpList = (rsvpData ?? []) as RSVP[];
    setRsvps(rsvpList);
    const mine = rsvpList.find((r) => r.user_id === user.id);
    setMyRsvp(mine?.status ?? null);
    setLoading(false);
  }

  async function rsvp(status: string) {
    if (!myId || rsvpLoading) return;
    setRsvpLoading(true);
    if (myRsvp === status) {
      // toggle off
      await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', myId);
      setMyRsvp(null);
      setRsvps((prev) => prev.filter((r) => r.user_id !== myId));
    } else {
      await supabase.from('event_rsvps').upsert({ event_id: eventId, user_id: myId, status });
      setMyRsvp(status);
      const { data: me } = await supabase.from('users').select('username, avatar_url').eq('id', myId).single();
      setRsvps((prev) => {
        const without = prev.filter((r) => r.user_id !== myId);
        return [...without, { user_id: myId, status, user: me ?? undefined }];
      });
    }
    setRsvpLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;
  if (!event) return null;

  const going = rsvps.filter((r) => r.status === 'going');
  const maybe = rsvps.filter((r) => r.status === 'maybe');
  const notGoing = rsvps.filter((r) => r.status === 'not_going');

  const heroUri = event.image_url ?? locationImageUrl;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero image */}
      {heroUri ? (
        <Image source={{ uri: heroUri }} style={styles.hero} />
      ) : (
        <View style={styles.heroPlaceholder}>
          <Text style={styles.heroEmoji}>📅</Text>
        </View>
      )}

      {/* Title + group */}
      <View style={styles.titleSection}>
        {event.group_name ? (
          <Text style={styles.groupLabel}>{event.group_name}</Text>
        ) : null}
        <Text style={styles.title}>{event.title}</Text>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        {event.date || event.time ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>📆</Text>
            <Text style={styles.detailText}>
              {[event.date, event.time].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
        {event.location ? (
          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => {
              const query = encodeURIComponent(event.location ?? '');
              const url = Platform.OS === 'ios'
                ? `maps:?q=${query}`
                : `geo:0,0?q=${query}`;
              Linking.openURL(url).catch(() =>
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)
              );
            }}
          >
            <Text style={styles.detailIcon}>📍</Text>
            <Text style={[styles.detailText, styles.detailLink]}>{event.location}</Text>
          </TouchableOpacity>
        ) : null}
        {event.creator ? (
          <TouchableOpacity
            style={styles.detailRow}
            onPress={() => navigation.navigate('UserProfile', { userId: event.created_by })}
          >
            <Text style={styles.detailIcon}>👤</Text>
            <Text style={[styles.detailText, styles.detailLink]}>
              Created by @{event.creator.username}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Description */}
      {event.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      ) : null}

      {/* RSVP buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Are you going?</Text>
        <View style={styles.rsvpRow}>
          <TouchableOpacity
            style={[styles.rsvpBtn, myRsvp === 'going' && styles.rsvpBtnGoing]}
            onPress={() => rsvp('going')}
            disabled={rsvpLoading}
          >
            <Text style={[styles.rsvpBtnText, myRsvp === 'going' && styles.rsvpBtnTextActive]}>
              ✓ Going
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rsvpBtn, myRsvp === 'maybe' && styles.rsvpBtnMaybe]}
            onPress={() => rsvp('maybe')}
            disabled={rsvpLoading}
          >
            <Text style={[styles.rsvpBtnText, myRsvp === 'maybe' && styles.rsvpBtnTextActive]}>
              ? Maybe
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rsvpBtn, myRsvp === 'not_going' && styles.rsvpBtnNo]}
            onPress={() => rsvp('not_going')}
            disabled={rsvpLoading}
          >
            <Text style={[styles.rsvpBtnText, myRsvp === 'not_going' && styles.rsvpBtnTextActive]}>
              ✕ Can't go
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Guest list */}
      {rsvps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {going.length} going{maybe.length > 0 ? ` · ${maybe.length} maybe` : ''}
            {notGoing.length > 0 ? ` · ${notGoing.length} can't go` : ''}
          </Text>
          {going.map((r) => <RsvpRow key={r.user_id} r={r} label="Going" navigation={navigation} />)}
          {maybe.map((r) => <RsvpRow key={r.user_id} r={r} label="Maybe" navigation={navigation} />)}
          {notGoing.map((r) => <RsvpRow key={r.user_id} r={r} label="Can't go" navigation={navigation} />)}
        </View>
      )}

      {/* Go to group chat */}
      <TouchableOpacity
        style={styles.groupBtn}
        onPress={() => navigation.navigate('MainTabs', {
          screen: 'Messages',
          params: {
            screen: 'Conversation',
            params: {
              conversationId: event.conversation_id,
              isGroup: true,
              groupName: event.group_name ?? 'Group',
              otherUsername: event.group_name ?? 'Group',
            },
          },
        })}
      >
        <Text style={styles.groupBtnText}>💬 Go to group chat</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function RsvpRow({ r, label, navigation }: { r: RSVP; label: string; navigation: any }) {
  return (
    <TouchableOpacity
      style={styles.rsvpListRow}
      onPress={() => navigation.navigate('UserProfile', { userId: r.user_id })}
    >
      <View style={styles.rsvpAvatar}>
        {r.user?.avatar_url ? (
          <Image source={{ uri: r.user.avatar_url }} style={styles.rsvpAvatarImg} />
        ) : (
          <Text style={styles.rsvpAvatarInitial}>{r.user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
        )}
      </View>
      <Text style={styles.rsvpUsername}>@{r.user?.username}</Text>
      <Text style={styles.rsvpStatusLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { paddingBottom: 40 },
  hero: { width: '100%', height: 220 },
  heroPlaceholder: {
    width: '100%', height: 220, backgroundColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  heroEmoji: { fontSize: 60 },
  titleSection: { padding: 20, paddingBottom: 0 },
  groupLabel: {
    fontSize: 11, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', lineHeight: 32 },
  detailsCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#f0f0f0',
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  detailIcon: { fontSize: 16, marginTop: 1 },
  detailText: { flex: 1, fontSize: 15, color: '#333', lineHeight: 21 },
  detailLink: { color: '#1a1a1a', fontWeight: '600' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  description: { fontSize: 15, color: '#444', lineHeight: 22 },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0', alignItems: 'center',
    backgroundColor: '#fff',
  },
  rsvpBtnGoing: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  rsvpBtnMaybe: { backgroundColor: '#f5a623', borderColor: '#f5a623' },
  rsvpBtnNo: { backgroundColor: '#e0245e', borderColor: '#e0245e' },
  rsvpBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  rsvpBtnTextActive: { color: '#fff' },
  rsvpListRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  rsvpAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  rsvpAvatarImg: { width: 36, height: 36 },
  rsvpAvatarInitial: { fontSize: 13, fontWeight: '600', color: '#888' },
  rsvpUsername: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  rsvpStatusLabel: { fontSize: 12, color: '#aaa' },
  groupBtn: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  groupBtnText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
});
