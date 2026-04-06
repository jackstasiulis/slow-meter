import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SCREEN_WIDTH = Dimensions.get('window').width;
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [newCoverUri, setNewCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      if (data) {
        setUsername(data.username ?? '');
        setDisplayName(data.display_name ?? '');
        setBio(data.bio ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        setCoverUrl(data.cover_url ?? null);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) setNewAvatarUri(result.assets[0].uri);
  }

  async function pickCover() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      // Use an in-app preview instead of the platform crop UI so the user sees
      // how the full profile background will look.
      allowsEditing: false,
    });
    if (!result.canceled) setNewCoverUri(result.assets[0].uri);
  }

  async function save() {
    if (!username.trim()) { Alert.alert('Username cannot be empty'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      let finalAvatarUrl = avatarUrl;
      if (newAvatarUri) {
        const fileExt = newAvatarUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const filePath = `${user.id}/avatar.${fileExt}`;
        const contentType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;
        const base64 = await FileSystem.readAsStringAsync(newAvatarUri, { encoding: 'base64' as any });
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, decode(base64), { contentType, upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        finalAvatarUrl = publicUrl;
      }

      let finalCoverUrl = coverUrl;
      if (newCoverUri) {
        const fileExt = newCoverUri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const filePath = `${user.id}/cover.${fileExt}`;
        const contentType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;
        const base64 = await FileSystem.readAsStringAsync(newCoverUri, { encoding: 'base64' as any });
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, decode(base64), { contentType, upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        finalCoverUrl = publicUrl;
      }

      const { error } = await supabase.from('users').update({
        username: username.trim(),
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: finalAvatarUrl,
        cover_url: finalCoverUrl,
      }).eq('id', user.id);

      if (error) throw error;
      Alert.alert('Saved!', 'Your profile has been updated.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#1a1a1a" />;

  const displayAvatar = newAvatarUri ?? avatarUrl;
  const displayCover = newCoverUri ?? coverUrl;
  const previewName = displayName.trim() || username.trim() || 'Your Name';
  const previewUsername = username.trim() || 'username';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Full profile background preview */}
        <TouchableOpacity style={styles.coverWrap} onPress={pickCover} activeOpacity={0.85}>
          {displayCover ? (
            <Image source={{ uri: displayCover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderIcon}>🖼</Text>
              <Text style={styles.coverPlaceholderText}>Choose profile background</Text>
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.78)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverPreviewContent}>
            <View style={styles.previewIdentityRow}>
              <View style={styles.previewAvatarWrap}>
                {displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={styles.previewAvatar} />
                ) : (
                  <Text style={styles.previewAvatarInitial}>{previewUsername[0]?.toUpperCase() ?? '?'}</Text>
                )}
              </View>
              <View style={styles.previewNameBlock}>
                <Text style={styles.previewDisplayName} numberOfLines={1}>
                  {previewName}
                </Text>
                <Text style={styles.previewUsername} numberOfLines={1}>
                  @{previewUsername}
                </Text>
              </View>
            </View>

            <View style={styles.previewActionRow}>
              <View style={styles.previewPrimaryButton}>
                <Text style={styles.previewPrimaryButtonText}>Edit Profile</Text>
              </View>
              <View style={styles.previewGhostButton}>
                <Text style={styles.previewGhostButtonText}>•••</Text>
              </View>
            </View>

            <View style={styles.previewStatsRow}>
              <View style={styles.previewStat}>
                <Text style={styles.previewStatValue}>0</Text>
                <Text style={styles.previewStatLabel}>Posts</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={styles.previewStatValue}>0</Text>
                <Text style={styles.previewStatLabel}>Links</Text>
              </View>
            </View>

            <View style={styles.previewBioCard}>
              <Text style={styles.previewBioText}>
                {bio.trim() || 'This preview shows how your profile background will look behind the page content.'}
              </Text>
            </View>
          </View>
          <View style={styles.coverEditBadge}>
            <Text style={styles.coverEditBadgeText}>Change background</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.previewHint}>Background preview for the full profile page</Text>

        {/* Avatar editor */}
        <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{username[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>Edit photo</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Optional"
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people about yourself..."
          placeholderTextColor="#999"
          multiline
          maxLength={150}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { paddingBottom: 40, alignItems: 'center' },
  coverWrap: {
    width: SCREEN_WIDTH,
    height: Math.round(SCREEN_WIDTH * 1.36),
    backgroundColor: '#e0e0e0',
    marginBottom: 10,
    position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  coverPlaceholderIcon: { fontSize: 28, color: '#bbb' },
  coverPlaceholderText: { fontSize: 13, color: '#bbb', fontWeight: '500' },
  coverPreviewContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 12,
  },
  previewIdentityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  previewAvatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAvatar: { width: '100%', height: '100%' },
  previewAvatarInitial: { fontSize: 30, fontWeight: '700', color: '#fff' },
  previewNameBlock: { maxWidth: '72%', alignItems: 'center' },
  previewDisplayName: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  previewUsername: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 18,
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
  },
  previewActionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPrimaryButtonText: {
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: '700',
  },
  previewGhostButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewGhostButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  previewStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(9,9,10,0.28)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  previewStat: { flex: 1, alignItems: 'center' },
  previewStatValue: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '700' },
  previewStatLabel: { color: 'rgba(255,255,255,0.84)', fontSize: 13, marginTop: 2 },
  previewBioCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(15,15,16,0.36)',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  previewBioText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, lineHeight: 21 },
  coverEditBadge: {
    position: 'absolute', bottom: 8, right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  coverEditBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  previewHint: {
    width: SCREEN_WIDTH - 48,
    color: '#666',
    fontSize: 13,
    marginBottom: 16,
  },
  avatarWrap: { marginTop: 0, marginBottom: 20, alignItems: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 40, fontWeight: '600', color: '#888' },
  editBadge: {
    marginTop: 8, paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: '#1a1a1a', borderRadius: 20,
  },
  editBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, paddingHorizontal: 24, width: '100%' },
  input: {
    width: SCREEN_WIDTH - 48, height: 48, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, fontSize: 15, color: '#1a1a1a', marginBottom: 16,
  },
  bioInput: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  saveBtn: {
    width: SCREEN_WIDTH - 48, height: 50, backgroundColor: '#1a1a1a',
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
