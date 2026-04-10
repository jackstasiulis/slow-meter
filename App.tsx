import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';

import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import FeedScreen from './src/screens/tabs/FeedScreen';
import RadarScreen from './src/screens/tabs/RadarScreen';
import PostScreen from './src/screens/tabs/PostScreen';
import MessagesScreen from './src/screens/tabs/MessagesScreen';
import ConversationScreen from './src/screens/tabs/ConversationScreen';
import NotificationsScreen from './src/screens/tabs/NotificationsScreen';
import ProfileScreen from './src/screens/tabs/ProfileScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import PostDetailScreen from './src/screens/PostDetailScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import EditPostScreen from './src/screens/EditPostScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EventDetailScreen from './src/screens/EventDetailScreen';
import EditEventScreen from './src/screens/EditEventScreen';
import PollDetailScreen from './src/screens/PollDetailScreen';
import AvailabilityCheckDetailScreen from './src/screens/AvailabilityCheckDetailScreen';
import ProfileTabIcon from './src/components/navigation/ProfileTabIcon';
import {
  ProfileInlineEditProvider,
  useProfileInlineEditDockConsumeSlowReturn,
  useProfileInlineEditDockOpen,
} from './src/context/ProfileInlineEditContext';
import {
  MessagesChatDockExitProvider,
  useMessagesChatDockEagerExit,
} from './src/context/MessagesChatDockExitContext';
import {
  FLOATING_TAB_BAR_STYLE,
  PROFILE_DOCK_BOTTOM_OFFSET,
  PROFILE_DOCK_HEIGHT,
  PROFILE_DOCK_WIDTH_RATIO,
} from './src/components/profile/constants';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const MsgStack = createNativeStackNavigator();
const FeedStack = createNativeStackNavigator();
const RadarStack = createNativeStackNavigator();
const PostStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

/** Dark nav bar so the system status bar (light content) stays readable; matches Edit Profile / tab surfaces. */
const nativeStackHeaderDark = {
  headerStyle: { backgroundColor: '#08090a' },
  headerTitleStyle: { fontWeight: '700' as const, color: '#fff' },
  headerTintColor: '#fff',
  headerBackTitle: '',
  headerBackButtonDisplayMode: 'minimal' as const,
  headerShadowVisible: false,
};

/** Slightly larger than RN’s default tab icon size (~25); kept ≤28 to fit the tab icon slot. */
const TAB_BAR_ICON_SIZE = 28;

const TAB_HIT_SLOP = { top: 16, bottom: 16, left: 14, right: 14 } as const;

/** Extra slide past the dock top so shadows don’t peek when “off” screen. */
const DOCK_HIDE_SLIDE_EXTRA = 14;
const DOCK_HIDE_MS = 280;
/** Snappier than hide so the dock feels prompt when leaving a chat. */
const DOCK_SHOW_MS = 100;
/** Dock return after closing inline profile edit (between chat’s quick show and the old 300ms ease). */
const DOCK_SHOW_AFTER_PROFILE_EDIT_MS = 180;

function GlassTabBarButton({ style, ...rest }: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...rest}
      hitSlop={TAB_HIT_SLOP}
      // Default tab layout uses justifyContent: 'flex-start' for a label under the icon;
      // with labels hidden, that leaves icons hugging the top. Force vertical centering.
      style={[style, styles.tabBarButtonPressable]}
    />
  );
}

function TabIcon({
  label,
  color,
  size = 24,
  focused,
}: {
  label: string;
  color: string;
  size?: number;
  focused: boolean;
}) {
  const icons: Record<string, { focused: keyof typeof Ionicons.glyphMap; idle: keyof typeof Ionicons.glyphMap }> = {
    Feed: { focused: 'home', idle: 'home-outline' },
    Radar: { focused: 'compass', idle: 'compass-outline' },
    Post: { focused: 'add-circle', idle: 'add-circle-outline' },
    Messages: { focused: 'chatbubble', idle: 'chatbubble-outline' },
  };

  const selected = icons[label];
  if (!selected) return null;
  return <Ionicons name={focused ? selected.focused : selected.idle} size={size} color={color} />;
}

function shouldHideDockInMessagesChat(state: React.ComponentProps<typeof BottomTabBar>['state']) {
  if (typeof state.index !== 'number') return false;
  const activeTab = state.routes[state.index];
  if (activeTab.name !== 'Messages') return false;
  const nested = getFocusedRouteNameFromRoute(activeTab) ?? 'MessagesList';
  return nested === 'Conversation';
}

/** RN’s `BottomTabBar` pins the bar with `start`/`end`: 0 so it ignores `left`/`right` on the same view. Wrapping constrains real width so margin changes are visible. */
function FloatingTabBar(props: React.ComponentProps<typeof BottomTabBar>) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const horizontalInset = (windowWidth * (1 - PROFILE_DOCK_WIDTH_RATIO)) / 2;

  const chatHiddenByRoute = shouldHideDockInMessagesChat(props.state);
  const { eagerShowDockAfterLeavingChat, clearLeavingChatDockSignal } = useMessagesChatDockEagerExit();
  const hiddenForChat = chatHiddenByRoute && !eagerShowDockAfterLeavingChat;
  const profileInlineEditOpen = useProfileInlineEditDockOpen();
  const consumePendingSlowDockReturn = useProfileInlineEditDockConsumeSlowReturn();
  const hidden = hiddenForChat || profileInlineEditOpen;
  const slideY = useRef(new Animated.Value(0)).current;
  const didInitialSlide = useRef(false);

  const hideTranslateY = useMemo(
    () =>
      PROFILE_DOCK_HEIGHT +
      insets.bottom +
      PROFILE_DOCK_BOTTOM_OFFSET +
      DOCK_HIDE_SLIDE_EXTRA,
    [insets.bottom],
  );

  useEffect(() => {
    if (!chatHiddenByRoute) {
      clearLeavingChatDockSignal();
    }
  }, [chatHiddenByRoute, clearLeavingChatDockSignal]);

  useEffect(() => {
    if (!didInitialSlide.current) {
      didInitialSlide.current = true;
      slideY.setValue(hidden ? hideTranslateY : 0);
      return;
    }
    const showSlow = !hidden && consumePendingSlowDockReturn();
    const showDuration = hidden
      ? DOCK_HIDE_MS
      : showSlow
        ? DOCK_SHOW_AFTER_PROFILE_EDIT_MS
        : DOCK_SHOW_MS;
    Animated.timing(slideY, {
      toValue: hidden ? hideTranslateY : 0,
      duration: hidden ? DOCK_HIDE_MS : showDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, hideTranslateY, slideY, consumePendingSlowDockReturn]);

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        start: horizontalInset,
        end: horizontalInset,
        bottom: insets.bottom + PROFILE_DOCK_BOTTOM_OFFSET,
        height: PROFILE_DOCK_HEIGHT,
        transform: [{ translateY: slideY }],
      }}
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

function MessagesStack() {
  return (
    <MsgStack.Navigator screenOptions={nativeStackHeaderDark}>
      <MsgStack.Screen
        name="MessagesList"
        component={MessagesScreen}
        options={{ title: 'Messages', headerShown: false }}
      />
      <MsgStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }: any) => ({
          title: route.params?.isGroup
            ? (route.params?.groupName ?? 'Group')
            : `@${route.params?.otherUsername ?? ''}`,
          animation: 'fade',
          contentStyle: { backgroundColor: '#08090a' },
        })}
      />
      <MsgStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
    </MsgStack.Navigator>
  );
}

const tabStackScreenOptions = {
  ...nativeStackHeaderDark,
  headerTitleStyle: { fontWeight: '700' as const, letterSpacing: -0.5, color: '#fff' },
};

function FeedTabStack() {
  return (
    <FeedStack.Navigator screenOptions={tabStackScreenOptions}>
      <FeedStack.Screen name="FeedRoot" component={FeedScreen} options={{ title: 'Feed' }} />
      <FeedStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
    </FeedStack.Navigator>
  );
}

function RadarTabStack() {
  return (
    <RadarStack.Navigator screenOptions={tabStackScreenOptions}>
      <RadarStack.Screen name="RadarRoot" component={RadarScreen} options={{ headerShown: false }} />
      <RadarStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
    </RadarStack.Navigator>
  );
}

function PostTabStack() {
  return (
    <PostStack.Navigator screenOptions={tabStackScreenOptions}>
      <PostStack.Screen name="PostRoot" component={PostScreen} options={{ title: 'Post' }} />
      <PostStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
    </PostStack.Navigator>
  );
}

function ProfileTabStack() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileRoot" component={ProfileScreen} />
      <ProfileStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  );
}

function MainTabs() {
  return (
    <ProfileInlineEditProvider>
    <MessagesChatDockExitProvider>
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      // We position the bar with bottom: insets.bottom + gap; disable extra bottom inset
      // inside the bar (RN adds paddingBottom: insets.bottom), which squishes icons upward.
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, focused }) =>
          route.name === 'Profile'
            ? <ProfileTabIcon focused={focused} size={TAB_BAR_ICON_SIZE} />
            : <TabIcon label={route.name} color={color} size={TAB_BAR_ICON_SIZE} focused={focused} />,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.66)',
        tabBarStyle: { ...FLOATING_TAB_BAR_STYLE },
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarButton: (props) => <GlassTabBarButton {...props} />,
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.dockBackgroundClip,
              { borderRadius: FLOATING_TAB_BAR_STYLE.borderRadius },
            ]}
          >
            <BlurView
              intensity={72}
              tint="dark"
              style={[StyleSheet.absoluteFill, { borderRadius: FLOATING_TAB_BAR_STYLE.borderRadius }]}
            />
            <View style={styles.floatingTabBarOverlay} />
            {Platform.OS === 'android' ? <View style={styles.floatingTabBarAndroidFallback} /> : null}
          </View>
        ),
        tabBarHideOnKeyboard: true,
        // Nested stacks own the header; hide the tab shell header to avoid double titles (e.g. Feed + FeedRoot).
        headerShown: false,
      })}
    >
      <Tab.Screen name="Feed" component={FeedTabStack} />
      <Tab.Screen name="Radar" component={RadarTabStack} />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        listeners={({ navigation }) => ({
          tabPress: () => navigation.navigate('Messages', { screen: 'MessagesList' }),
        })}
      />
      <Tab.Screen name="Post" component={PostTabStack} />
      <Tab.Screen name="Profile" component={ProfileTabStack} />
    </Tab.Navigator>
    </MessagesChatDockExitProvider>
    </ProfileInlineEditProvider>
  );
}

function MainApp() {
  return (
    <RootStack.Navigator screenOptions={nativeStackHeaderDark}>
      <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <RootStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Post' }} />
      <RootStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false, contentStyle: { backgroundColor: '#08090a' } }}
      />
      <RootStack.Screen name="EditPost" component={EditPostScreen} options={{ title: 'Edit Post' }} />
      <RootStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings', contentStyle: { backgroundColor: '#06070a' } }}
      />
      <RootStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ headerShown: false, contentStyle: { backgroundColor: '#08090a' } }}
      />
      <RootStack.Screen name="EditEvent" component={EditEventScreen} options={{ title: 'Edit Event' }} />
      <RootStack.Screen name="PollDetail" component={PollDetailScreen} options={{ title: 'Poll Results' }} />
      <RootStack.Screen name="AvailabilityCheckDetail" component={AvailabilityCheckDetailScreen} options={{ title: 'Availability' }} />
      <RootStack.Screen
        name="ConversationModal"
        component={ConversationScreen}
        options={({ route }: any) => ({
          title: route.params?.isGroup
            ? (route.params?.groupName ?? 'Group')
            : `@${route.params?.otherUsername ?? ''}`,
        })}
      />
    </RootStack.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [showSignUp, setShowSignUp] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={session ? 'light' : 'dark'} />
      {!session ? (
        showSignUp ? (
          <SignUpScreen onSwitch={() => setShowSignUp(false)} />
        ) : (
          <LoginScreen onSwitch={() => setShowSignUp(true)} />
        )
      ) : (
        <SafeAreaProvider>
          <NavigationContainer>
            <MainApp />
          </NavigationContainer>
        </SafeAreaProvider>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  dockBackgroundClip: {
    overflow: 'hidden',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : {}),
  },
  tabBarItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 2,
    minWidth: 48,
  },
  tabBarIcon: {
    marginTop: 0,
    marginBottom: 0,
  },
  tabBarButtonPressable: {
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
  },
  floatingTabBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,20,0.2)',
  },
  floatingTabBarAndroidFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,20,0.42)',
  },
});
