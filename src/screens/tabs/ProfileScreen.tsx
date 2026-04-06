import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { User, Post } from '../../types';
import ProfileHeroHeader from '../../components/profile/ProfileHeroHeader';
import ProfileLinksSheet, { ProfileLinkUser } from '../../components/profile/ProfileLinksSheet';
import {
  PROFILE_CARD_HEIGHT,
  PROFILE_CARD_WIDTH,
  PROFILE_GRID_COL_GAP,
  PROFILE_GRID_H_PAD,
  PROFILE_GRID_ROW_GAP,
  PROFILE_HERO_HEIGHT,
} from '../../components/profile/constants';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [linksModal, setLinksModal] = useState(false);
  const [listUsers, setListUsers] = useState<ProfileLinkUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [linkCount, setLinkCount] = useState(0);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const stickyFadeStart = 56;
  const stickyFadeEnd = 104;
  const fixedOverflowOpacity = scrollY.interpolate({
    inputRange: [0, stickyFadeStart, stickyFadeEnd],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const contentGlassTranslateY = Animated.multiply(scrollY, -1);

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
    <View style={styles.screen}>
      {profile?.cover_url ? (
        <Image source={{ uri: profile.cover_url }} style={styles.backgroundImage} resizeMode="cover" />
      ) : (
        <View style={styles.backgroundFallback} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.72)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backgroundGradient}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.contentGlassLayer,
          { transform: [{ translateY: contentGlassTranslateY }] },
        ]}
      >
        <BlurView intensity={10} tint="dark" style={styles.contentGlassBlurSoft} />
        <BlurView intensity={22} tint="dark" style={styles.contentGlassBlurMid} />
        <BlurView intensity={40} tint="dark" style={styles.contentGlassBlurStrong} />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0)',
            'rgba(10,10,10,0.04)',
            'rgba(10,10,10,0.12)',
            'rgba(10,10,10,0.24)',
            'rgba(10,10,10,0.36)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.contentGlassGradient}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.fixedOverflowWrap,
          { top: insets.top + 12, opacity: fixedOverflowOpacity },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.fixedOverflowBtn}
          onPress={() => setProfileMenuVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.fixedOverflowText}>•••</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridListContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListHeaderComponent={
          <ProfileHeroHeader
            coverUrl={profile?.cover_url}
            avatarUrl={profile?.avatar_url}
            username={profile?.username}
            displayName={profile?.display_name}
            bio={profile?.bio}
            stats={[
              { key: 'posts', value: posts.length, label: 'Posts' },
              { key: 'links', value: linkCount, label: 'Links', onPress: openLinks },
            ]}
            actionRow={
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.9}
              >
                <Text style={styles.editProfileBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.gridItem}
            onPress={() => navigation.navigate('PostDetail', { post: item })}
          >
            <Image source={{ uri: item.media_url }} style={styles.gridImage} resizeMode="cover" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No posts yet</Text>
            <Text style={styles.emptySubtext}>Share your first photo from the Post tab</Text>
          </View>
        }
        style={styles.container}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      />

      <ProfileLinksSheet
        visible={linksModal}
        users={listUsers}
        loading={listLoading}
        onClose={() => setLinksModal(false)}
        onPressUser={(userId) => {
          setLinksModal(false);
          navigation.navigate('UserProfile', { userId });
        }}
      />

      <Modal
        visible={profileMenuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setProfileMenuVisible(false)}
        >
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                navigation.navigate('EditProfile');
              }}
            >
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                navigation.navigate('Settings');
              }}
            >
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  contentGlassLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: Math.round(PROFILE_HERO_HEIGHT * 0.48),
    height: PROFILE_HERO_HEIGHT + 2400,
  },
  contentGlassBlurSoft: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 180,
    opacity: 0.16,
  },
  contentGlassBlurMid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 70,
    height: 280,
    opacity: 0.28,
  },
  contentGlassBlurStrong: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 160,
    bottom: 0,
    opacity: 0.42,
  },
  contentGlassGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  container: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fixedOverflowWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
  },
  fixedOverflowBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  fixedOverflowText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -1,
    letterSpacing: 1,
  },
  editProfileBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#fff',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  editProfileBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
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
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emptySubtext: { fontSize: 14, color: 'rgba(255,255,255,0.82)', textAlign: 'center' },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  menu: {
    position: 'absolute',
    top: 66,
    right: 16,
    minWidth: 176,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuItemText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '600',
  },
});
