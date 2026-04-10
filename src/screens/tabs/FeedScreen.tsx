import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { Post } from '../../types';
import FeedMiniCard from '../../components/FeedMiniCard';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDE_PAD = 12;
const COL_GAP = 8;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - SIDE_PAD * 2 - COL_GAP) / 2);

const DEFAULT_IMAGE_HEIGHT = Math.round(CARD_WIDTH * (4 / 3));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090a',
  },
  screenGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topHeaderTitle: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.9,
  },
  topHeaderAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  topHeaderActionTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  topHeaderActionText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  topHeaderBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#c41e3a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#08090a',
  },
  topHeaderBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columns: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PAD,
    gap: COL_GAP,
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
  },
  empty: {
    padding: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.66)',
    textAlign: 'center',
  },
});

// Greedy masonry split: each post goes to the shorter column
function splitColumns(posts: Post[], heights: Record<string, number>): [Post[], Post[]] {
  const left: Post[] = [];
  const right: Post[] = [];
  let leftH = 0;
  let rightH = 0;
  for (const p of posts) {
    const h = heights[p.id] ?? DEFAULT_IMAGE_HEIGHT;
    if (leftH <= rightH) {
      left.push(p);
      leftH += h;
    } else {
      right.push(p);
      rightH += h;
    }
  }
  return [left, right];
}

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  // Map of post.id → resolved image height (updated when FeedMiniCard reads remote dimensions)
  const [resolvedHeights, setResolvedHeights] = useState<Record<string, number>>({});

  const handleHeightResolved = useCallback((postId: string, height: number) => {
    setResolvedHeights((prev) => {
      if (prev[postId] === height) return prev;
      return { ...prev, [postId]: height };
    });
  }, []);

  async function loadFeed() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: follows } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

    const linkedIds = (follows ?? []).map((r: any) =>
      r.user_a_id === user.id ? r.user_b_id : r.user_a_id
    );
    const allIds = [user.id, ...linkedIds];

    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select('*, user:users!posts_user_id_fkey(id, username, avatar_url)')
      .in('user_id', allIds)
      .order('created_at', { ascending: false });

    if (postsError || !postsData) { setLoading(false); setRefreshing(false); return; }

    const postIds = postsData.map((p: any) => p.id);

    const { data: likesData } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', postIds);

    const likedSet = new Set((likesData ?? []).map((l: any) => l.post_id));

    const { data: commentsData } = await supabase
      .from('comments')
      .select('id, body, post_id, created_at, user:users!comments_user_id_fkey(id, username, avatar_url)')
      .in('post_id', postIds)
      .order('created_at', { ascending: false });

    const commentsByPost: Record<string, any[]> = {};
    for (const c of commentsData ?? []) {
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
      if (commentsByPost[c.post_id].length < 2) commentsByPost[c.post_id].push(c);
    }

    setPosts(
      postsData.map((p: any) => ({
        ...p,
        liked_by_me: likedSet.has(p.id),
        preview_comments: commentsByPost[p.id] ?? [],
      }))
    );
    setLoading(false);
    setRefreshing(false);
  }

  async function loadUnreadCount() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false);
    setUnreadNotifications(count ?? 0);
  }

  useFocusEffect(
    useCallback(() => {
      loadFeed();
      loadUnreadCount();
    }, [])
  );

  function openNotifications() {
    const parent = navigation.getParent();
    if (parent) parent.navigate('Notifications');
    else navigation.navigate('Notifications');
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed();
    loadUnreadCount();
  }, []);

  function handleLikeToggle(postId: string, liked: boolean) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, liked_by_me: liked, like_count: p.like_count + (liked ? 1 : -1) }
          : p
      )
    );
  }

  const [leftCol, rightCol] = loading
    ? [[], []] as [Post[], Post[]]
    : splitColumns(posts, resolvedHeights);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0)']}
        locations={[0, 0.34, 1]}
        style={styles.screenGradient}
        pointerEvents="none"
      />
      <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.topHeaderTitle}>slowletter</Text>
        <TouchableOpacity
          style={styles.topHeaderAction}
          onPress={openNotifications}
          accessibilityLabel="Open notifications"
        >
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.topHeaderActionTint} />
          <Text style={styles.topHeaderActionText}>↕</Text>
          {unreadNotifications > 0 ? (
            <View style={styles.topHeaderBadge}>
              <Text style={styles.topHeaderBadgeText}>
                {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: tabBarHeight + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {posts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your feed is quiet</Text>
              <Text style={styles.emptySubtext}>Follow people to see their posts here</Text>
            </View>
          ) : (
            <View style={styles.columns}>
              <View style={styles.column}>
                {leftCol.map((post) => (
                  <FeedMiniCard
                    key={post.id}
                    post={post}
                    cardWidth={CARD_WIDTH}
                    imageHeight={resolvedHeights[post.id] ?? DEFAULT_IMAGE_HEIGHT}
                    onLikeToggle={handleLikeToggle}
                    onHeightResolved={handleHeightResolved}
                  />
                ))}
              </View>
              <View style={styles.column}>
                {rightCol.map((post) => (
                  <FeedMiniCard
                    key={post.id}
                    post={post}
                    cardWidth={CARD_WIDTH}
                    imageHeight={resolvedHeights[post.id] ?? DEFAULT_IMAGE_HEIGHT}
                    onLikeToggle={handleLikeToggle}
                    onHeightResolved={handleHeightResolved}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
