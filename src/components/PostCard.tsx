import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  PanResponder,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Post } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Props = {
  post: Post;
  onCommentPress: (post: Post) => void;
  onLikeToggle: (postId: string, liked: boolean) => void;
  onDelete?: (postId: string) => void;
  onZoomStateChange?: (zooming: boolean) => void;
};

type CommentPreview = { id: string; body: string; user: { username: string } };

export default function PostCard({ post, onCommentPress, onLikeToggle, onDelete, onZoomStateChange }: Props) {
  const navigation = useNavigation<any>();
  const [liked, setLiked] = useState(post.liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  // Aspect ratio of the cover image — default 3:4 (portrait), updated once the remote image size is known
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(3 / 4);
  const [loading, setLoading] = useState(false);
  const [previewComments, setPreviewComments] = useState<CommentPreview[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const lastTap = useRef<number>(0);
  const [myId, setMyId] = useState<string | null>(null);

  // Tagged users modal
  const [showTaggedModal, setShowTaggedModal] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<{ id: string; username: string; avatar_url: string | null }[]>([]);

  // Send post modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendQuery, setSendQuery] = useState('');
  const [sendResults, setSendResults] = useState<{ id: string; username: string }[]>([]);
  const [sendSearching, setSendSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [quickConvs, setQuickConvs] = useState<{ id: string; is_group: boolean; label: string; avatar_url?: string | null }[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const images = post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url];
  const hasMultiple = images.length > 1;
  const tagCount = (post.tagged_user_ids ?? []).length;

  // Resolve the true aspect ratio of the cover image so the card sizes correctly
  useEffect(() => {
    if (!images[0]) return;
    Image.getSize(
      images[0],
      (w, h) => { if (w > 0 && h > 0) setImageAspectRatio(w / h); },
      () => { /* keep default */ },
    );
  }, [images[0]]);

  // Fullscreen pinch-to-zoom — renders in a Modal so it covers nav bars
  const pinchScale = useRef(new Animated.Value(1)).current;
  const pinchTranslateX = useRef(new Animated.Value(0)).current;
  const pinchTranslateY = useRef(new Animated.Value(0)).current;
  const pinchStartDist = useRef<number | null>(null);
  const pinchOrigin = useRef({ x: 0, y: 0 });
  const imageWrapNodeRef = useRef<any>(null);
  const imageScreenPos = useRef({ pageX: 0, pageY: 0, width: SCREEN_WIDTH, height: SCREEN_WIDTH * (4 / 3) });
  const [isZooming, setIsZooming] = useState(false);
  const onZoomStateChangeRef = useRef(onZoomStateChange);
  onZoomStateChangeRef.current = onZoomStateChange;

  const pinchResponder = useRef(PanResponder.create({
    // Capture immediately on 2-finger touch, stealing from parent ScrollView/FlatList
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
    onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const dx = t[1].pageX - t[0].pageX;
        const dy = t[1].pageY - t[0].pageY;
        pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);

        const midX = (t[0].pageX + t[1].pageX) / 2;
        const midY = (t[0].pageY + t[1].pageY) / 2;

        // Position is pre-measured via onLayout — compute focal point immediately
        const { pageX, pageY, width, height } = imageScreenPos.current;
        pinchOrigin.current = {
          x: midX - pageX - width / 2,
          y: midY - pageY - height / 2,
        };

        setIsZooming(true);
        onZoomStateChangeRef.current?.(true);
      }
    },
    onPanResponderMove: (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2 && pinchStartDist.current) {
        const dx = t[1].pageX - t[0].pageX;
        const dy = t[1].pageY - t[0].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = Math.max(1, dist / pinchStartDist.current);
        pinchScale.setValue(scale);
        pinchTranslateX.setValue(pinchOrigin.current.x * (1 - scale));
        pinchTranslateY.setValue(pinchOrigin.current.y * (1 - scale));
      }
    },
    onPanResponderRelease: () => {
      pinchStartDist.current = null;
      pinchScale.setValue(1);
      pinchTranslateX.setValue(0);
      pinchTranslateY.setValue(0);
      setIsZooming(false);
      onZoomStateChangeRef.current?.(false);
    },
    onPanResponderTerminate: () => {
      pinchStartDist.current = null;
      pinchScale.setValue(1);
      pinchTranslateX.setValue(0);
      pinchTranslateY.setValue(0);
      setIsZooming(false);
      onZoomStateChangeRef.current?.(false);
    },
  })).current;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (post.preview_comments) {
      setPreviewComments(post.preview_comments);
      return;
    }
    if (post.comment_count === 0) return;
    supabase
      .from('comments')
      .select('id, body, user:users!comments_user_id_fkey(username)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(2)
      .then(({ data }) => setPreviewComments((data as any) ?? []));
  }, [post.id, post.preview_comments]);

  async function handleLike() {
    if (loading) return;
    setLoading(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    if (newLiked) {
      await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
    } else {
      await supabase.from('likes').delete().match({ post_id: post.id, user_id: user.id });
    }
    onLikeToggle(post.id, newLiked);
    setLoading(false);
  }

  function handleImageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) handleLike();
    }
    lastTap.current = now;
  }

  function handlePostMenu() {
    Alert.alert('Post', undefined, [
      {
        text: 'Edit caption',
        onPress: () => navigation.navigate('EditPost', { post }),
      },
      {
        text: 'Delete post',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete post?', 'This cannot be undone.', [
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await supabase.from('posts').delete().eq('id', post.id);
                onDelete?.(post.id);
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function loadTaggedUsers() {
    if (!post.tagged_user_ids?.length) return;
    const { data } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', post.tagged_user_ids);
    setTaggedUsers(data ?? []);
  }

  async function loadQuickConvs() {
    if (!myId) return;
    setLoadingConvs(true);
    const { data: dmData } = await supabase
      .from('conversations')
      .select(`
        id, is_group, name,
        user1:users!conversations_user1_id_fkey(id, username, avatar_url),
        user2:users!conversations_user2_id_fkey(id, username, avatar_url)
      `)
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

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => navigation.navigate('UserProfile', { userId: post.user_id })}
        >
          <View style={styles.avatarCircle}>
            {post.user?.avatar_url ? (
              <Image source={{ uri: post.user.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarInitial}>{(post.user?.username ?? '?')[0].toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.username}>@{post.user?.username}</Text>
            {post.location_label ? <Text style={styles.location}>{post.location_label}</Text> : null}
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
          {post.user_id === myId && (
            <TouchableOpacity style={styles.menuBtn} onPress={handlePostMenu}>
              <Text style={styles.menuBtnText}>•••</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Image(s) — original view goes invisible during zoom; modal layer handles the visible zoom */}
      <Animated.View
        ref={imageWrapNodeRef}
        style={[styles.imageWrap, { height: SCREEN_WIDTH / imageAspectRatio }]}
        {...pinchResponder.panHandlers}
        onLayout={() => {
          imageWrapNodeRef.current?.measure(
            (_: number, __: number, width: number, height: number, pageX: number, pageY: number) => {
              imageScreenPos.current = { pageX, pageY, width, height };
            },
          );
        }}
      >
        {hasMultiple ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
          >
            {images.map((url, i) => (
              <TouchableOpacity key={i} activeOpacity={1} onPress={handleImageTap}>
                <Image source={{ uri: url }} style={[styles.image, { height: SCREEN_WIDTH / imageAspectRatio }]} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <TouchableOpacity activeOpacity={1} onPress={handleImageTap}>
            <Image source={{ uri: images[0] }} style={[styles.image, { height: SCREEN_WIDTH / imageAspectRatio }]} resizeMode="cover" />
          </TouchableOpacity>
        )}
      </Animated.View>
      {hasMultiple && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* Tagged indicator */}
      {tagCount > 0 && (
        <TouchableOpacity
          style={styles.taggedRow}
          onPress={() => { loadTaggedUsers(); setShowTaggedModal(true); }}
        >
          <Text style={styles.taggedText}>
            👤 {tagCount} {tagCount === 1 ? 'person' : 'people'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Text style={[styles.actionIcon, liked && styles.liked]}>{liked ? '♥' : '♡'}</Text>
          <Text style={styles.actionCount}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => onCommentPress(post)}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{post.comment_count}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => { setSendQuery(''); setSendResults([]); setQuickConvs([]); setShowSendModal(true); loadQuickConvs(); }}
        >
          <Text style={styles.actionIcon}>✈</Text>
        </TouchableOpacity>
      </View>

      {post.caption ? (
        <View style={styles.captionRow}>
          <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: post.user_id })}>
            <Text style={styles.captionUsername}>@{post.user?.username} </Text>
          </TouchableOpacity>
          <Text style={styles.caption}>{post.caption}</Text>
        </View>
      ) : null}

      {previewComments.length > 0 && (
        <TouchableOpacity style={styles.commentPreview} onPress={() => onCommentPress(post)}>
          {previewComments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Text style={styles.commentUsername}>@{c.user?.username} </Text>
              <Text style={styles.commentBody} numberOfLines={1}>{c.body}</Text>
            </View>
          ))}
        </TouchableOpacity>
      )}

      {/* Fullscreen zoom overlay — covers nav bars via statusBarTranslucent + transparent Modal */}
      <Modal
        visible={isZooming}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {
          pinchScale.setValue(1);
          pinchTranslateX.setValue(0);
          pinchTranslateY.setValue(0);
          setIsZooming(false);
          onZoomStateChangeRef.current?.(false);
        }}
      >
        <Animated.View
          style={[
            styles.zoomImageWrap,
            {
              left: imageScreenPos.current.pageX,
              top: imageScreenPos.current.pageY,
              width: imageScreenPos.current.width,
              height: imageScreenPos.current.height,
              transform: [
                { translateX: pinchTranslateX },
                { translateY: pinchTranslateY },
                { scale: pinchScale },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: images[imageIndex] }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </Animated.View>
      </Modal>

      {/* Tagged users modal */}
      <Modal visible={showTaggedModal} animationType="slide" transparent onRequestClose={() => setShowTaggedModal(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior="padding">
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowTaggedModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Tagged People</Text>
            {taggedUsers.length === 0 ? (
              <ActivityIndicator color="#1a1a1a" style={{ marginVertical: 20 }} />
            ) : (
              taggedUsers.map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.taggedUserRow}
                  onPress={() => { setShowTaggedModal(false); navigation.navigate('UserProfile', { userId: u.id }); }}
                >
                  <View style={styles.taggedAvatar}>
                    {u.avatar_url ? (
                      <Image source={{ uri: u.avatar_url }} style={styles.taggedAvatarImg} />
                    ) : (
                      <Text style={styles.taggedAvatarInitial}>{u.username[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.userRowText}>@{u.username}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Send post modal */}
      <Modal visible={showSendModal} animationType="slide" transparent onRequestClose={() => setShowSendModal(false)}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior="padding">
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowSendModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Send Post</Text>
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {/* Quick-pick existing conversations */}
              {sendQuery.trim().length === 0 && (
                loadingConvs ? (
                  <ActivityIndicator color="#1a1a1a" style={{ marginTop: 12 }} />
                ) : quickConvs.length > 0 ? (
                  <>
                    {quickConvs.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.userRow}
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
                        <Text style={styles.userRowText}>{c.label}</Text>
                        {sending && <ActivityIndicator size="small" color="#aaa" />}
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null
              )}
              {/* Search results for new DM */}
              {sendSearching ? (
                <ActivityIndicator color="#1a1a1a" style={{ marginTop: 8 }} />
              ) : (
                <>
                  {sendResults.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.userRow}
                      onPress={() => sendPostToUser(u)}
                      disabled={sending}
                    >
                      <View style={styles.sendAvatar}>
                        <Text style={styles.sendAvatarInitial}>{u.username[0]?.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.userRowText}>@{u.username}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 36, height: 36 },
  avatarInitial: { fontSize: 14, fontWeight: '600', color: '#888' },
  headerText: { flex: 1 },
  username: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  location: { fontSize: 11, color: '#888', marginTop: 1 },
  time: { fontSize: 12, color: '#aaa' },
  menuBtn: { padding: 4 },
  menuBtnText: { fontSize: 16, color: '#aaa', letterSpacing: 1 },
  image: { width: SCREEN_WIDTH },
  imageWrap: { width: SCREEN_WIDTH, overflow: 'hidden' },
  zoomImageWrap: { position: 'absolute' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#1a1a1a' },
  taggedRow: { paddingHorizontal: 12, paddingBottom: 4 },
  taggedText: { fontSize: 13, color: '#555' },
  actions: { flexDirection: 'row', padding: 12, gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 22, color: '#1a1a1a' },
  liked: { color: '#e0245e' },
  actionCount: { fontSize: 14, color: '#555' },
  captionRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, flexWrap: 'wrap' },
  captionUsername: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  caption: { fontSize: 13, color: '#1a1a1a', flex: 1 },
  commentPreview: { paddingHorizontal: 12, paddingBottom: 12, gap: 3 },
  commentRow: { flexDirection: 'row', flexWrap: 'wrap' },
  commentUsername: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  commentBody: { fontSize: 13, color: '#1a1a1a', flex: 1 },
  modalContainer: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 16 },
  searchBar: { backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { height: 40, fontSize: 15, color: '#1a1a1a' },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  userRowText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  noResults: { textAlign: 'center', color: '#aaa', marginTop: 20 },
  sendAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendAvatarImg: { width: 36, height: 36 },
  sendAvatarIcon: { fontSize: 18 },
  sendAvatarInitial: { fontSize: 14, fontWeight: '600', color: '#888' },
  taggedUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  taggedAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  taggedAvatarImg: { width: 38, height: 38 },
  taggedAvatarInitial: { fontSize: 15, fontWeight: '600', color: '#888' },
});
