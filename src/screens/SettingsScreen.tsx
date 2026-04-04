import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();

  const [email, setEmail] = useState('');
  const [memberSince, setMemberSince] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [loadingAbout, setLoadingAbout] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  async function loadAbout() {
    if (showAbout) { setShowAbout(false); return; }
    setLoadingAbout(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email ?? '');
      const date = new Date(user.created_at);
      setMemberSince(date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

      const { data: profile } = await supabase
        .from('users')
        .select('location_lat, location_lng')
        .eq('id', user.id)
        .single();

      if (profile?.location_lat && profile?.location_lng) {
        setLocation(`${profile.location_lat.toFixed(4)}, ${profile.location_lng.toFixed(4)}`);
      } else {
        setLocation(null);
      }
    }
    setLoadingAbout(false);
    setShowAbout(true);
  }

  async function changePassword() {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Please fill in both fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Password must be at least 6 characters');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      Alert.alert('Password updated', 'Your password has been changed successfully.');
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This will permanently delete your account and all your data.',
      [
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'This cannot be undone. All your posts, messages, and followers will be lost.',
              [
                {
                  text: 'Yes, delete my account',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert(
                      'Final confirmation',
                      'You are about to permanently delete your account. There is no going back.',
                      [
                        {
                          text: 'I understand, delete everything',
                          style: 'destructive',
                          onPress: async () => {
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) return;
                            await supabase.from('users').delete().eq('id', user.id);
                            await supabase.auth.signOut();
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Account section */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.rowLabel}>Edit Profile</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => { setShowChangePassword((v) => !v); setNewPassword(''); setConfirmPassword(''); }}
        >
          <Text style={styles.rowLabel}>Change Password</Text>
          <Text style={styles.chevron}>{showChangePassword ? '⌃' : '›'}</Text>
        </TouchableOpacity>
        {showChangePassword && (
          <View style={styles.expandedContent}>
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor="#999"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor="#999"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.actionBtn, savingPassword && styles.actionBtnDisabled]}
              onPress={changePassword}
              disabled={savingPassword}
            >
              {savingPassword
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionBtnText}>Update Password</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Notifications section */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Push notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={(v) => {
              setNotificationsEnabled(v);
              Alert.alert('Coming soon', 'Push notification settings will be available in a future update.');
              setNotificationsEnabled(false);
            }}
            trackColor={{ false: '#e0e0e0', true: '#1a1a1a' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* About Account section */}
      <Text style={styles.sectionTitle}>About Account</Text>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={loadAbout}>
          <Text style={styles.rowLabel}>Account info</Text>
          {loadingAbout
            ? <ActivityIndicator size="small" color="#aaa" />
            : <Text style={styles.chevron}>{showAbout ? '⌃' : '›'}</Text>
          }
        </TouchableOpacity>
        {showAbout && (
          <View style={styles.expandedContent}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{email}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Member since</Text>
              <Text style={styles.infoValue}>{memberSince}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{location ?? 'Not set'}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Language section */}
      <Text style={styles.sectionTitle}>Language</Text>
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => Alert.alert('Coming soon', 'Language settings will be available in a future update.')}
        >
          <Text style={styles.rowLabel}>Language</Text>
          <Text style={styles.rowValue}>English  ›</Text>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <View style={[styles.section, { marginTop: 8 }]}>
        <TouchableOpacity style={styles.row} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.rowLabel}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Delete account */}
      <View style={[styles.section, { marginTop: 8 }]}>
        <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
          <Text style={styles.deleteLabel}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { paddingVertical: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#aaa',
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 20, marginBottom: 6, marginTop: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  rowLabel: { fontSize: 15, color: '#1a1a1a' },
  rowValue: { fontSize: 15, color: '#aaa' },
  chevron: { fontSize: 20, color: '#aaa', lineHeight: 24 },
  expandedContent: {
    paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4,
    backgroundColor: '#fafaf8',
  },
  input: {
    height: 46, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: '#1a1a1a',
    marginBottom: 10,
  },
  actionBtn: {
    height: 46, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  actionBtnDisabled: { backgroundColor: '#ccc' },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  infoLabel: { fontSize: 14, color: '#888' },
  infoValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  deleteLabel: { fontSize: 15, color: '#e0245e' },
});
