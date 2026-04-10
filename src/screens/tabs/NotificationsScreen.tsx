import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { navigateToUserProfile } from '../../navigation/navigateToUserProfile';

type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'link_request' | 'link_accepted';
  read: boolean;
  created_at: string;
  post_id: string | null;
  actor_id: string | null;
  actor: { username: string; avatar_url: string | null } | null;
};

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => { loadNotifications(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications().finally(() => setRefreshing(false));
  }, []);

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyId(user.id);

    const { data } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, post_id, actor_id, actor:users!notifications_actor_id_fkey(username, avatar_url)')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications((data as any) ?? []);
    setLoading(false);

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  async function handleLinkRequest(actorId: string, accept: boolean) {
    if (!myId) return;
    const { data: req } = await supabase
      .from('link_requests')
      .select('id')
      .eq('sender_id', actorId)
      .eq('receiver_id', myId)
      .eq('status', 'pending')
      .maybeSingle();
    if (!req) return;

    if (accept) {
      await supabase.from('link_requests').update({ status: 'accepted' }).eq('id', req.id);
      const [a, b] = [myId, actorId].sort();
      await supabase.from('links').insert({ user_a_id: a, user_b_id: b });
      await supabase.rpc('increment_link_count', { target_user_id: myId });
      await supabase.rpc('increment_link_count', { target_user_id: actorId });
      await supabase.from('notifications').insert({ recipient_id: actorId, actor_id: myId, type: 'link_accepted' });
      // Update the notification type in the DB so it persists on reload
      await supabase
        .from('notifications')
        .update({ type: 'link_accepted' })
        .eq('recipient_id', myId)
        .eq('actor_id', actorId)
        .eq('type', 'link_request');
      // Mutate in-place immediately so UI reflects without reload
      setNotifications((prev) => prev.map((n) =>
        n.type === 'link_request' && n.actor_id === actorId
          ? { ...n, type: 'link_accepted' as any }
          : n
      ));
    } else {
      await supabase.from('link_requests').update({ status: 'declined' }).eq('id', req.id);
      // Remove declined requests from the list
      setNotifications((prev) => prev.filter((n) => !(n.type === 'link_request' && n.actor_id === actorId)));
    }
  }

  function notifText(type: string) {
    if (type === 'like') return 'liked your post';
    if (type === 'comment') return 'commented on your post';
    if (type === 'follow') return 'started following you';
    if (type === 'link_request') return 'sent you a link request';
    if (type === 'link_accepted') return 'linked you';
    return '';
  }

  function notifIcon(type: string) {
    if (type === 'like') return '♥';
    if (type === 'comment') return '💬';
    if (type === 'follow') return '👤';
    if (type === 'link_request') return '🔗';
    if (type === 'link_accepted') return '🔗';
    return '•';
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtext}>When people like or comment on your posts, you'll see it here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, !item.read && styles.rowUnread]}
            onPress={() => item.actor_id && navigateToUserProfile(navigation, item.actor_id)}
            activeOpacity={item.actor_id ? 0.7 : 1}
          >
            <View style={styles.avatarWrap}>
              {item.actor?.avatar_url ? (
                <Image source={{ uri: item.actor.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>
                    {item.actor?.username?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={styles.badge}>
                <Text style={styles.badgeIcon}>{notifIcon(item.type)}</Text>
              </View>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowContent}>
                <Text style={styles.bold}>@{item.actor?.username}</Text>
                {' '}{notifText(item.type)}
              </Text>
              {item.type === 'link_request' && item.actor_id ? (
                <View style={styles.linkActions}>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleLinkRequest(item.actor_id!, true)}>
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineBtn} onPress={() => handleLinkRequest(item.actor_id!, false)}>
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.rowTime}>{timeAgo(item.created_at)}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
  },
  rowUnread: { backgroundColor: '#f5f0ff' },
  avatarWrap: { position: 'relative', width: 48, height: 48 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '600', color: '#888' },
  badge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 11 },
  rowText: { flex: 1 },
  rowContent: { fontSize: 14, color: '#1a1a1a', lineHeight: 19 },
  bold: { fontWeight: '700' },
  rowTime: { fontSize: 12, color: '#aaa', marginTop: 3 },
  empty: { padding: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  emptySubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  linkActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#1a1a1a', borderRadius: 7 },
  acceptBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  declineBtn: { paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: '#ddd', borderRadius: 7 },
  declineBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
});
