import React, { useState } from 'react';
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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '../lib/supabase';

/** Cool slate glass — distinct from edit profile’s warmer violet-tinted cards. */
function SettingsGlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.cardOuter}>
      <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.cardTint} pointerEvents="none" />
      <View style={styles.cardInner}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
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
    if (showAbout) {
      setShowAbout(false);
      return;
    }
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
                      ],
                    );
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ],
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0c1220', '#06070a', '#0a0e16']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(72, 98, 180, 0.14)', 'transparent', 'rgba(20, 40, 72, 0.2)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.screenIntro}>Account, privacy, and app preferences.</Text>

          <Text style={styles.sectionTitle}>Account</Text>
          <SettingsGlassCard>
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setShowChangePassword((v) => !v);
                setNewPassword('');
                setConfirmPassword('');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.rowLabel}>Change password</Text>
              <Text style={styles.chevron}>{showChangePassword ? '⌃' : '›'}</Text>
            </TouchableOpacity>
            {showChangePassword ? (
              <View style={styles.expandedBlock}>
                <View style={styles.divider} />
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldLabel}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, savingPassword && styles.primaryBtnDisabled]}
                  onPress={changePassword}
                  disabled={savingPassword}
                  activeOpacity={0.92}
                >
                  {savingPassword ? (
                    <ActivityIndicator color="#111" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Update password</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </SettingsGlassCard>

          <Text style={styles.sectionTitle}>Notifications</Text>
          <SettingsGlassCard>
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.rowLabelBlock}>
                <Text style={styles.rowLabel}>Push notifications</Text>
                <Text style={styles.rowHint}>Alerts for activity on your account</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={(v) => {
                  setNotificationsEnabled(v);
                  Alert.alert('Coming soon', 'Push notification settings will be available in a future update.');
                  setNotificationsEnabled(false);
                }}
                trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(88, 140, 255, 0.5)' }}
                thumbColor={Platform.OS === 'ios' ? '#fff' : '#e8e8e8'}
                ios_backgroundColor="rgba(255,255,255,0.12)"
              />
            </View>
          </SettingsGlassCard>

          <Text style={styles.sectionTitle}>About this account</Text>
          <SettingsGlassCard>
            <TouchableOpacity style={styles.row} onPress={loadAbout} activeOpacity={0.85}>
              <Text style={styles.rowLabel}>Account info</Text>
              {loadingAbout ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
              ) : (
                <Text style={styles.chevron}>{showAbout ? '⌃' : '›'}</Text>
              )}
            </TouchableOpacity>
            {showAbout ? (
              <View style={styles.expandedBlock}>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue} numberOfLines={2}>
                    {email || '—'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Member since</Text>
                  <Text style={styles.infoValue}>{memberSince || '—'}</Text>
                </View>
                <View style={[styles.infoRow, styles.infoRowLast]}>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoValue}>{location ?? 'Not set'}</Text>
                </View>
              </View>
            ) : null}
          </SettingsGlassCard>

          <Text style={styles.sectionTitle}>General</Text>
          <SettingsGlassCard>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={() => Alert.alert('Coming soon', 'Language settings will be available in a future update.')}
              activeOpacity={0.85}
            >
              <Text style={styles.rowLabel}>Language</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowMeta}>English</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          </SettingsGlassCard>

          <SettingsGlassCard>
            <TouchableOpacity
              style={styles.soloRow}
              onPress={() => supabase.auth.signOut()}
              activeOpacity={0.85}
            >
              <Text style={styles.rowLabelEmphasis}>Sign out</Text>
            </TouchableOpacity>
          </SettingsGlassCard>

          <SettingsGlassCard>
            <TouchableOpacity
              style={styles.soloRow}
              onPress={handleDeleteAccount}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteLabel}>Delete account</Text>
            </TouchableOpacity>
          </SettingsGlassCard>

          <View style={styles.bottomPad} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06070a',
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  screenIntro: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.52)',
    paddingHorizontal: 20,
    marginBottom: 22,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(140, 175, 255, 0.55)',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 10,
    marginTop: 4,
  },
  cardOuter: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(140, 175, 255, 0.18)',
    ...(Platform.OS === 'ios' ? { borderCurve: 'continuous' as const } : {}),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  cardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18, 26, 44, 0.52)',
  },
  cardInner: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  soloRow: {
    paddingVertical: 17,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabelBlock: {
    flex: 1,
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.94)',
  },
  rowLabelEmphasis: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  rowHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMeta: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.45)',
  },
  chevron: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '300',
  },
  expandedBlock: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.85,
  },
  input: {
    width: '100%',
    minHeight: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
  },
  primaryBtn: {
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.48)',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  deleteLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 130, 150, 0.95)',
  },
  bottomPad: {
    height: 24,
  },
});
