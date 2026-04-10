import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { navigateToUserProfile } from '../navigation/navigateToUserProfile';
import { supabase } from '../lib/supabase';
import { Post } from '../types';

type Comment = {
  id: string;
  body: string;
  created_at: string;
  user: { id: string; username: string; avatar_url: string | null };
};

type Props = {
  post: Post | null;
  onClose: () => void;
};

export default function CommentsSheet({ post, onClose }: Props) {
  const navigation = useNavigation<any>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (post) loadComments();
  }, [post?.id]);

  async function loadComments() {
    if (!post) return;
    setLoading(true);
    const { data } = await supabase
      .from('comments')
      .select('id, body, created_at, user:users!comments_user_id_fkey(id, username, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments((data as any) ?? []);
    setLoading(false);
  }

  async function submitComment() {
    if (!body.trim() || !post) return;
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: user.id, body: body.trim() })
      .select('id, body, created_at, user:users!comments_user_id_fkey(id, username, avatar_url)')
      .single();

    if (!error && data) {
      setComments((prev) => [...prev, data as any]);
      setBody('');
    }
    setSubmitting(false);
  }

  async function saveEdit(id: string) {
    if (!editingBody.trim()) return;
    const { error } = await supabase.from('comments').update({ body: editingBody.trim() }).eq('id', id);
    if (error) { Alert.alert('Error', error.message); return; }
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, body: editingBody.trim() } : c));
    setEditingId(null);
    setEditingBody('');
  }

  function showCommentMenu(comment: Comment) {
    Alert.alert('Comment', '', [
      {
        text: 'Edit',
        onPress: () => { setEditingId(comment.id); setEditingBody(comment.body); },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('comments').delete().eq('id', comment.id);
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    <Modal visible={!!post} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrapper} behavior="padding">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Comments</Text>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#1a1a1a" />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.empty}>No comments yet. Be the first!</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <TouchableOpacity onPress={() => { onClose(); item.user?.id && navigateToUserProfile(navigation, item.user.id); }}>
                    <View style={styles.avatar}>
                      {item.user?.avatar_url ? (
                        <Image source={{ uri: item.user.avatar_url }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarInitial}>{item.user?.username?.[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <TouchableOpacity onPress={() => { onClose(); item.user?.id && navigateToUserProfile(navigation, item.user.id); }}>
                        <Text style={styles.commentUsername}>@{item.user?.username}</Text>
                      </TouchableOpacity>
                      <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                      {item.user?.id === myId && (
                        <TouchableOpacity onPress={() => showCommentMenu(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.menuDots}>•••</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {editingId === item.id ? (
                      <View style={styles.editRow}>
                        <TextInput
                          style={styles.editInput}
                          value={editingBody}
                          onChangeText={setEditingBody}
                          autoFocus
                          multiline
                        />
                        <View style={styles.editActions}>
                          <TouchableOpacity style={styles.saveBtn} onPress={() => saveEdit(item.id)}>
                            <Text style={styles.saveBtnText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingId(null)}>
                            <Text style={styles.cancelText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.commentBody}>{item.body}</Text>
                    )}
                  </View>
                </View>
              )}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
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
              style={[styles.sendButton, !body.trim() && styles.sendDisabled]}
              onPress={submitComment}
              disabled={!body.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  title: { fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 12, color: '#1a1a1a' },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  empty: { textAlign: 'center', color: '#aaa', fontSize: 14, marginTop: 20 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: 34, height: 34 },
  avatarInitial: { fontSize: 13, fontWeight: '600', color: '#888' },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  commentUsername: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  commentTime: { fontSize: 11, color: '#aaa', flex: 1 },
  menuDots: { fontSize: 13, color: '#999', letterSpacing: 1 },
  commentBody: { fontSize: 13, color: '#1a1a1a', lineHeight: 18 },
  editRow: { gap: 6 },
  editInput: {
    fontSize: 13, color: '#1a1a1a', borderWidth: 1, borderColor: '#ddd',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  editActions: { flexDirection: 'row', gap: 10 },
  saveBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancelText: { fontSize: 13, color: '#888', paddingVertical: 5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, gap: 8,
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  input: {
    flex: 1, height: 40,
    backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 14, fontSize: 14, color: '#1a1a1a',
  },
  sendButton: {
    backgroundColor: '#1a1a1a', borderRadius: 20,
    paddingHorizontal: 16, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: '#ccc' },
  sendText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
