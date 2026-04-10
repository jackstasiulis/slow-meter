import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { fetchProfileLinkCount, fetchProfileLinkPartnerIds } from '../lib/profileLinks';
import ProfileHeroHeader from '../components/profile/ProfileHeroHeader';
import ProfileMaskedBlur from '../components/profile/ProfileMaskedBlur';
import ProfileLinksSheet from '../components/profile/ProfileLinksSheet';
import {
  PROFILE_CARD_HEIGHT,
  PROFILE_CARD_WIDTH,
  PROFILE_GRID_COL_GAP,
  PROFILE_GRID_H_PAD,
  PROFILE_GRID_ROW_GAP,
  PROFILE_HERO_HEIGHT,
  PROFILE_CONTENT_TOP_OFFSET,
  PROFILE_MESSAGE_ACTION_SIZE,
  PROFILE_SCRIM_SCROLL_HEIGHT,
  PROFILE_SCRIM_TOP,
} from '../components/profile/constants';
import { navigateToUserProfile } from '../navigation/navigateToUserProfile';

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  link_count: number;
};

type LinkStatus = 'none' | 'pending_sent' | 'pending_received' | 'linked';

export default function UserProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
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
  const contentGlassTranslateY = Animated.multiply(scrollY, -1);

  // Same fade as own-profile •••: stays visible until the name nears the top, then eases out.
  const overflowFadeStart = Math.round(PROFILE_HERO_HEIGHT * 0.28) + Math.round(insets.top * 0.2);
  const overflowFadeEnd = overflowFadeStart + Math.round(PROFILE_HERO_HEIGHT * 0.09);
  const fixedCloseOpacity = scrollY.interpolate({
    inputRange: [0, overflowFadeStart, overflowFadeEnd],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);

    const [{ data: profileData }, { data: postsData }, linkCount] = await Promise.all([
      supabase.from('users').select('id, username, display_name, avatar_url, cover_url, bio').eq('id', userId).single(),
      supabase.from('posts').select('*, user:users!posts_user_id_fkey(id, username, avatar_url)').eq('user_id', userId).order('created_at', { ascending: false }),
      fetchProfileLinkCount(userId),
    ]);

    setProfile(profileData ? { ...profileData, link_count: linkCount } : null);
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

    const otherIds = await fetchProfileLinkPartnerIds(userId);

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

  function renderLinkPrimary() {
    if (myId === userId) return null;
    switch (linkStatus) {
      case 'none':
        return (
          <TouchableOpacity style={styles.primaryLinkBtn} onPress={sendLinkRequest} disabled={actionLoading}>
            <Text style={styles.linkBtnText}>Link</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <TouchableOpacity style={styles.primaryRequestedBtn} onPress={cancelLinkRequest} disabled={actionLoading}>
            <Text style={styles.requestedBtnText}>Requested</Text>
          </TouchableOpacity>
        );
      case 'pending_received':
        return (
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.acceptBtnWide} onPress={acceptLinkRequest} disabled={actionLoading}>
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineBtnCompact} onPress={declineLinkRequest} disabled={actionLoading}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        );
      case 'linked':
        return (
          <TouchableOpacity style={styles.primaryLinkedBtn} onPress={removeLink} disabled={actionLoading}>
            <Text style={styles.linkedBtnText}>Linked</Text>
          </TouchableOpacity>
        );
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  return (
    <View style={styles.screen}>
      {profile?.cover_url ? (
        <Image source={{ uri: profile.cover_url }} style={styles.backgroundImage} contentFit="cover" />
      ) : (
        <View style={styles.backgroundFallback} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.65)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backgroundGradient}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.contentScrimLayer,
          { transform: [{ translateY: contentGlassTranslateY }] },
        ]}
      >
        <ProfileMaskedBlur />
      </Animated.View>

      {myId != null && myId !== userId ? (
        <Animated.View
          style={[styles.closeBtnWrap, { top: insets.top + 12, opacity: fixedCloseOpacity }]}
        >
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            style={styles.closeBtn}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('MainTabs');
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <Animated.FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[
          styles.gridListContent,
          { paddingTop: PROFILE_CONTENT_TOP_OFFSET, paddingBottom: tabBarHeight + 20 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        style={styles.container}
        ListHeaderComponent={
          <ProfileHeroHeader
            coverUrl={profile?.cover_url}
            avatarUrl={profile?.avatar_url}
            username={profile?.username}
            displayName={profile?.display_name}
            bio={profile?.bio}
            stats={[
              { key: 'posts', value: posts.length, label: 'Posts' },
              { key: 'links', value: profile?.link_count ?? 0, label: 'Links', onPress: openLinks },
            ]}
            actionRow={
              myId === userId ? null : linkStatus === 'pending_received' ? (
                <View style={styles.actions}>{renderLinkPrimary()}</View>
              ) : (
                <View style={styles.actions}>
                  <View style={styles.primaryCtaSlot}>{renderLinkPrimary()}</View>
                  <TouchableOpacity style={styles.messageIconBtn} onPress={openMessage} accessibilityLabel="Message">
                    <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              )
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate('PostDetail', { post: item })}
          >
            <Image source={{ uri: item.media_url }} style={styles.gridImage} contentFit="cover" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      />

      <ProfileLinksSheet
        visible={linksModal}
        users={linkUsers}
        loading={linksLoading}
        onClose={() => setLinksModal(false)}
        onPressUser={(id) => {
          setLinksModal(false);
          navigateToUserProfile(navigation, id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  backgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#222',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  contentScrimLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PROFILE_SCRIM_TOP,
    height: PROFILE_SCRIM_SCROLL_HEIGHT,
    overflow: 'hidden',
  },
  closeBtnWrap: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  primaryCtaSlot: { flex: 1, minWidth: 0 },
  primaryLinkBtn: {
    width: '100%',
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtnText: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  primaryRequestedBtn: {
    width: '100%',
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  requestedBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  primaryLinkedBtn: {
    width: '100%',
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  linkedBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  requestActions: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'center' },
  acceptBtnWide: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  declineBtnCompact: {
    paddingHorizontal: 18,
    minHeight: 46,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  messageIconBtn: {
    width: PROFILE_MESSAGE_ACTION_SIZE,
    height: PROFILE_MESSAGE_ACTION_SIZE,
    borderRadius: PROFILE_MESSAGE_ACTION_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridListContent: { paddingBottom: 24 },
  gridRow: {
    paddingHorizontal: PROFILE_GRID_H_PAD,
    gap: PROFILE_GRID_COL_GAP,
    marginBottom: PROFILE_GRID_ROW_GAP,
  },
  gridItem: {
    width: PROFILE_CARD_WIDTH,
    height: PROFILE_CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e8e8e8',
  },
  gridImage: { width: '100%', height: '100%' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#fff' },
});
