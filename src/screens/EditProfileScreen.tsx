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
      allowsEditing: true,
      aspect: [3, 1],
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Cover image */}
        <TouchableOpacity style={styles.coverWrap} onPress={pickCover} activeOpacity={0.85}>
          {displayCover ? (
            <Image source={{ uri: displayCover }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Text style={styles.coverPlaceholderIcon}>🖼</Text>
              <Text style={styles.coverPlaceholderText}>Add cover image</Text>
            </View>
          )}
          <View style={styles.coverEditBadge}>
            <Text style={styles.coverEditBadgeText}>Edit cover</Text>
          </View>
        </TouchableOpacity>

        {/* Avatar — overlaps bottom of cover */}
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
    width: SCREEN_WIDTH, height: SCREEN_WIDTH / 3,
    backgroundColor: '#e0e0e0', marginBottom: 54,
    position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  coverPlaceholderIcon: { fontSize: 28, color: '#bbb' },
  coverPlaceholderText: { fontSize: 13, color: '#bbb', fontWeight: '500' },
  coverEditBadge: {
    position: 'absolute', bottom: 8, right: 12,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  coverEditBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  avatarWrap: { marginTop: -90, marginBottom: 20, alignItems: 'center' },
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
