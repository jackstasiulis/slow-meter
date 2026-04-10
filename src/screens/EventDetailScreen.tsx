import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking, Platform, Modal, useWindowDimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { navigateToUserProfile } from '../navigation/navigateToUserProfile';
import { fetchNominatimSearch } from '../lib/nominatim';
import EventDetailMaskedBlur from '../components/event/EventDetailMaskedBlur';

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

const RSVP_GOING = 'going';
const RSVP_NOT = 'not_going';
const RSVP_MAYBE = 'maybe';

export default function EventDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { eventId } = route.params;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrimTranslateY = Animated.multiply(scrollY, -1);
  /** Tall layer so blur keeps covering while scrolling (same idea as `PROFILE_SCRIM_SCROLL_HEIGHT`). */
  const eventScrimScrollHeight = windowHeight + 3400;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRsvp, setMyRsvp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [locationImageUrl, setLocationImageUrl] = useState<string | null>(null);
  const [eventMenuVisible, setEventMenuVisible] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyId(user.id);

    const { data: ev } = await supabase
      .from('events')
      .select('id, title, date, time, location, description, image_url, conversation_id, created_by, created_at')
      .eq('id', eventId)
      .single();

    if (!ev) {
      setEvent(null);
      setRsvps([]);
      setMyRsvp(null);
      setLoading(false);
      return;
    }

    const [{ data: creator }, { data: conv }] = await Promise.all([
      supabase.from('users').select('username, avatar_url').eq('id', ev.created_by).single(),
      supabase.from('conversations').select('name').eq('id', ev.conversation_id).single(),
    ]);

    setEvent({
      ...ev,
      creator: creator ?? null,
      group_name: conv?.name ?? null,
    });

    if (ev.image_url) {
      setLocationImageUrl(null);
    } else if (ev.location) {
      try {
        const data = await fetchNominatimSearch({ q: ev.location, limit: 1, addressdetails: false });
        if (data[0]) {
          const { lat, lon } = data[0];
          setLocationImageUrl(
            `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=800x400&markers=${lat},${lon},red-pushpin`
          );
        } else {
          setLocationImageUrl(null);
        }
      } catch {
        setLocationImageUrl(null);
      }
    } else {
      setLocationImageUrl(null);
    }

    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('user_id, status, user:users(username, avatar_url)')
      .eq('event_id', eventId);

    const rsvpList = (rsvpData ?? []) as unknown as RSVP[];
    setRsvps(rsvpList);
    const mine = rsvpList.find((r) => r.user_id === user.id);
    setMyRsvp(mine?.status ?? null);
    setLoading(false);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function deleteEvent() {
    Alert.alert('Delete Event?', 'This will permanently remove the event for everyone.', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error: unlinkError } = await supabase
            .from('messages')
            .update({ event_id: null })
            .eq('event_id', eventId);
          if (unlinkError) {
            Alert.alert('Error', unlinkError.message);
            return;
          }

          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) {
            Alert.alert('Error', error.message);
            return;
          }
          navigation.goBack();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function rsvp(status: string) {
    if (!myId || rsvpLoading) return;
    setRsvpLoading(true);
    if (myRsvp === status) {
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

  function openMaps() {
    if (!event?.location) return;
    const query = encodeURIComponent(event.location);
    const url = Platform.OS === 'ios' ? `maps:?q=${query}` : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <StatusBar style="light" />
        <ActivityIndicator style={{ flex: 1 }} color="#fff" />
      </View>
    );
  }
  if (!event) return null;

  const going = rsvps.filter((r) => r.status === 'going');
  const maybe = rsvps.filter((r) => r.status === 'maybe');
  const notGoing = rsvps.filter((r) => r.status === 'not_going');
  const heroUri = event.image_url ?? locationImageUrl;
  const isCreator = myId === event.created_by;
  const dateTimeLine = [event.date, event.time].filter(Boolean).join(', ');
  /** Start scrollable content ~⅓ down so the upper area stays clear for the cover. */
  const contentTopPad = Math.round(windowHeight * 0.33);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {heroUri ? (
        <Image source={{ uri: heroUri }} style={styles.bgImage} contentFit="cover" />
      ) : (
        <View style={[styles.bgImage, styles.bgPlaceholder]}>
          <Text style={styles.bgPlaceholderEmoji}>📅</Text>
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bgGradient}
        pointerEvents="none"
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.eventScrimLayer,
          {
            top: contentTopPad,
            height: eventScrimScrollHeight,
            transform: [{ translateY: scrimTranslateY }],
          },
        ]}
      >
        <EventDetailMaskedBlur />
      </Animated.View>

      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 16,
            minHeight: windowHeight + contentTopPad,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <View style={{ height: contentTopPad }} />

        <View style={styles.eventContent}>
        <View style={styles.mainColumn}>
          <View style={styles.titleBlock}>
            {event.group_name ? (
              <Text style={styles.groupCaps} numberOfLines={2}>
                {event.group_name}
              </Text>
            ) : null}
            <Text style={styles.heroTitle}>{event.title}</Text>
            {dateTimeLine ? <Text style={styles.heroMeta}>{dateTimeLine}</Text> : null}
            {event.location ? (
              <TouchableOpacity onPress={openMaps} activeOpacity={0.8}>
                <Text style={[styles.heroMeta, styles.heroMetaLink]}>{event.location}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.rsvpPillOuter}>
            <View style={styles.rsvpPillInner}>
              <RsvpSegment
                label="Going"
                icon="✓"
                selected={myRsvp === RSVP_GOING}
                variant="going"
                disabled={rsvpLoading}
                onPress={() => rsvp(RSVP_GOING)}
              />
              <View style={styles.rsvpDivider} />
              <RsvpSegment
                label="Not Going"
                icon="✕"
                selected={myRsvp === RSVP_NOT}
                variant="notGoing"
                disabled={rsvpLoading}
                onPress={() => rsvp(RSVP_NOT)}
              />
              <View style={styles.rsvpDivider} />
              <RsvpSegment
                label="Maybe"
                icon="?"
                selected={myRsvp === RSVP_MAYBE}
                variant="maybe"
                disabled={rsvpLoading}
                onPress={() => rsvp(RSVP_MAYBE)}
              />
            </View>
          </View>

          <View style={styles.descCard}>
            <TouchableOpacity
              style={styles.hostBlock}
              activeOpacity={0.9}
              onPress={() => navigateToUserProfile(navigation, event.created_by)}
            >
              <View style={styles.hostAvatar}>
                {event.creator?.avatar_url ? (
                  <Image source={{ uri: event.creator.avatar_url }} style={styles.hostAvatarImg} />
                ) : (
                  <Text style={styles.hostAvatarInitial}>
                    {event.creator?.username?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                )}
              </View>
              <Text style={styles.hostedBy}>
                Hosted by @{event.creator?.username ?? 'unknown'}
              </Text>
            </TouchableOpacity>

            {event.description ? (
              <Text style={styles.descriptionInCard}>{event.description}</Text>
            ) : (
              <Text style={styles.descriptionPlaceholder}>No description added yet.</Text>
            )}

            <TouchableOpacity
              style={styles.chatInCard}
              activeOpacity={0.88}
              onPress={() =>
                navigation.navigate('MainTabs', {
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
                })
              }
            >
              <Text style={styles.chatInCardText}>💬 Go to group chat</Text>
            </TouchableOpacity>
          </View>
        </View>

        {rsvps.length > 0 ? (
          <View style={styles.lowerCard}>
            <Text style={styles.lowerCardTitle}>
              {going.length} going
              {maybe.length > 0 ? ` · ${maybe.length} maybe` : ''}
              {notGoing.length > 0 ? ` · ${notGoing.length} can't go` : ''}
            </Text>
            {going.map((r) => (
              <RsvpRow key={r.user_id} r={r} label="Going" navigation={navigation} />
            ))}
            {maybe.map((r) => (
              <RsvpRow key={r.user_id} r={r} label="Maybe" navigation={navigation} />
            ))}
            {notGoing.map((r) => (
              <RsvpRow key={r.user_id} r={r} label="Can't go" navigation={navigation} />
            ))}
          </View>
        ) : null}

        </View>
      </Animated.ScrollView>

      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.1)', 'transparent']}
        locations={[0, 0.45, 1]}
        style={[styles.topBarScrim, { height: insets.top + 88 }]}
        pointerEvents="none"
      />

      <View
        style={[styles.fixedTopBar, { paddingTop: insets.top + 6, paddingHorizontal: 20 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.glassIconBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Text style={styles.glassIconBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {isCreator ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="More options"
            style={styles.glassIconBtn}
            onPress={() => setEventMenuVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.glassOverflow}>•••</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <Modal
        visible={eventMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setEventMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setEventMenuVisible(false)}
          />
          <View style={[styles.menuCard, { top: insets.top + 52 }]}>
            <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuGlassTint} pointerEvents="none" />
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDivider]}
              onPress={() => {
                setEventMenuVisible(false);
                navigation.navigate('EditEvent', { eventId });
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.menuItemText}>Edit event</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setEventMenuVisible(false);
                deleteEvent();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.menuItemDestructive}>Delete event</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RsvpSegment({
  label,
  icon,
  selected,
  variant,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  variant: 'going' | 'notGoing' | 'maybe';
  disabled: boolean;
  onPress: () => void;
}) {
  const activeGreen = variant === 'going' && selected;
  const iconColor = selected
    ? activeGreen
      ? '#32d74b'
      : '#1a1a1a'
    : 'rgba(255,255,255,0.45)';
  const textColor = selected ? (activeGreen ? '#1a8f3a' : '#1a1a1a') : 'rgba(255,255,255,0.92)';

  return (
    <TouchableOpacity
      style={styles.rsvpSegTouchable}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {selected ? (
        <View style={[styles.rsvpSegActivePill, activeGreen && styles.rsvpSegActivePillGoing]}>
          <Text style={[styles.rsvpSegIcon, { color: iconColor }]}>{icon}</Text>
          <Text style={[styles.rsvpSegLabel, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : (
        <View style={styles.rsvpSegInactive}>
          <Text style={[styles.rsvpSegIcon, { color: iconColor }]}>{icon}</Text>
          <Text style={[styles.rsvpSegLabel, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function RsvpRow({ r, label, navigation }: { r: RSVP; label: string; navigation: any }) {
  return (
    <TouchableOpacity
      style={styles.rsvpListRow}
      onPress={() => navigateToUserProfile(navigation, r.user_id)}
      activeOpacity={0.85}
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
  root: {
    flex: 1,
    backgroundColor: '#08090a',
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: '#08090a',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bgPlaceholder: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgPlaceholderEmoji: { fontSize: 72 },
  bgGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  eventScrimLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  topBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  scroll: {
    flex: 1,
    zIndex: 2,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },
  eventContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  mainColumn: {
    paddingBottom: 4,
  },
  fixedTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  glassIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  glassIconBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: -1,
  },
  glassOverflow: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginTop: -2,
    letterSpacing: 0.5,
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
    marginTop: 0,
    marginBottom: 14,
  },
  groupCaps: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 33,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
    paddingHorizontal: 12,
  },
  heroMetaLink: {
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.35)',
  },
  rsvpPillOuter: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rsvpPillInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 46,
  },
  rsvpDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 6,
  },
  rsvpSegTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rsvpSegActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignSelf: 'stretch',
    marginHorizontal: 2,
    flex: 1,
  },
  rsvpSegActivePillGoing: {
    /* same white pill; green accents via text */
  },
  rsvpSegInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    flex: 1,
  },
  rsvpSegIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  rsvpSegLabel: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  descCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hostBlock: {
    alignItems: 'center',
    marginBottom: 0,
  },
  hostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  hostAvatarImg: { width: '100%', height: '100%' },
  hostAvatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  hostedBy: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a89fff',
  },
  chatInCard: {
    alignSelf: 'stretch',
    marginTop: 14,
    marginBottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInCardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  descriptionInCard: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  descriptionPlaceholder: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  lowerCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  lowerCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  rsvpListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rsvpAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rsvpAvatarImg: { width: 38, height: 38 },
  rsvpAvatarInitial: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  rsvpUsername: { flex: 1, fontSize: 15, fontWeight: '600', color: '#fff' },
  rsvpStatusLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuCard: {
    position: 'absolute',
    right: 16,
    minWidth: 188,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  menuGlassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.22)',
  },
  menuItemText: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemDestructive: {
    color: '#ff9a9a',
    fontSize: 15,
    fontWeight: '600',
  },
});
