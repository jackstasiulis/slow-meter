import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Post } from '../../types';
import FeedMiniCard from '../../components/FeedMiniCard';
import StoriesBar from '../../components/StoriesBar';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIDE_PAD = 12;
const COL_GAP = 8;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - SIDE_PAD * 2 - COL_GAP) / 2);

const DEFAULT_IMAGE_HEIGHT = Math.round(CARD_WIDTH * (4 / 3));

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
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  useFocusEffect(useCallback(() => { loadFeed(); }, []));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed();
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  const [leftCol, rightCol] = splitColumns(posts, resolvedHeights);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stories strip */}
      <View style={styles.storiesContainer}>
        <StoriesBar />
      </View>

      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your feed is quiet</Text>
          <Text style={styles.emptySubtext}>Follow people to see their posts here</Text>
        </View>
      ) : (
        <View style={styles.columns}>
          {/* Left column */}
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

          {/* Right column */}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0efed',
  },
  contentContainer: {
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storiesContainer: {
    backgroundColor: '#fff',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
    color: '#1a1a1a',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
