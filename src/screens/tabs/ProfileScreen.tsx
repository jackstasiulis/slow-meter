import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, Dimensions, BackHandler, Easing } from 'react-native';
import { Image } from 'expo-image';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { fetchProfileLinkCount, fetchProfileLinkPartnerIds } from '../../lib/profileLinks';
import { User, Post } from '../../types';
import ProfileHeroHeader from '../../components/profile/ProfileHeroHeader';
import ProfileMaskedBlur from '../../components/profile/ProfileMaskedBlur';
import ProfileLinksSheet, { ProfileLinkUser } from '../../components/profile/ProfileLinksSheet';
import {
  PROFILE_CARD_HEIGHT,
  PROFILE_CARD_WIDTH,
  PROFILE_GRID_COL_GAP,
  PROFILE_GRID_H_PAD,
  PROFILE_GRID_ROW_GAP,
  PROFILE_HERO_HEIGHT,
  PROFILE_CONTENT_TOP_OFFSET,
  PROFILE_SCRIM_SCROLL_HEIGHT,
  PROFILE_SCRIM_TOP,
} from '../../components/profile/constants';
import { useSetProfileInlineEditDockOpen } from '../../context/ProfileInlineEditContext';
import { navigateToUserProfile } from '../../navigation/navigateToUserProfile';
import EditProfilePanel from '../../components/profile/EditProfilePanel';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const editProgress = useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [linksModal, setLinksModal] = useState(false);
  const [listUsers, setListUsers] = useState<ProfileLinkUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [linkCount, setLinkCount] = useState(0);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [editPanelMounted, setEditPanelMounted] = useState(false);
  const [editPanelKey, setEditPanelKey] = useState(0);
  const setProfileInlineEditDockOpen = useSetProfileInlineEditDockOpen();

  // Fade the fixed ••• as the name approaches the top — tighter range so it doesn’t linger.
  const overflowFadeStart = Math.round(PROFILE_HERO_HEIGHT * 0.28) + Math.round(insets.top * 0.2);
  const overflowFadeEnd = overflowFadeStart + Math.round(PROFILE_HERO_HEIGHT * 0.09);
  const fixedOverflowOpacity = scrollY.interpolate({
    inputRange: [0, overflowFadeStart, overflowFadeEnd],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const contentGlassTranslateY = Animated.multiply(scrollY, -1);

  async function load() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const [{ data: userData }, { data: postsData }, linkCount] = await Promise.all([
      supabase.from('users').select('*').eq('id', authUser.id).single(),
      supabase.from('posts').select('*, user:users!posts_user_id_fkey(id, username, avatar_url)').eq('user_id', authUser.id).order('created_at', { ascending: false }),
      fetchProfileLinkCount(authUser.id),
    ]);

    setProfile(userData);
    setPosts(postsData ?? []);
    setLinkCount(linkCount);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, []);

  const openEditProfile = useCallback(() => {
    setEditPanelKey((k) => k + 1);
    setProfileInlineEditDockOpen(true);
    setEditPanelMounted(true);
    editProgress.stopAnimation();
    editProgress.setValue(0);
    Animated.timing(editProgress, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [editProgress, setProfileInlineEditDockOpen]);

  const closeEditProfile = useCallback(() => {
    setProfileInlineEditDockOpen(false);
    Animated.timing(editProgress, {
      toValue: 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEditPanelMounted(false);
    });
  }, [editProgress, setProfileInlineEditDockOpen]);

  useEffect(() => {
    return () => setProfileInlineEditDockOpen(false);
  }, [setProfileInlineEditDockOpen]);

  useEffect(() => {
    if (!editPanelMounted) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeEditProfile();
      return true;
    });
    return () => sub.remove();
  }, [editPanelMounted, closeEditProfile]);

  const profileContentTranslateX = editProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_WIDTH],
    extrapolate: 'clamp',
  });

  const editPanelTranslateX = editProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0],
    extrapolate: 'clamp',
  });

  async function openLinks() {
    if (!profile) return;
    setLinksModal(true);
    setListLoading(true);
    setListUsers([]);

    const otherIds = await fetchProfileLinkPartnerIds(profile.id);

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
        style={[styles.editModeBackdropEnhance, { opacity: editProgress }]}
      >
        <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.editModeBackdropTint} />
      </Animated.View>
      <Animated.View
        style={[styles.profileContentSlide, { transform: [{ translateX: profileContentTranslateX }] }]}
        pointerEvents={editPanelMounted ? 'none' : 'auto'}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.contentScrimLayer,
            { transform: [{ translateY: contentGlassTranslateY }] },
          ]}
        >
          <ProfileMaskedBlur />
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
          showsVerticalScrollIndicator={false}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridListContent,
            { paddingTop: PROFILE_CONTENT_TOP_OFFSET, paddingBottom: tabBarHeight + 20 },
          ]}
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
                  onPress={openEditProfile}
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
              <Image source={{ uri: item.media_url }} style={styles.gridImage} contentFit="cover" />
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
      </Animated.View>

      {editPanelMounted ? (
        <Animated.View
          style={[
            styles.editProfileLayer,
            { transform: [{ translateX: editPanelTranslateX }] },
          ]}
          pointerEvents="box-none"
        >
          <EditProfilePanel
            presentation="embedded"
            refreshKey={editPanelKey}
            onClose={closeEditProfile}
            onSaved={() => {
              void load();
              closeEditProfile();
            }}
          />
        </Animated.View>
      ) : null}

      <ProfileLinksSheet
        visible={linksModal}
        users={listUsers}
        loading={listLoading}
        onClose={() => setLinksModal(false)}
        onPressUser={(userId) => {
          setLinksModal(false);
          navigateToUserProfile(navigation, userId);
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
            <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.menuGlassTint} pointerEvents="none" />
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDivider]}
              onPress={() => {
                setProfileMenuVisible(false);
                openEditProfile();
              }}
            >
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDivider]}
              onPress={() => {
                setProfileMenuVisible(false);
                navigation.navigate('Settings');
              }}
            >
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                void supabase.auth.signOut();
              }}
            >
              <Text style={styles.menuItemSignOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  editModeBackdropEnhance: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  editModeBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  profileContentSlide: {
    flex: 1,
    zIndex: 3,
  },
  editProfileLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
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
    backgroundColor: 'rgba(10,10,12,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  fixedOverflowText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginTop: -2,
    letterSpacing: 0.5,
  },
  editProfileBtn: {
    flex: 1,
    borderRadius: 999,
    minHeight: 46,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  editProfileBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menu: {
    position: 'absolute',
    top: 66,
    right: 16,
    minWidth: 188,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  menuGlassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.22)',
  },
  menuItemText: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemSignOut: {
    color: '#ff9a9a',
    fontSize: 15,
    fontWeight: '600',
  },
});
