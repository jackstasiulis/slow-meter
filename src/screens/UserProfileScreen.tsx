import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  link_count: number;
};

type LinkStatus = 'none' | 'pending_sent' | 'pending_received' | 'linked';

export default function UserProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('none');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [linksModal, setLinksModal] = useState(false);
  const [linkUsers, setLinkUsers] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);

    const [{ data: profileData }, { data: postsData }, { count: lc }] = await Promise.all([
      supabase.from('users').select('id, username, display_name, avatar_url, bio').eq('id', userId).single(),
      supabase.from('posts').select('*, user:users!posts_user_id_fkey(id, username, avatar_url)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('links').select('*', { count: 'exact', head: true }).or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`),
    ]);

    setProfile(profileData ? { ...profileData, link_count: lc ?? 0 } : null);
    setPosts(postsData ?? []);

    // Check link status
    const [a, b] = [user.id, userId].sort();
    const [{ data: linkData }, { data: sentRequest }, { data: receivedRequest }] = await Promise.all([
      supabase.from('links').select('id').eq('user_a_id', a).eq('user_b_id', b).maybeSingle(),
      supabase.from('link_requests').select('id').eq('sender_id', user.id).eq('receiver_id', userId).eq('status', 'pending').maybeSingle(),
      supabase.from('link_requests').select('id').eq('sender_id', userId).eq('receiver_id', user.id).eq('status', 'pending').maybeSingle(),
    ]);

    if (linkData) {
      setLinkStatus('linked');
    } else if (sentRequest) {
      setLinkStatus('pending_sent');
      setPendingRequestId(sentRequest.id);
    } else if (receivedRequest) {
      setLinkStatus('pending_received');
      setPendingRequestId(receivedRequest.id);
    } else {
      setLinkStatus('none');
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [userId]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, []);

  async function openLinks() {
    setLinksModal(true);
    setLinksLoading(true);
    setLinkUsers([]);

    const { data: rows } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

    const otherIds = (rows ?? []).map((r: any) => r.user_a_id === userId ? r.user_b_id : r.user_a_id);

    if (otherIds.length === 0) {
      setLinkUsers([]);
      setLinksLoading(false);
      return;
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', otherIds);

    setLinkUsers(users ?? []);
    setLinksLoading(false);
  }

  async function openMessage() {
    if (!myId) return;
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${myId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${myId})`)
      .eq('is_group', false)
      .maybeSingle();

    let convId: string;
    if (existing) {
      convId = existing.id;
    } else {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({ user1_id: myId, user2_id: userId })
        .select('id')
        .single();
      if (error || !newConv) return;
      convId = newConv.id;
    }

    navigation.navigate('MainTabs', {
      screen: 'Messages',
      params: {
        screen: 'Conversation',
        params: {
          conversationId: convId,
          otherUserId: userId,
          otherUsername: profile?.username,
          isGroup: false,
        },
      },
    });
  }

  async function sendLinkRequest() {
    if (!myId || actionLoading) return;
    setActionLoading(true);

    // Upsert so duplicate requests don't fail silently
    const { data, error } = await supabase
      .from('link_requests')
      .upsert({ sender_id: myId, receiver_id: userId, status: 'pending' }, { onConflict: 'sender_id,receiver_id' })
      .select('id')
      .single();

    if (error) {
      Alert.alert('Error', error.message);
      setActionLoading(false);
      return;
    }

    setPendingRequestId(data.id);
    setLinkStatus('pending_sent');

    const { error: notifError } = await supabase.from('notifications').insert({
      recipient_id: userId,
      actor_id: myId,
      type: 'link_request',
    });
    if (notifError) Alert.alert('Notification error', notifError.message);

    setActionLoading(false);
  }

  async function cancelLinkRequest() {
    if (!myId || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    await supabase.from('link_requests').delete().eq('id', pendingRequestId);
    setLinkStatus('none');
    setPendingRequestId(null);
    setActionLoading(false);
  }

  async function acceptLinkRequest() {
    if (!myId || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    await supabase.from('link_requests').update({ status: 'accepted' }).eq('id', pendingRequestId);
    const [a, b] = [myId, userId].sort();
    await supabase.from('links').insert({ user_a_id: a, user_b_id: b });
    // Increment link_count on both users
    await supabase.rpc('increment_link_count', { target_user_id: myId });
    await supabase.rpc('increment_link_count', { target_user_id: userId });
    setLinkStatus('linked');
    setProfile((p) => p ? { ...p, link_count: (p.link_count ?? 0) + 1 } : p);
    await supabase.from('notifications').insert({
      recipient_id: userId,
      actor_id: myId,
      type: 'link_accepted',
    });
    setActionLoading(false);
  }

  async function declineLinkRequest() {
    if (!myId || !pendingRequestId || actionLoading) return;
    setActionLoading(true);
    await supabase.from('link_requests').update({ status: 'declined' }).eq('id', pendingRequestId);
    setLinkStatus('none');
    setPendingRequestId(null);
    setActionLoading(false);
  }

  async function removeLink() {
    if (!myId || actionLoading) return;
    Alert.alert('Remove Link', `Remove @${profile?.username} from your links?`, [
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          const [a, b] = [myId, userId].sort();
          await supabase.from('links').delete().eq('user_a_id', a).eq('user_b_id', b);
          await supabase.rpc('decrement_link_count', { target_user_id: myId });
          await supabase.rpc('decrement_link_count', { target_user_id: userId });
          setLinkStatus('none');
          setProfile((p) => p ? { ...p, link_count: Math.max(0, (p.link_count ?? 0) - 1) } : p);
          setActionLoading(false);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function renderLinkButton() {
    if (myId === userId) return null;
    switch (linkStatus) {
      case 'none':
        return (
          <TouchableOpacity style={styles.linkBtn} onPress={sendLinkRequest} disabled={actionLoading}>
            <Text style={styles.linkBtnText}>Link</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <TouchableOpacity style={styles.requestedBtn} onPress={cancelLinkRequest} disabled={actionLoading}>
            <Text style={styles.requestedBtnText}>Requested</Text>
          </TouchableOpacity>
        );
      case 'pending_received':
        return (
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.acceptBtn} onPress={acceptLinkRequest} disabled={actionLoading}>
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtn} onPress={declineLinkRequest} disabled={actionLoading}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        );
      case 'linked':
        return (
          <TouchableOpacity style={styles.linkedBtn} onPress={removeLink} disabled={actionLoading}>
            <Text style={styles.linkedBtnText}>Linked</Text>
          </TouchableOpacity>
        );
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.container}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.avatarCircle}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(profile?.username ?? '?')[0].toUpperCase()}
                </Text>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{posts.length}</Text>
                <Text style={styles.statLabel}>posts</Text>
              </View>
              <TouchableOpacity style={styles.stat} onPress={openLinks}>
                <Text style={styles.statNumber}>{profile?.link_count ?? 0}</Text>
                <Text style={styles.statLabel}>links</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.username}>@{profile?.username}</Text>
            {profile?.display_name ? <Text style={styles.displayName}>{profile.display_name}</Text> : null}
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.actions}>
              {renderLinkButton()}
              {myId !== userId && (
                <TouchableOpacity style={styles.messageBtn} onPress={openMessage}>
                  <Text style={styles.messageBtnText}>Message</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate('PostDetail', { post: item })}
          >
            <Image source={{ uri: item.media_url }} style={styles.gridImage} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
      />

      <Modal visible={linksModal} animationType="slide" transparent onRequestClose={() => setLinksModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setLinksModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Links</Text>
            {linksLoading ? (
              <ActivityIndicator color="#1a1a1a" style={{ marginTop: 20 }} />
            ) : linkUsers.length === 0 ? (
              <Text style={styles.emptyList}>No links yet</Text>
            ) : (
              <FlatList
                data={linkUsers}
                keyExtractor={(u) => u.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => { setLinksModal(false); navigation.navigate('UserProfile', { userId: item.id }); }}
                  >
                    <View style={styles.userAvatar}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.userAvatarImg} />
                      ) : (
                        <Text style={styles.userAvatarInitial}>{item.username[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.userUsername}>@{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  header: { padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 2 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, overflow: 'hidden',
  },
  avatar: { width: 88, height: 88 },
  avatarInitial: { fontSize: 36, fontWeight: '600', color: '#888' },
  statsRow: { flexDirection: 'row', gap: 32, marginBottom: 12 },
  stat: { alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  username: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  displayName: { fontSize: 15, color: '#1a1a1a', marginBottom: 4 },
  bio: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  linkBtn: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: '#1a1a1a', borderRadius: 8 },
  linkBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  requestedBtn: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: '#eee', borderRadius: 8 },
  requestedBtnText: { fontSize: 14, fontWeight: '600', color: '#888' },
  linkedBtn: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: '#eee', borderRadius: 8 },
  linkedBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#1a1a1a', borderRadius: 8 },
  acceptBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  declineBtn: { paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#888' },
  messageBtn: { paddingHorizontal: 24, paddingVertical: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  messageBtnText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, margin: 1 },
  gridImage: { width: '100%', height: '100%' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalBackdrop: { flex: 1 },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: 32,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 12, color: '#1a1a1a' },
  listContent: { paddingHorizontal: 16 },
  emptyList: { textAlign: 'center', color: '#aaa', marginTop: 24 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  userAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userAvatarImg: { width: 42, height: 42 },
  userAvatarInitial: { fontSize: 16, fontWeight: '600', color: '#888' },
  userUsername: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
});
