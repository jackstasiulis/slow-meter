import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TABS = ['Messages', 'Groups', 'Events'] as const;
import { supabase } from '../../lib/supabase';

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
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.avatar}>
        {item.is_group ? (
          item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.groupIcon}>👥</Text>
          )
        ) : item.other_user?.avatar_url ? (
          <Image source={{ uri: item.other_user.avatar_url }} style={styles.avatarImg} />
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
          {item.is_group && (
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

type EventRow = {
  id: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  conversation_id: string;
  group_name: string | null;
  created_at: string;
  created_by: string;
};

export default function MessagesScreen() {
  const navigation = useNavigation<any>();

  // Swipeable tabs
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  function goToTab(index: number) {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
  }

  const [dms, setDms] = useState<ConversationRow[]>([]);
  const [groups, setGroups] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Events tab
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

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

  useFocusEffect(useCallback(() => {
    loadConversations();
  }, []));

  useEffect(() => {
    if (activeIndex === 2) loadEvents();
  }, [activeIndex]);

  function onRefresh() {
    setRefreshing(true);
    loadConversations();
    if (activeIndex === 2) loadEvents();
  }

  async function loadEvents() {
    setEventsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setMyId(user.id);

    const { data } = await supabase
      .from('events')
      .select('id, title, date, time, location, conversation_id, created_at, created_by')
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) { setEvents([]); setEventsLoading(false); return; }

    // Fetch group names separately to avoid nested RLS issues
    const convIds = [...new Set(data.map((e: any) => e.conversation_id))];
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, name')
      .in('id', convIds);
    const convMap: Record<string, string> = {};
    for (const c of convData ?? []) convMap[c.id] = c.name;

    const rows: EventRow[] = data.map((e: any) => ({
      id: e.id,
      title: e.title,
      date: e.date ?? null,
      time: e.time ?? null,
      location: e.location ?? null,
      conversation_id: e.conversation_id,
      group_name: convMap[e.conversation_id] ?? null,
      created_at: e.created_at,
      created_by: e.created_by,
    }));
    setEvents(rows);
    setEventsLoading(false);
  }

  async function loadConversations() {
    const { data: { user } } = await supabase.auth.getUser();
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

    // Load 1:1 DM conversations
    const { data: dmData } = await supabase
      .from('conversations')
      .select(`
        id, created_at, is_group, name, user1_id,
        user1:users!conversations_user1_id_fkey(id, username, avatar_url),
        user2:users!conversations_user2_id_fkey(id, username, avatar_url)
      `)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq('is_group', false);

    // Load group conversations via conversation_participants
    const { data: participantRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

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
      const fallbackRows = await Promise.all(
        allConvs.map(async (c: any) => {
          const { data: msgs } = await supabase
            .from('messages')
            .select('conversation_id, body, created_at, deleted_at, post_id, event_id, poll_id, availability_check_id, group_plan_id')
            .eq('conversation_id', c.id)
            .order('created_at', { ascending: false })
            .limit(1);
          return { id: c.id, msg: msgs?.[0] };
        })
      );
      for (const fr of fallbackRows) {
        if (fr.msg) lastByConv[fr.id] = fr.msg;
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  const indicatorLeft = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH, SCREEN_WIDTH * 2],
    outputRange: ['0%', '33.33%', '66.66%'],
    extrapolate: 'clamp',
  });

  return (
    <>
      <View style={styles.container}>
        {/* Tab header */}
        <View style={styles.tabHeader}>
          {TABS.map((label, i) => (
            <TouchableOpacity key={label} style={styles.tabHeaderBtn} onPress={() => goToTab(i)}>
              <Text style={[styles.tabHeaderText, activeIndex === i && styles.tabHeaderTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          <Animated.View style={[styles.tabIndicator, { left: indicatorLeft }]} />
        </View>

        {/* Action buttons row — only shown when relevant page is active */}
        {activeIndex === 0 && (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewMsg(true)}>
              <Text style={styles.newBtnText}>+ Message</Text>
            </TouchableOpacity>
          </View>
        )}
        {activeIndex === 1 && (
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewGroup(true)}>
              <Text style={styles.newBtnText}>+ Group</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Swipeable pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            {
              useNativeDriver: false,
              listener: (e: any) => {
                const x = e.nativeEvent.contentOffset.x;
                const i = Math.round(x / SCREEN_WIDTH);
                setActiveIndex(i);
              },
            }
          )}
          style={styles.pager}
        >
          {/* Page 0: Messages (DMs) */}
          <View style={styles.page}>
            <FlatList
              data={dms}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

          {/* Page 2: Events */}
          <View style={styles.page}>
            {eventsLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color="#1a1a1a" />
            ) : (
              <FlatList
                data={events}
                keyExtractor={(item) => item.id}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No events yet</Text>
                    <Text style={styles.emptySubtext}>Create an event in a group chat</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.eventRow}
                    onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
                  >
                    <Text style={styles.eventRowEmoji}>📅</Text>
                    <View style={styles.eventRowText}>
                      <View style={styles.eventRowTitleRow}>
                        {item.group_name ? <Text style={styles.eventRowGroup}>{item.group_name}</Text> : null}
                        {item.created_by === myId && (
                          <View style={styles.eventRowYouBadge}>
                            <Text style={styles.eventRowYouText}>You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.eventRowTitle}>{item.title}</Text>
                      {item.date || item.time ? (
                        <Text style={styles.eventRowMeta}>{[item.date, item.time].filter(Boolean).join(' · ')}</Text>
                      ) : null}
                      {item.location ? <Text style={styles.eventRowMeta}>📍 {item.location}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </ScrollView>
      </View>

      {/* New DM modal */}
      <Modal visible={showNewMsg} animationType="slide" transparent onRequestClose={() => setShowNewMsg(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior="padding">
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowNewMsg(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>New Message</Text>
            {searching ? (
              <ActivityIndicator style={{ marginVertical: 20 }} color="#1a1a1a" />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsList}>
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
                placeholderTextColor="#999"
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
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsList}>
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name..."
                placeholderTextColor="#999"
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
                <ActivityIndicator color="#1a1a1a" style={{ marginVertical: 10 }} />
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
                placeholderTextColor="#999"
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
  container: { flex: 1, backgroundColor: '#fafaf8' },
  btnRow: { flexDirection: 'row', gap: 10, margin: 12 },
  newBtn: {
    flex: 1, padding: 14, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  newBtnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  newBtnOutlineText: { color: '#1a1a1a', fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  avatarInitial: { fontSize: 18, fontWeight: '600', color: '#888' },
  groupIcon: { fontSize: 24 },
  rowText: { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowUsername: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  groupBadge: { backgroundColor: '#f0f0f0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  groupBadgeText: { fontSize: 10, fontWeight: '600', color: '#888', letterSpacing: 0.3 },
  lastMessage: { fontSize: 13, color: '#888', marginTop: 2 },
  rowTime: { fontSize: 12, color: '#aaa' },
  empty: { padding: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  emptySubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 12, color: '#1a1a1a' },
  searchBar: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12,
  },
  searchInput: { height: 40, fontSize: 15, color: '#1a1a1a' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  searchAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
  },
  searchInitial: { fontSize: 16, fontWeight: '600', color: '#888' },
  searchUsername: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  searchEmpty: { textAlign: 'center', color: '#aaa', marginTop: 20 },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  resultsList: { maxHeight: 300, backgroundColor: '#fff', paddingHorizontal: 16 },
  groupNameInput: {
    height: 44, backgroundColor: '#f0f0f0', borderRadius: 10,
    paddingHorizontal: 12, fontSize: 15, color: '#1a1a1a', marginBottom: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#fff', fontSize: 13 },
  createBtn: {
    margin: 16, height: 48, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  createBtnDisabled: { backgroundColor: '#ccc' },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tabHeader: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  tabHeaderBtn: { flex: 1, alignItems: 'center', paddingVertical: 13 },
  tabHeaderText: { fontSize: 14, fontWeight: '600', color: '#aaa' },
  tabHeaderTextActive: { color: '#1a1a1a' },
  tabIndicator: {
    position: 'absolute', bottom: 0, height: 2,
    width: '33.33%', backgroundColor: '#1a1a1a', borderRadius: 1,
  },
  pager: { flex: 1 },
  page: { width: SCREEN_WIDTH, flex: 1 },
  eventRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  eventRowYouBadge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  eventRowYouText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
  },
  eventRowEmoji: { fontSize: 24, marginTop: 2 },
  eventRowText: { flex: 1 },
  eventRowGroup: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  eventRowTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  eventRowMeta: { fontSize: 13, color: '#555', marginTop: 2 },
});
