import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Animated,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  PanResponder,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { supabase } from '../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Comment = {
  id: string;
  body: string;
  created_at: string;
  user: { id: string; username: string; avatar_url: string | null };
};

export default function PostDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const { post } = route.params;

  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(post.liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const lastTap = useRef<number>(0);

  // Edit comment state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  // Post menu
  const [showPostMenu, setShowPostMenu] = useState(false);

  // Send post modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendQuery, setSendQuery] = useState('');
  const [sendResults, setSendResults] = useState<{ id: string; username: string }[]>([]);
  const [sendSearching, setSendSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const images = post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url];
  const hasMultiple = images.length > 1;

  // Detect cover image aspect ratio so the container matches the photo exactly (no cropping)
  const [imageAspectRatio, setImageAspectRatio] = useState<number>(1);
  useEffect(() => {
    if (!images[0]) return;
    Image.getSize(
      images[0],
      (w, h) => { if (w > 0 && h > 0) setImageAspectRatio(w / h); },
      () => { /* keep default */ },
    );
  }, [images[0]]);

  // Pinch-to-zoom (same pattern as PostCard)
  const [isZooming, setIsZooming] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const pinchScale = useRef(new Animated.Value(1)).current;
  const pinchTranslateX = useRef(new Animated.Value(0)).current;
  const pinchTranslateY = useRef(new Animated.Value(0)).current;
  const pinchStartDist = useRef<number | null>(null);
  const pinchOrigin = useRef({ x: 0, y: 0 });
  const imageWrapNodeRef = useRef<any>(null);
  const imageScreenPos = useRef({ pageX: 0, pageY: 0, width: SCREEN_WIDTH, height: SCREEN_WIDTH });

  const pinchResponder = useRef(PanResponder.create({
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
        const { pageX, pageY, width, height } = imageScreenPos.current;
        pinchOrigin.current = {
          x: midX - pageX - width / 2,
          y: midY - pageY - height / 2,
        };
        setIsZooming(true);
        setScrollEnabled(false);
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
      setScrollEnabled(true);
    },
    onPanResponderTerminate: () => {
      pinchStartDist.current = null;
      pinchScale.setValue(1);
      pinchTranslateX.setValue(0);
      pinchTranslateY.setValue(0);
      setIsZooming(false);
      setScrollEnabled(true);
    },
  })).current;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);

      const [{ data: commentsData }, { data: likeData }] = await Promise.all([
        supabase
          .from('comments')
          .select('id, body, created_at, user:users!comments_user_id_fkey(id, username, avatar_url)')
          .eq('post_id', post.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('likes')
          .select('post_id')
          .eq('post_id', post.id)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      setComments((commentsData as any) ?? []);
      if (likeData) {
        setLiked(true);
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleImageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) handleLike();
    }
    lastTap.current = now;
  }

  async function handleLike() {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c: number) => c + (newLiked ? 1 : -1));
    if (!myId) return;
    if (newLiked) {
      await supabase.from('likes').insert({ post_id: post.id, user_id: myId });
    } else {
      await supabase.from('likes').delete().match({ post_id: post.id, user_id: myId });
    }
  }

  async function submitComment() {
    if (!body.trim() || !myId) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: myId, body: body.trim() })
      .select('id, body, created_at, user:users!comments_user_id_fkey(id, username, avatar_url)')
      .single();
    if (!error && data) {
      setComments((prev) => [...prev, data as any]);
      setCommentCount((c: number) => c + 1);
      setBody('');
    }
    setSubmitting(false);
  }

  async function saveEditComment(id: string) {
    if (!editingBody.trim()) return;
    const { error } = await supabase.from('comments').update({ body: editingBody.trim() }).eq('id', id);
    if (error) { Alert.alert('Error', error.message); return; }
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, body: editingBody.trim() } : c));
    setEditingCommentId(null);
    setEditingBody('');
  }

  function handleLongPressComment(comment: Comment) {
    if (comment.user?.id !== myId) return;
    Alert.alert('Comment', '', [
      {
        text: 'Edit',
        onPress: () => { setEditingCommentId(comment.id); setEditingBody(comment.body); },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('comments').delete().eq('id', comment.id);
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          setCommentCount((c: number) => c - 1);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handlePostMenu() {
    Alert.alert('Post', '', [
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
                navigation.goBack();
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

  async function sendPost(toUser: { id: string; username: string }) {
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
    navigation.navigate('MainTabs', { screen: 'Messages' });
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>
        {/* Post header */}
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
            <Text style={styles.username}>@{post.user?.username}</Text>
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

        {/* Image(s) */}
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
              {images.map((url: string, i: number) => (
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
            {images.map((_: string, i: number) => (
              <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <Text style={[styles.actionIcon, liked && styles.liked]}>{liked ? '♥' : '♡'}</Text>
            <Text style={styles.actionCount}>{likeCount}</Text>
          </TouchableOpacity>
          <View style={styles.actionBtn}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{commentCount}</Text>
          </View>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => { setSendQuery(''); setSendResults([]); setShowSendModal(true); }}
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

        <View style={styles.divider} />

        {loading ? (
          <ActivityIndicator style={{ margin: 20 }} color="#1a1a1a" />
        ) : comments.length === 0 ? (
          <Text style={styles.noComments}>No comments yet. Be the first!</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: c.user?.id })}>
                <View style={styles.commentAvatar}>
                  {c.user?.avatar_url ? (
                    <Image source={{ uri: c.user.avatar_url }} style={styles.commentAvatarImg} />
                  ) : (
                    <Text style={styles.commentAvatarInitial}>{c.user?.username?.[0]?.toUpperCase()}</Text>
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.commentContent}>
                <View style={styles.commentHeader}>
                  <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: c.user?.id })}>
                    <Text style={styles.commentUsername}>@{c.user?.username}</Text>
                  </TouchableOpacity>
                  <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                  {c.user?.id === myId && (
                    <TouchableOpacity onPress={() => handleLongPressComment(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.commentMenuDots}>•••</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingCommentId === c.id ? (
                  <View style={styles.editCommentRow}>
                    <TextInput
                      style={styles.editCommentInput}
                      value={editingBody}
                      onChangeText={setEditingBody}
                      autoFocus
                      multiline
                    />
                    <View style={styles.editCommentActions}>
                      <TouchableOpacity onPress={() => saveEditComment(c.id)} style={styles.editSaveBtn}>
                        <Text style={styles.editSaveBtnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingCommentId(null)}>
                        <Text style={styles.editCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.commentBody}>{c.body}</Text>
                )}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment..."
          placeholderTextColor="#999"
          value={body}
          onChangeText={setBody}
          maxLength={300}
          returnKeyType="send"
          onSubmitEditing={submitComment}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !body.trim() && styles.sendBtnDisabled]}
          onPress={submitComment}
          disabled={!body.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Fullscreen zoom modal */}
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
          setScrollEnabled(true);
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

      {/* Send post modal */}
      <Modal visible={showSendModal} animationType="slide" transparent onRequestClose={() => setShowSendModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowSendModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Send Post</Text>
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor="#999"
                value={sendQuery}
                onChangeText={searchSendUsers}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
            {sendSearching ? (
              <ActivityIndicator color="#1a1a1a" style={{ marginTop: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled">
                {sendResults.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.userRow}
                    onPress={() => sendPost(u)}
                    disabled={sending}
                  >
                    <Text style={styles.userRowText}>@{u.username}</Text>
                    {sending && <ActivityIndicator size="small" color="#aaa" />}
                  </TouchableOpacity>
                ))}
                {sendResults.length === 0 && sendQuery.trim().length > 0 && !sendSearching && (
                  <Text style={styles.noResults}>No users found</Text>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: 36, height: 36 },
  avatarInitial: { fontSize: 14, fontWeight: '600', color: '#888' },
  username: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  time: { fontSize: 12, color: '#aaa' },
  menuBtn: { padding: 4 },
  menuBtnText: { fontSize: 16, color: '#1a1a1a', letterSpacing: 1 },
  image: { width: SCREEN_WIDTH },
  imageWrap: { width: SCREEN_WIDTH, overflow: 'hidden' },
  zoomImageWrap: { position: 'absolute' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#1a1a1a' },
  actions: { flexDirection: 'row', padding: 12, gap: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 22, color: '#1a1a1a' },
  liked: { color: '#e0245e' },
  actionCount: { fontSize: 14, color: '#555' },
  captionRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, flexWrap: 'wrap' },
  captionUsername: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  caption: { fontSize: 13, color: '#1a1a1a', flex: 1 },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 4 },
  noComments: { textAlign: 'center', color: '#aaa', fontSize: 14, marginTop: 20 },
  commentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, marginBottom: 16 },
  commentAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  commentAvatarImg: { width: 34, height: 34 },
  commentAvatarInitial: { fontSize: 13, fontWeight: '600', color: '#888' },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentUsername: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  commentTime: { fontSize: 11, color: '#aaa', flex: 1 },
  commentMenuDots: { fontSize: 13, color: '#999', letterSpacing: 1 },
  commentBody: { fontSize: 13, color: '#1a1a1a', lineHeight: 18 },
  editCommentRow: { gap: 6 },
  editCommentInput: {
    fontSize: 13, color: '#1a1a1a', borderWidth: 1, borderColor: '#ddd',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  editCommentActions: { flexDirection: 'row', gap: 10 },
  editSaveBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  editSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  editCancelText: { fontSize: 13, color: '#888', paddingVertical: 5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff',
  },
  input: {
    flex: 1, height: 40, backgroundColor: '#f5f5f5',
    borderRadius: 20, paddingHorizontal: 14, fontSize: 14, color: '#1a1a1a',
  },
  sendBtn: {
    backgroundColor: '#1a1a1a', borderRadius: 20,
    paddingHorizontal: 16, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#ccc' },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalBackdrop: { flex: 1 },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 16 },
  searchBar: { backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { height: 40, fontSize: 15, color: '#1a1a1a' },
  userRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  userRowText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  noResults: { textAlign: 'center', color: '#aaa', marginTop: 20 },
});
