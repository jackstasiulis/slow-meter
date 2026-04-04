import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { User, Post } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_SIZE = (SCREEN_WIDTH - 4) / 3;

type FollowUser = { id: string; username: string; avatar_url: string | null };

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [linksModal, setLinksModal] = useState(false);
  const [listUsers, setListUsers] = useState<FollowUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [linkCount, setLinkCount] = useState(0);

  async function load() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const [{ data: userData }, { data: postsData }, { count }] = await Promise.all([
      supabase.from('users').select('*').eq('id', authUser.id).single(),
      supabase.from('posts').select('*, user:users!posts_user_id_fkey(id, username, avatar_url)').eq('user_id', authUser.id).order('created_at', { ascending: false }),
      supabase.from('links').select('*', { count: 'exact', head: true }).or(`user_a_id.eq.${authUser.id},user_b_id.eq.${authUser.id}`),
    ]);

    setProfile(userData);
    setPosts(postsData ?? []);
    setLinkCount(count ?? 0);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, []);

  async function openLinks() {
    if (!profile) return;
    setLinksModal(true);
    setListLoading(true);
    setListUsers([]);

    const { data: rows } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${profile.id},user_b_id.eq.${profile.id}`);

    const otherIds = (rows ?? []).map((r: any) => r.user_a_id === profile.id ? r.user_b_id : r.user_a_id);

    if (otherIds.length === 0) {
      setListUsers([]);
      setListLoading(false);
      return;
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', otherIds);

    setListUsers(users ?? []);
    setListLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Cover image */}
            <View style={styles.coverWrap}>
              {profile?.cover_url ? (
                <Image source={{ uri: profile.cover_url }} style={styles.coverImage} resizeMode="cover" />
              ) : (
                <View style={styles.coverPlaceholder} />
              )}
            </View>

            {/* Avatar — overlapping cover */}
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
                <Text style={styles.statNumber}>{linkCount}</Text>
                <Text style={styles.statLabel}>links</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.username}>@{profile?.username}</Text>
            {profile?.display_name ? <Text style={styles.displayName}>{profile.display_name}</Text> : null}
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.settingsBtnText}>⚙</Text>
            </TouchableOpacity>
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
            <Text style={styles.emptySubtext}>Share your first photo from the Post tab</Text>
          </View>
        }
        style={styles.container}
      />

      <Modal visible={linksModal} animationType="slide" transparent onRequestClose={() => setLinksModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setLinksModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Links</Text>
            {listLoading ? (
              <ActivityIndicator color="#1a1a1a" style={{ marginTop: 20 }} />
            ) : listUsers.length === 0 ? (
              <Text style={styles.emptyList}>No links yet</Text>
            ) : (
              <FlatList
                data={listUsers}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 2, paddingBottom: 20 },
  coverWrap: { width: SCREEN_WIDTH, height: SCREEN_WIDTH / 3, marginBottom: -44 },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { width: '100%', height: '100%', backgroundColor: '#e8e8e8' },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: '#fafaf8',
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
  settingsBtn: { marginTop: 12, padding: 8 },
  settingsBtnText: { fontSize: 24, color: '#555' },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, margin: 1 },
  gridImage: { width: '100%', height: '100%' },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  emptySubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
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
