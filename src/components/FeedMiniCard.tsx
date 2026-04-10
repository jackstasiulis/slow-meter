import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Modal, TextInput, ScrollView, KeyboardAvoidingView, ActivityIndicator, Platform, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Post } from '../types';

type Props = {
  post: Post;
  cardWidth: number;
  imageHeight: number;
  onLikeToggle: (postId: string, liked: boolean) => void;
  onHeightResolved?: (postId: string, height: number) => void;
};

type QuickConv = { id: string; is_group: boolean; label: string; avatar_url?: string | null };

/** Feed masonry only allows two image cell heights so cards never stretch with extreme aspect ratios. */
function standardFeedImageHeight(cardWidth: number, w: number, h: number): number {
  const ar = h / w;
  // Landscape or square (or wider than tall): square cell
  if (ar <= 1) {
    return cardWidth;
  }
  // Portrait: fixed 3:4 frame (height = width × 4/3), image uses cover inside
  return Math.round(cardWidth * (4 / 3));
}

export default function FeedMiniCard({ post, cardWidth, imageHeight, onLikeToggle, onHeightResolved }: Props) {
  const navigation = useNavigation<any>();
  const [liked, setLiked] = useState(post.liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [myId, setMyId] = useState<string | null>(null);
  // Actual rendered image height — resolved from remote image dimensions
  const [resolvedImageHeight, setResolvedImageHeight] = useState(imageHeight);

  // Sync state when parent reloads fresh data (e.g. on screen focus)
  useEffect(() => {
    setLiked(post.liked_by_me ?? false);
    setLikeCount(post.like_count);
  }, [post.liked_by_me, post.like_count]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyId(user.id);
    });
  }, []);

  // Double-tap to like
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  // Share modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendQuery, setSendQuery] = useState('');
  const [sendResults, setSendResults] = useState<{ id: string; username: string }[]>([]);
  const [sendSearching, setSendSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [quickConvs, setQuickConvs] = useState<QuickConv[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const images = post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url];
  const coverImage = images[0];

  // Classify image as square vs portrait slot only — never use raw pixel aspect (avoids huge cards)
  useEffect(() => {
    if (!coverImage) return;
    RNImage.getSize(
      coverImage,
      (w, h) => {
        if (w > 0 && h > 0) {
          const height = standardFeedImageHeight(cardWidth, w, h);
          setResolvedImageHeight(height);
          onHeightResolved?.(post.id, height);
        }
      },
      () => { /* keep prop height as fallback */ },
    );
  }, [coverImage, cardWidth, post.id]);

  async function handleLike() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    onLikeToggle(post.id, next);
    if (next) {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
    } else {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id);
    }
  }

  function burstHeart() {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 14 }),
      Animated.delay(400),
      Animated.timing(heartOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function handleCardPress() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      if (!liked) {
        handleLike();
        burstHeart();
      }
    } else {
      tapTimerRef.current = setTimeout(() => {
        navigation.navigate('PostDetail', { post });
        tapTimerRef.current = null;
      }, 260);
    }
    lastTapRef.current = now;
  }

  function handleLongPress() {
    setSendQuery('');
    setSendResults([]);
    setQuickConvs([]);
    setShowSendModal(true);
    loadQuickConvs();
  }

  async function loadQuickConvs() {
    if (!myId) return;
    setLoadingConvs(true);
    const { data: dmData } = await supabase
      .from('conversations')
      .select(`id, is_group, name,
        user1:users!conversations_user1_id_fkey(id, username, avatar_url),
        user2:users!conversations_user2_id_fkey(id, username, avatar_url)`)
      .or(`user1_id.eq.${myId},user2_id.eq.${myId}`)
      .eq('is_group', false);

    const { data: participantRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', myId);
    const groupIds = (participantRows ?? []).map((r: any) => r.conversation_id);
    let groupData: any[] = [];
    if (groupIds.length > 0) {
      const { data: gd } = await supabase
        .from('conversations')
        .select('id, is_group, name')
        .in('id', groupIds)
        .eq('is_group', true);
      groupData = gd ?? [];
    }

    const dms = (dmData ?? []).map((c: any) => {
      const other = c.user1?.id === myId ? c.user2 : c.user1;
      return { id: c.id, is_group: false, label: `@${other?.username ?? '?'}`, avatar_url: other?.avatar_url ?? null };
    });
    const groups = groupData.map((c: any) => ({ id: c.id, is_group: true, label: c.name ?? 'Group', avatar_url: null }));
    setQuickConvs([...dms, ...groups]);
    setLoadingConvs(false);
  }

  async function sendPostToConversation(convId: string) {
    if (!myId || sending) return;
    setSending(true);
    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: myId,
      body: '📷 Sent a post',
      post_id: post.id,
    });
    setSending(false);
    setShowSendModal(false);
    setSendQuery('');
    setSendResults([]);
    setQuickConvs([]);
    navigation.navigate('Messages');
  }

  async function searchSendUsers(text: string) {
    setSendQuery(text);
    if (!text.trim()) { setSendResults([]); return; }
    setSendSearching(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .ilike('username', `%${text.trim()}%`)
      .neq('id', user?.id ?? '')
      .limit(8);
    setSendResults(data ?? []);
    setSendSearching(false);
  }

  async function sendPostToUser(toUser: { id: string; username: string }) {
    if (!myId || sending) return;
    setSending(true);
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${myId},user2_id.eq.${toUser.id}),and(user1_id.eq.${toUser.id},user2_id.eq.${myId})`)
      .eq('is_group', false)
      .maybeSingle();

    let convId: string;
    if (existing) {
      convId = existing.id;
    } else {
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({ user1_id: myId, user2_id: toUser.id })
        .select('id')
        .single();
      if (error || !newConv) { setSending(false); return; }
      convId = newConv.id;
    }
    await sendPostToConversation(convId);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  const username = post.user?.username ?? 'unknown';

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.92}
        style={[styles.card, { width: cardWidth }]}
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        delayLongPress={380}
      >
        {/* Cover image with bottom metadata overlay */}
        <View style={[styles.imageWrap, { height: resolvedImageHeight }]}>
          <Image
            source={{ uri: coverImage }}
            style={styles.image}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.74)']}
            locations={[0.4, 1]}
            style={styles.bottomGradient}
            pointerEvents="none"
          />
          <View style={styles.bottomMeta}>
            <View style={styles.userRow}>
              <View style={styles.avatarWrap}>
                {post.user?.avatar_url ? (
                  <Image source={{ uri: post.user.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>
                      {username[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.userTextWrap}>
                <Text style={styles.username} numberOfLines={1}>
                  @{username}
                </Text>
                <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={(e) => { e.stopPropagation(); handleLike(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.actionIcon, liked && styles.liked]}>{liked ? '♥' : '♡'}</Text>
                <Text style={styles.actionCount}>{likeCount}</Text>
              </TouchableOpacity>
              <View style={styles.actionBtn}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{post.comment_count}</Text>
              </View>
            </View>
          </View>
          {images.length > 1 && (
            <View style={styles.multiIndicator}>
              <Text style={styles.multiIndicatorText}>+{images.length - 1}</Text>
            </View>
          )}
          <Animated.Text
            style={[
              styles.heartBurst,
              { opacity: heartOpacity, transform: [{ scale: heartScale }] },
            ]}
            pointerEvents="none"
          >
            ♥
          </Animated.Text>
        </View>
      </TouchableOpacity>

      {/* Share / send modal */}
      <Modal
        visible={showSendModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSendModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setShowSendModal(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Send Post</Text>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {sendQuery.trim().length === 0 && (
                loadingConvs ? (
                  <ActivityIndicator color="#1a1a1a" style={{ marginTop: 12 }} />
                ) : quickConvs.length > 0 ? (
                  <>
                    {quickConvs.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.convRow}
                        onPress={() => sendPostToConversation(c.id)}
                        disabled={sending}
                      >
                        <View style={styles.sendAvatar}>
                          {c.is_group ? (
                            <Text style={styles.sendAvatarIcon}>👥</Text>
                          ) : c.avatar_url ? (
                            <Image source={{ uri: c.avatar_url }} style={styles.sendAvatarImg} />
                          ) : (
                            <Text style={styles.sendAvatarInitial}>{c.label[1]?.toUpperCase()}</Text>
                          )}
                        </View>
                        <Text style={styles.convLabel}>{c.label}</Text>
                        {sending && <ActivityIndicator size="small" color="#aaa" />}
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null
              )}
              {sendSearching ? (
                <ActivityIndicator color="#1a1a1a" style={{ marginTop: 8 }} />
              ) : (
                <>
                  {sendResults.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.convRow}
                      onPress={() => sendPostToUser(u)}
                      disabled={sending}
                    >
                      <View style={styles.sendAvatar}>
                        <Text style={styles.sendAvatarInitial}>{u.username[0]?.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.convLabel}>@{u.username}</Text>
                      {sending && <ActivityIndicator size="small" color="#aaa" />}
                    </TouchableOpacity>
                  ))}
                  {sendResults.length === 0 && sendQuery.trim().length > 0 && (
                    <Text style={styles.noResults}>No users found</Text>
                  )}
                </>
              )}
            </ScrollView>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for someone new..."
                placeholderTextColor="#999"
                value={sendQuery}
                onChangeText={searchSendUsers}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  imageWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomMeta: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    gap: 4,
  },
  heartBurst: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    fontSize: 52,
    color: '#e0245e',
  },
  multiIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(10,10,12,0.46)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  multiIndicatorText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  userTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  avatar: { width: 24, height: 24 },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  avatarInitial: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.95)' },
  username: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 13,
  },
  time: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionIcon: {
    fontSize: 12,
    color: '#fff',
  },
  liked: { color: '#ff8ea9' },
  actionCount: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  // Share modal
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  sendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sendAvatarImg: { width: 36, height: 36 },
  sendAvatarIcon: { fontSize: 18 },
  sendAvatarInitial: { fontSize: 14, fontWeight: '700', color: '#555' },
  convLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  noResults: { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 12 },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    fontSize: 14,
    color: '#1a1a1a',
  },
});
