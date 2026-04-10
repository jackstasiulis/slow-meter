import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, ActivityIndicator, KeyboardAvoidingView, RefreshControl, Alert, Animated, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MESSAGES_SUBTAB_KEY = '@slow_meter_messages_subtab';

async function persistMessagesSubTab(index: number) {
  await AsyncStorage.setItem(MESSAGES_SUBTAB_KEY, index === 1 ? 'groups' : 'messages');
}
/**
 * Must match floating dock in App.tsx (`FloatingTabBar` + `FLOATING_TAB_BAR_*`).
 * `useBottomTabBarHeight()` is only the bar height; it ignores the dock’s lift above the home indicator.
 */
const FLOATING_DOCK_HEIGHT = 60;
const FLOATING_DOCK_BOTTOM_OFFSET = -3;
/** Gap from top of dock to FAB bottom. */
const FAB_GAP_ABOVE_DOCK = 12;
/** Space above FAB bottom so list clears the round action button. */
const LIST_PAD_ABOVE_FAB = 58;

const MESSAGE_TABS = [
  { label: 'Messages' as const },
  { label: 'Groups' as const },
] as const;

type ConversationRow = {
  id: string;
  created_at: string;
  is_group: boolean;
  name: string | null;
  created_by?: string;
  avatar_url?: string | null;
  other_user: { id: string; username: string; avatar_url: string | null } | null;
  last_message?: string;
  last_message_at?: string;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function ConvRow({ item, onPress }: { item: ConversationRow; onPress: () => void }) {
  const isGroup = item.is_group;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.avatar, isGroup && styles.groupAvatar]}>
        {isGroup ? (
          item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={[styles.avatarImg, styles.groupAvatarImg]} contentFit="cover" />
          ) : (
            <Text style={styles.groupIcon}>👥</Text>
          )
        ) : item.other_user?.avatar_url ? (
          <Image source={{ uri: item.other_user.avatar_url }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.avatarInitial}>
            {item.other_user?.username?.[0]?.toUpperCase() ?? '?'}
          </Text>
        )}
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowUsername} numberOfLines={1}>
            {item.is_group ? item.name : `@${item.other_user?.username}`}
          </Text>
          {isGroup && (
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>group</Text>
            </View>
          )}
        </View>
        {item.last_message ? (
          <Text style={styles.lastMessage} numberOfLines={1}>{item.last_message}</Text>
        ) : null}
      </View>
      {item.last_message_at && (
        <Text style={styles.rowTime}>{timeAgo(item.last_message_at)}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const topOfDockFromBottom =
    insets.bottom + FLOATING_DOCK_BOTTOM_OFFSET + FLOATING_DOCK_HEIGHT;
  const fabBottomOffset = topOfDockFromBottom + FAB_GAP_ABOVE_DOCK;
  const listBottomPad = fabBottomOffset + LIST_PAD_ABOVE_FAB;

  // Swipeable tabs
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const prevLoadingRef = useRef(true);

  function goToTab(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
    void persistMessagesSubTab(index);
  }

  const [dms, setDms] = useState<ConversationRow[]>([]);
  const [groups, setGroups] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New DM modal
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // New group modal
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [groupResults, setGroupResults] = useState<any[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; username: string }[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      let cancelled = false;
      (async () => {
        const raw = await AsyncStorage.getItem(MESSAGES_SUBTAB_KEY);
        if (cancelled) return;
        const idx = raw === 'groups' ? 1 : 0;
        setActiveIndex(idx);
        requestAnimationFrame(() => {
          if (!cancelled) {
            scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: false });
          }
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Initial load shows a spinner (no pager) — once lists mount, snap pager to the restored sub-tab.
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: activeIndexRef.current * SCREEN_WIDTH, animated: false });
      });
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  function onRefresh() {
    setRefreshing(true);
    loadConversations();
  }

  async function loadConversations() {
    // Session is local/no round-trip; listing your own conversations only needs the user id.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) { setLoading(false); return; }

    function messagePreview(message: any) {
      if (!message) return undefined;
      if (message.deleted_at) return 'Message deleted';
      if (message.body) return message.body;
      if (message.availability_check_id) return 'Availability check';
      if (message.event_id) return 'Event';
      if (message.poll_id) return 'Poll';
      if (message.group_plan_id) return 'Quick plan';
      if (message.post_id) return 'Shared post';
      return undefined;
    }

    // DMs and group membership are independent — run both at once.
    const [dmResult, participantResult] = await Promise.all([
      supabase
        .from('conversations')
        .select(`
          id, created_at, is_group, name, user1_id,
          user1:users!conversations_user1_id_fkey(id, username, avatar_url),
          user2:users!conversations_user2_id_fkey(id, username, avatar_url)
        `)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq('is_group', false),
      supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id),
    ]);

    const dmData = dmResult.data;
    const participantRows = participantResult.data;

    const groupIds = (participantRows ?? []).map((r: any) => r.conversation_id);
    let groupData: any[] = [];
    if (groupIds.length > 0) {
      const { data: gd } = await supabase
        .from('conversations')
        .select('id, created_at, is_group, name, user1_id, avatar_url')
        .in('id', groupIds)
        .eq('is_group', true);
      groupData = gd ?? [];
    }

    const allConvs = [...(dmData ?? []), ...groupData];
    if (allConvs.length === 0) {
      setDms([]); setGroups([]);
      setLoading(false); setRefreshing(false); return;
    }

    const convIdList = allConvs.map((c: any) => c.id);

    const lastByConv: Record<string, any> = {};
    const { data: rpcRows, error: rpcError } = await supabase.rpc('last_message_preview_for_conversations', {
      conv_ids: convIdList,
    });

    if (!rpcError && rpcRows && Array.isArray(rpcRows)) {
      for (const row of rpcRows as any[]) {
        if (row?.conversation_id) lastByConv[row.conversation_id] = row;
      }
    } else {
      // Avoid N sequential round-trips if the RPC is missing or errors (still apply RLS per query).
      const FALLBACK_CHUNK = 8;
      for (let i = 0; i < allConvs.length; i += FALLBACK_CHUNK) {
        const chunk = allConvs.slice(i, i + FALLBACK_CHUNK);
        const fallbackRows = await Promise.all(
          chunk.map(async (c: any) => {
            const { data: msgs } = await supabase
              .from('messages')
              .select('conversation_id, body, created_at, deleted_at, post_id, event_id, poll_id, availability_check_id, group_plan_id')
              .eq('conversation_id', c.id)
              .order('created_at', { ascending: false })
              .limit(1);
            return { id: c.id, msg: msgs?.[0] };
          }),
        );
        for (const fr of fallbackRows) {
          if (fr.msg) lastByConv[fr.id] = fr.msg;
        }
      }
    }

    const rows: ConversationRow[] = allConvs.map((c: any) => {
      const other = c.is_group ? null : (c.user1?.id === user.id ? c.user2 : c.user1);
      const last = lastByConv[c.id];
      return {
        id: c.id,
        created_at: c.created_at,
        is_group: c.is_group ?? false,
        name: c.name ?? null,
        created_by: c.user1_id ?? undefined,
        avatar_url: c.avatar_url ?? null,
        other_user: other,
        last_message: messagePreview(last),
        last_message_at: last?.created_at,
      };
    });

    rows.sort((a, b) => {
      const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tB - tA;
    });

    const filtered = rows.filter((r) => r.last_message_at);
    setDms(filtered.filter((r) => !r.is_group));
    setGroups(filtered.filter((r) => r.is_group));
    setLoading(false);
    setRefreshing(false);
  }


  async function searchUsers(text: string, setter: (r: any[]) => void, busySetter: (v: boolean) => void, excludeIds: string[] = []) {
    if (!text.trim()) { setter([]); return; }
    busySetter(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .ilike('username', `%${text.trim()}%`)
      .neq('id', user?.id ?? '')
      .limit(10);
    setter((data ?? []).filter((u: any) => !excludeIds.includes(u.id)));
    busySetter(false);
  }

  async function openOrCreate(otherUser: { id: string; username: string; avatar_url: string | null }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setShowNewMsg(false);
    setSearchQuery('');
    setSearchResults([]);

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${user.id},user2_id.eq.${otherUser.id}),and(user1_id.eq.${otherUser.id},user2_id.eq.${user.id})`)
      .eq('is_group', false)
      .maybeSingle();

    let convId: string;
    if (existing) {
      convId = existing.id;
    } else {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({ user1_id: user.id, user2_id: otherUser.id })
        .select('id')
        .single();
      if (error || !newConv) return;
      convId = newConv.id;
    }

    navigation.navigate('Conversation', {
      conversationId: convId,
      otherUserId: otherUser.id,
      otherUsername: otherUser.username,
    });
  }

  function addGroupMember(u: { id: string; username: string }) {
    if (groupMembers.find((m) => m.id === u.id)) return;
    setGroupMembers((prev) => [...prev, u]);
    setGroupQuery('');
    setGroupResults([]);
  }

  function removeGroupMember(id: string) {
    setGroupMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function createGroup() {
    if (groupMembers.length < 1) return;
    setCreatingGroup(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreatingGroup(false); return; }

    const autoName = groupName.trim() ||
      [{ username: (await supabase.auth.getUser()).data.user?.email?.split('@')[0] ?? 'me' }, ...groupMembers]
        .map((m: any) => m.username).join(', ');

    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({ is_group: true, name: autoName, user1_id: user.id, user2_id: user.id, created_by: user.id })
      .select('id')
      .single();
    if (convError || !newConv) {
      Alert.alert('Error creating group', convError?.message ?? 'Unknown error');
      setCreatingGroup(false);
      return;
    }

    const participants = [user.id, ...groupMembers.map((m) => m.id)].map((uid) => ({
      conversation_id: newConv.id,
      user_id: uid,
    }));
    const { error: participantsError } = await supabase.from('conversation_participants').insert(participants);
    if (participantsError) {
      Alert.alert('Error adding members', participantsError.message);
      setCreatingGroup(false);
      return;
    }

    setCreatingGroup(false);
    setShowNewGroup(false);
    setGroupName('');
    setGroupMembers([]);
    setGroupQuery('');
    setGroupResults([]);

    navigation.navigate('Conversation', {
      conversationId: newConv.id,
      otherUsername: autoName,
      isGroup: true,
      groupName: autoName,
      groupAvatarUrl: null,
    });
  }

  function navToConv(item: ConversationRow) {
    navigation.navigate('Conversation', {
      conversationId: item.id,
      otherUserId: item.other_user?.id,
      otherUsername: item.is_group ? item.name : item.other_user?.username,
      isGroup: item.is_group,
      groupName: item.name,
      groupAvatarUrl: item.avatar_url ?? null,
    });
  }

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#08090a' }} color="#fff" />;

  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH],
    outputRange: [3, SCREEN_WIDTH / 2 - 16],
    extrapolate: 'clamp',
  });

  const fabIconName = activeIndex === 0 ? 'chatbubble-outline' : 'people-outline';

  return (
    <>
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient
          colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0)']}
          locations={[0, 0.34, 1]}
          style={styles.screenGradient}
          pointerEvents="none"
        />

        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>

        <View style={styles.tabHeader}>
          <Animated.View style={[styles.tabSegmentActive, { left: indicatorLeft }]} />
          {MESSAGE_TABS.map((tab, i) => (
            <TouchableOpacity key={tab.label} style={styles.tabHeaderBtn} onPress={() => goToTab(i)}>
              <Text style={[styles.tabHeaderText, activeIndex === i && styles.tabHeaderTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Swipeable pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setActiveIndex(i);
            void persistMessagesSubTab(i);
          }}
          style={styles.pager}
        >
          {/* Page 0: Direct messages */}
          <View style={styles.page}>
            <FlatList
              data={dms}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listWithFabPad, { paddingBottom: listBottomPad, paddingTop: 14 }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptySubtext}>Start a conversation with someone you follow</Text>
                </View>
              }
              renderItem={({ item }) => (
                <ConvRow item={item} onPress={() => navToConv(item)} />
              )}
            />
          </View>

          {/* Page 1: Groups */}
          <View style={styles.page}>
            <FlatList
              data={groups}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listWithFabPad, { paddingBottom: listBottomPad, paddingTop: 14 }]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No groups yet</Text>
                  <Text style={styles.emptySubtext}>Create a group to chat with multiple people</Text>
                </View>
              }
              renderItem={({ item }) => (
                <ConvRow item={item} onPress={() => navToConv(item)} />
              )}
            />
          </View>

        </ScrollView>

        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottomOffset }]}
          onPress={activeIndex === 0 ? () => setShowNewMsg(true) : () => setShowNewGroup(true)}
          activeOpacity={0.85}
          accessibilityLabel={activeIndex === 0 ? 'New message' : 'New group'}
          accessibilityRole="button"
        >
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.fabTint} />
          <Ionicons name={fabIconName} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* New DM modal */}
      <Modal visible={showNewMsg} animationType="slide" transparent onRequestClose={() => setShowNewMsg(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior="padding">
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowNewMsg(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New Message</Text>
            {searching ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color="#fff" />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.resultsList}>
                {searchResults.length === 0 && searchQuery.trim().length > 0 && (
                  <Text style={styles.searchEmpty}>No users found</Text>
                )}
                {searchResults.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.searchRow} onPress={() => openOrCreate(item)}>
                    <View style={styles.searchAvatar}>
                      <Text style={styles.searchInitial}>{item.username[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.searchUsername}>@{item.username}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={searchQuery}
                onChangeText={(t) => { setSearchQuery(t); searchUsers(t, setSearchResults, setSearching); }}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Group modal */}
      <Modal visible={showNewGroup} animationType="slide" transparent onRequestClose={() => setShowNewGroup(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior="padding">
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowNewGroup(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New Group</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.resultsList}>
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={groupName}
                onChangeText={setGroupName}
              />
              {groupMembers.length > 0 && (
                <View style={styles.chips}>
                  {groupMembers.map((m) => (
                    <TouchableOpacity key={m.id} style={styles.chip} onPress={() => removeGroupMember(m.id)}>
                      <Text style={styles.chipText}>@{m.username} ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {groupSearching ? (
                <ActivityIndicator color="#fff" style={{ marginVertical: 10 }} />
              ) : (
                groupResults.map((u) => (
                  <TouchableOpacity key={u.id} style={styles.searchRow} onPress={() => addGroupMember(u)}>
                    <View style={styles.searchAvatar}>
                      <Text style={styles.searchInitial}>{u.username[0]?.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.searchUsername}>@{u.username}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Add people..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={groupQuery}
                onChangeText={(t) => {
                  setGroupQuery(t);
                  searchUsers(t, setGroupResults, setGroupSearching, groupMembers.map((m) => m.id));
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.createBtn, (groupMembers.length < 1 || creatingGroup) && styles.createBtnDisabled]}
              onPress={createGroup}
              disabled={groupMembers.length < 1 || creatingGroup}
            >
              {creatingGroup
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.createBtnText}>Create Group</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08090a' },
  screenGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.7,
  },
  listWithFabPad: {},
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  groupAvatar: {
    width: 58,
    height: 58,
    borderRadius: 16,
  },
  groupAvatarImg: {
    width: 58,
    height: 58,
  },
  avatarImg: { width: 52, height: 52 },
  avatarInitial: { fontSize: 19, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },
  groupIcon: { fontSize: 24 },
  rowText: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowUsername: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.96)' },
  groupBadge: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  groupBadgeText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.82)', letterSpacing: 0.3 },
  lastMessage: { fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 2 },
  rowTime: { fontSize: 12, color: 'rgba(255,255,255,0.58)' },
  empty: { padding: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  emptySubtext: { fontSize: 14, color: 'rgba(255,255,255,0.72)', textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#111215',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 12, color: '#fff' },
  searchBar: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  searchInput: { height: 40, fontSize: 15, color: '#fff' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  searchInitial: { fontSize: 16, fontWeight: '600', color: '#fff' },
  searchUsername: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.94)' },
  searchEmpty: { textAlign: 'center', color: 'rgba(255,255,255,0.62)', marginTop: 20 },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  resultsList: { maxHeight: 300, backgroundColor: 'transparent', paddingHorizontal: 16 },
  groupNameInput: {
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#fff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  chipText: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },
  createBtn: {
    margin: 16,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  createBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.16)' },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    marginHorizontal: 16,
    marginBottom: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  tabHeaderBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    zIndex: 2,
  },
  tabHeaderText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.58)' },
  tabHeaderTextActive: { color: '#fff' },
  tabSegmentActive: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: SCREEN_WIDTH / 2 - 20,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH, flex: 1 },
});
