import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';

import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import FeedScreen from './src/screens/tabs/FeedScreen';
import DiscoverScreen from './src/screens/tabs/DiscoverScreen';
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
import PollDetailScreen from './src/screens/PollDetailScreen';
import AvailabilityCheckDetailScreen from './src/screens/AvailabilityCheckDetailScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const MsgStack = createNativeStackNavigator();

function TabIcon({ label }: { label: string }) {
  const icons: Record<string, string> = {
    Feed: '🏠', Discover: '🔍', Post: '➕',
    Messages: '💬', Notifications: '🔔', Profile: '👤',
  };
  return <Text style={{ fontSize: 20 }}>{icons[label] ?? '•'}</Text>;
}

function MessagesStack() {
  return (
    <MsgStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fafaf8' },
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <MsgStack.Screen name="MessagesList" component={MessagesScreen} options={{ title: 'Messages' }} />
      <MsgStack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={({ route }: any) => ({
          title: route.params?.isGroup
            ? (route.params?.groupName ?? 'Group')
            : `@${route.params?.otherUsername ?? ''}`,
        })}
      />
    </MsgStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: () => <TabIcon label={route.name} />,
        tabBarLabel: route.name,
        tabBarActiveTintColor: '#1a1a1a',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#eee' },
        tabBarHideOnKeyboard: true,
        headerStyle: { backgroundColor: '#fafaf8' },
        headerTitleStyle: { fontWeight: '700', letterSpacing: -0.5 },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen name="Post" component={PostScreen} />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{ headerShown: false }}
        listeners={({ navigation }) => ({
          tabPress: () => navigation.navigate('Messages', { screen: 'MessagesList' }),
        })}
      />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainApp() {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#fafaf8' },
        headerTitleStyle: { fontWeight: '700' },
        headerBackTitle: '',
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: '' }} />
      <RootStack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Post' }} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <RootStack.Screen name="EditPost" component={EditPostScreen} options={{ title: 'Edit Post' }} />
      <RootStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <RootStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: '' }} />
      <RootStack.Screen name="PollDetail" component={PollDetailScreen} options={{ title: 'Poll Results' }} />
      <RootStack.Screen name="AvailabilityCheckDetail" component={AvailabilityCheckDetailScreen} options={{ title: 'Availability' }} />
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

  if (!session) {
    return showSignUp
      ? <SignUpScreen onSwitch={() => setShowSignUp(false)} />
      : <LoginScreen onSwitch={() => setShowSignUp(true)} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <MainApp />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
