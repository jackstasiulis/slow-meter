import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Dimensions, ActivityIndicator, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { navigateToUserProfile } from '../../navigation/navigateToUserProfile';

const ITEM_SIZE = Dimensions.get('window').width / 3;

type SearchUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  link_count: number;
  link_status: 'none' | 'pending_sent' | 'linked';
};

export default function DiscoverScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [discoverPosts, setDiscoverPosts] = useState<{ id: string; media_url: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [discoverLoaded, setDiscoverLoaded] = useState(false);

  React.useEffect(() => {
    loadDiscover();
  }, []);

  async function loadDiscover() {
    setLoadingDiscover(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingDiscover(false); return; }

    const { data: rows } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

    const linkedIds = (rows ?? []).map((r: any) => r.user_a_id === user.id ? r.user_b_id : r.user_a_id);

    if (linkedIds.length === 0) { setLoadingDiscover(false); setDiscoverLoaded(true); return; }

    const { data: posts } = await supabase
      .from('posts')
      .select('id, media_url')
      .in('user_id', linkedIds)
      .order('created_at', { ascending: false })
      .limit(60);

    setDiscoverPosts(posts ?? []);
    setLoadingDiscover(false);
    setDiscoverLoaded(true);
  }

  const search = useCallback(async (text: string) => {
    setQuery(text);
    if (!text.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: users } = await supabase
      .from('users')
      .select('id, username, avatar_url, follower_count')
      .ilike('username', `%${text.trim()}%`)
      .neq('id', user?.id ?? '')
      .limit(20);

    if (!users) { setSearching(false); return; }

    const ids = users.map((u: any) => u.id);
    const { data: linksData } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(ids.map((id: string) => {
        const [ua, ub] = [user?.id ?? '', id].sort();
        return `and(user_a_id.eq.${ua},user_b_id.eq.${ub})`;
      }).join(','));

    const linkedSet = new Set((linksData ?? []).map((r: any) =>
      r.user_a_id === user?.id ? r.user_b_id : r.user_a_id
    ));

    const { data: sentRequests } = await supabase
      .from('link_requests')
      .select('receiver_id')
      .eq('sender_id', user?.id ?? '')
      .eq('status', 'pending')
      .in('receiver_id', ids);
    const pendingSet = new Set((sentRequests ?? []).map((r: any) => r.receiver_id));

    setSearchResults(users.map((u: any) => ({
      ...u,
      link_status: linkedSet.has(u.id) ? 'linked' : pendingSet.has(u.id) ? 'pending_sent' : 'none',
    })));
    setSearching(false);
  }, []);

  async function sendLinkRequest(targetId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('link_requests').insert({ sender_id: user.id, receiver_id: targetId, status: 'pending' });
    await supabase.from('notifications').insert({ recipient_id: targetId, actor_id: user.id, type: 'link_request' });
    setSearchResults((prev) => prev.map((u) => u.id === targetId ? { ...u, link_status: 'pending_sent' } : u));
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search people..."
            placeholderTextColor="#999"
            value={query}
            onChangeText={search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {query.trim().length > 0 ? (
          searching ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#1a1a1a" />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.searchList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No users found</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.userRow} onPress={() => navigateToUserProfile(navigation, item.id)}>
                  <View style={styles.userAvatar}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarInitial}>{item.username[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>@{item.username}</Text>
                    <Text style={styles.followerCount}>{item.link_count} links</Text>
                  </View>
                  {item.link_status === 'none' && (
                    <TouchableOpacity style={styles.followBtn} onPress={() => sendLinkRequest(item.id)}>
                      <Text style={styles.followBtnText}>Link</Text>
                    </TouchableOpacity>
                  )}
                  {item.link_status === 'pending_sent' && (
                    <TouchableOpacity style={styles.followingBtn}>
                      <Text style={styles.followingBtnText}>Requested</Text>
                    </TouchableOpacity>
                  )}
                  {item.link_status === 'linked' && (
                    <TouchableOpacity style={styles.followingBtn}>
                      <Text style={styles.followingBtnText}>Linked</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
            />
          )
        ) : loadingDiscover ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a1a1a" />
        ) : discoverLoaded && discoverPosts.length === 0 ? (
          <View style={styles.emptyDiscover}>
            <Text style={styles.emptyTitle}>Discover people</Text>
            <Text style={styles.emptySubtext}>Search for people to follow. Mutual followers' posts will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={discoverPosts}
            numColumns={3}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image source={{ uri: item.media_url }} style={styles.gridImage} />
            )}
          />
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: '#eee',
    borderRadius: 10, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 40, fontSize: 15, color: '#1a1a1a' },
  clearBtn: { fontSize: 16, color: '#999', padding: 4 },
  searchList: { paddingHorizontal: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44 },
  avatarInitial: { fontSize: 16, fontWeight: '600', color: '#888' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  followerCount: { fontSize: 12, color: '#888', marginTop: 2 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: '#1a1a1a', borderRadius: 8 },
  followingBtn: { backgroundColor: '#eee' },
  followBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  followingBtnText: { color: '#1a1a1a' },
  gridImage: { width: ITEM_SIZE, height: ITEM_SIZE },
  emptyDiscover: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#1a1a1a' },
  emptySubtext: { fontSize: 14, color: '#888', textAlign: 'center' },
  empty: { textAlign: 'center', color: '#aaa', fontSize: 14, marginTop: 40 },
});
