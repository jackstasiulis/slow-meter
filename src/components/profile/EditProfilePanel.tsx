import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, Keyboard, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase';
import CoverCropModal from './CoverCropModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const COVER_PREVIEW_H = Math.round((SCREEN_WIDTH - 48) * 0.36);
const FLOATING_SAVE_AREA_H = 124;

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.glassCardOuter}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassCardTint} pointerEvents="none" />
      <View style={styles.glassCardInner}>{children}</View>
    </View>
  );
}

export type EditProfilePanelProps = {
  presentation: 'fullscreen' | 'embedded';
  onClose: () => void;
  /** Called after a successful save (e.g. navigate back or dismiss inline editor). */
  onSaved?: () => void;
  /** When embedded, bump this when opening so the form reloads from the server. */
  refreshKey?: number;
};

export default function EditProfilePanel({
  presentation,
  onClose,
  onSaved,
  refreshKey,
}: EditProfilePanelProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const usernameInputRef = useRef<TextInput | null>(null);
  const displayNameInputRef = useRef<TextInput | null>(null);
  const bioInputRef = useRef<TextInput | null>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const centerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [newCoverUri, setNewCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
  const [initialUsername, setInitialUsername] = useState('');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [initialBio, setInitialBio] = useState('');

  const onCoverCropComplete = useCallback((uri: string) => {
    setNewCoverUri(uri);
  }, []);

  const loadUserFromDb = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) {
      const loadedUsername = data.username ?? '';
      const loadedDisplayName = data.display_name ?? '';
      const loadedBio = data.bio ?? '';
      setUsername(loadedUsername);
      setDisplayName(loadedDisplayName);
      setBio(loadedBio);
      setInitialUsername(loadedUsername);
      setInitialDisplayName(loadedDisplayName);
      setInitialBio(loadedBio);
      setAvatarUrl(data.avatar_url ?? null);
      setCoverUrl(data.cover_url ?? null);
      setNewAvatarUri(null);
      setNewCoverUri(null);
    }
  }, []);

  useEffect(() => {
    void loadUserFromDb();
  }, [loadUserFromDb, presentation, refreshKey ?? -1]);

  const centerFocusedInput = useCallback((input: TextInput | null, keyboardHeightOverride?: number) => {
    if (!input || !scrollRef.current) return;
    const keyboardHeight = keyboardHeightOverride ?? keyboardHeightRef.current;
    const usableHeight = SCREEN_HEIGHT - keyboardHeight - Math.max(insets.bottom, 12) - 68;
    const targetCenterY = Math.max(usableHeight * 0.5, 120);

    input.measureInWindow((_x, y, _w, h) => {
      const inputCenterY = y + h / 2;
      const delta = inputCenterY - targetCenterY;
      const nextY = Math.max(0, scrollYRef.current + delta);
      scrollRef.current?.scrollTo({ y: nextY, animated: true });
    });
  }, [insets.bottom]);

  const focusAndCenter = useCallback((input: TextInput | null) => {
    focusedInputRef.current = input;
    if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
    centerTimeoutRef.current = setTimeout(() => {
      centerFocusedInput(input);
    }, 80);
  }, [centerFocusedInput]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      keyboardHeightRef.current = e.endCoordinates?.height ?? 0;
      if (focusedInputRef.current) {
        centerFocusedInput(focusedInputRef.current, keyboardHeightRef.current);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      if (centerTimeoutRef.current) clearTimeout(centerTimeoutRef.current);
    };
  }, [centerFocusedInput]);

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled) setNewAvatarUri(result.assets[0].uri);
  }

  async function pickCoverForCrop() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setCropSourceUri(result.assets[0].uri);
      setCropModalVisible(true);
    }
  }

  async function openAdjustCover() {
    const uri = newCoverUri ?? coverUrl;
    if (!uri) return;
    try {
      if (uri.startsWith('http')) {
        const base = FileSystem.cacheDirectory;
        if (!base) {
          Alert.alert('Unable to edit', 'Temporary storage is not available.');
          return;
        }
        const dest = `${base}cover-adjust-${Date.now()}.jpg`;
        const dl = await FileSystem.downloadAsync(uri, dest);
        setCropSourceUri(dl.uri);
      } else {
        setCropSourceUri(uri);
      }
      setCropModalVisible(true);
    } catch {
      Alert.alert('Unable to edit', 'Could not load this cover image.');
    }
  }

  function closeCropModal() {
    setCropModalVisible(false);
    setCropSourceUri(null);
  }

  async function save() {
    if (!username.trim()) {
      Alert.alert('Username cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      let finalAvatarUrl = avatarUrl;
      if (newAvatarUri) {
        // Resize avatar to 400×400 max — plenty for any display size, fraction of the original
        const resizedAvatar = await ImageManipulator.manipulateAsync(
          newAvatarUri,
          [{ resize: { width: 400, height: 400 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        const fileExt = 'jpg';
        const filePath = `${user.id}/avatar.${fileExt}`;
        const contentType = 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(resizedAvatar.uri, { encoding: 'base64' as any });
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, decode(base64), { contentType, upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        finalAvatarUrl = publicUrl;
      }

      let finalCoverUrl = coverUrl;
      if (newCoverUri) {
        // Resize cover to max 1200px wide — sharp on all phone screens, ~10× smaller file
        const resizedCover = await ImageManipulator.manipulateAsync(
          newCoverUri,
          [{ resize: { width: 1200 } }],
          { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
        );
        const fileExt = 'jpg';
        const filePath = `${user.id}/cover.${fileExt}`;
        const contentType = 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(resizedCover.uri, { encoding: 'base64' as any });
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, decode(base64), { contentType, upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
        const sep = publicUrl.includes('?') ? '&' : '?';
        finalCoverUrl = `${publicUrl}${sep}t=${Date.now()}`;
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
      onSaved?.();
      if (!onSaved) onClose();
    } catch (err: any) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    const usernameChanged = username.trim() !== initialUsername.trim();
    const displayNameChanged = displayName.trim() !== initialDisplayName.trim();
    const bioChanged = bio.trim() !== initialBio.trim();
    const avatarChanged = Boolean(newAvatarUri);
    const coverChanged = Boolean(newCoverUri);
    return usernameChanged || displayNameChanged || bioChanged || avatarChanged || coverChanged;
  }, [
    username,
    displayName,
    bio,
    initialUsername,
    initialDisplayName,
    initialBio,
    newAvatarUri,
    newCoverUri,
  ]);
  const displayAvatar = newAvatarUri ?? avatarUrl;
  const displayCover = newCoverUri ?? coverUrl;

  const form = (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          ref={scrollRef}
          style={styles.formScroll}
          contentContainerStyle={[
            styles.formScrollContent,
            {
              paddingTop: Math.max(insets.top, 10) + 52,
              paddingBottom: Math.max(insets.bottom, 16) + FLOATING_SAVE_AREA_H,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={false}
          bounces
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <Text style={styles.sectionHint}>
              Pick a cover image, then adjust zoom and position for the profile background.
            </Text>
          </View>
          <GlassCard>
            <View style={styles.coverActionsRow}>
              <TouchableOpacity
                style={styles.coverPreviewWrap}
                onPress={pickCoverForCrop}
                activeOpacity={0.88}
              >
                {displayCover ? (
                  <Image source={{ uri: displayCover }} style={styles.coverPreviewImg} contentFit="cover" />
                ) : (
                  <View style={styles.coverPreviewEmpty}>
                    <Text style={styles.coverPreviewEmptyText}>Choose Cover</Text>
                  </View>
                )}
              </TouchableOpacity>
              {displayCover ? (
                <TouchableOpacity
                  style={styles.adjustFramingBtn}
                  onPress={() => void openAdjustCover()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.adjustFramingBtnText}>Adjust Framing</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </GlassCard>

          <GlassCard>
            <Text style={styles.fieldLabel}>Profile photo</Text>
            <TouchableOpacity style={styles.avatarRow} onPress={pickAvatar} activeOpacity={0.88}>
              {displayAvatar ? (
                <Image source={{ uri: displayAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>{username[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
              <View style={styles.avatarRowText}>
                <Text style={styles.avatarRowTitle}>Change picture</Text>
                <Text style={styles.avatarRowSub}>Square crop · posts & messages</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </GlassCard>
          <View style={[styles.sectionHeader, styles.sectionSpaced]}>
            <Text style={styles.sectionTitle}>Profile details</Text>
          </View>

          <GlassCard>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              ref={usernameInputRef}
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#a3a3ad"
              onFocus={() => focusAndCenter(usernameInputRef.current)}
            />

            <View style={styles.fieldDivider} />

            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              ref={displayNameInputRef}
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Optional"
              placeholderTextColor="#a3a3ad"
              onFocus={() => focusAndCenter(displayNameInputRef.current)}
            />

            <View style={styles.fieldDivider} />

            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              ref={bioInputRef}
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself…"
              placeholderTextColor="#a3a3ad"
              multiline
              maxLength={150}
              onFocus={() => focusAndCenter(bioInputRef.current)}
            />
            <Text style={styles.charHint}>{bio.length}/150</Text>
          </GlassCard>
        </ScrollView>
        <TouchableOpacity
          style={[styles.cancelBtnFloating, { top: Math.max(insets.top, 8) + 6 }]}
          onPress={onClose}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel="Close edit profile"
        >
          <View style={styles.cancelBtnCapsule}>
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.cancelBtnTint} pointerEvents="none" />
            <View style={styles.cancelBtnInner}>
              <Text style={styles.cancelBtnX}>×</Text>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </View>
          </View>
        </TouchableOpacity>
        {hasUnsavedChanges ? (
          <TouchableOpacity
            style={[styles.saveBtn, styles.saveBtnFloating, { bottom: Math.max(insets.bottom, 12) + 8 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.92}
          >
            {saving ? <ActivityIndicator color="#111" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
          </TouchableOpacity>
        ) : null}
      </SafeAreaView>

      <CoverCropModal
        visible={cropModalVisible}
        imageUri={cropSourceUri}
        onClose={closeCropModal}
        onComplete={onCoverCropComplete}
      />
    </>
  );

  if (presentation === 'fullscreen') {
    return (
      <View style={styles.root}>
        {displayCover ? (
          <>
            <Image
              source={{ uri: displayCover }}
              style={styles.coverBackdropImage}
              contentFit="cover"
              blurRadius={Platform.OS === 'ios' ? 12 : 8}
            />
            <BlurView intensity={78} tint="dark" style={styles.coverBackdropBlur} />
            <View style={styles.coverBackdropScrim} pointerEvents="none" />
            <View style={styles.coverBackdropScrimDeep} pointerEvents="none" />
          </>
        ) : (
          <View style={styles.coverBackdropFallback} />
        )}
        {form}
      </View>
    );
  }

  return (
    <View style={styles.embeddedRoot}>
      {form}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#08090a' },
  embeddedRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  coverBackdropImage: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.16 }],
  },
  coverBackdropBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  coverBackdropScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 5, 7, 0.38)',
  },
  coverBackdropScrimDeep: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  coverBackdropFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#08090a',
  },
  safe: { flex: 1, backgroundColor: 'transparent' },
  cancelBtnCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.38)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  cancelBtnTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 7, 9, 0.72)',
  },
  cancelBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 1,
  },
  cancelBtnX: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '300',
    marginTop: -2,
    opacity: 0.95,
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtnFloating: {
    position: 'absolute',
    left: 16,
    zIndex: 3,
  },
  formScroll: {
    flex: 1,
    flexGrow: 1,
    backgroundColor: 'transparent',
  },
  formScrollContent: {},
  sectionHeader: {
    marginHorizontal: 16,
    paddingHorizontal: 18,
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.74)',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.76)',
    lineHeight: 20,
  },
  sectionSpaced: { marginTop: 32 },
  glassCardOuter: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  glassCardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(38, 34, 40, 0.38)',
  },
  glassCardInner: {
    padding: 22,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 8,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.85,
  },
  coverActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  coverPreviewWrap: {
    flex: 1,
    minWidth: 0,
    height: COVER_PREVIEW_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  coverPreviewImg: { width: '100%', height: '100%' },
  coverPreviewEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  coverPreviewEmptyText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '700', textAlign: 'center' },
  adjustFramingBtn: {
    width: 108,
    height: COVER_PREVIEW_H,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  adjustFramingBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.16)' },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  avatarRowText: { flex: 1 },
  avatarRowTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  avatarRowSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
  chevron: { fontSize: 22, color: 'rgba(255,255,255,0.55)', fontWeight: '300' },
  input: {
    width: '100%',
    minHeight: 50,
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 26,
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#fff',
    marginBottom: 0,
  },
  bioInput: {
    minHeight: 108,
    paddingTop: 14,
    textAlignVertical: 'top',
    borderRadius: 22,
    marginBottom: 0,
  },
  charHint: { alignSelf: 'flex-end', fontSize: 12, color: 'rgba(255,255,255,0.62)', marginTop: -10, marginBottom: 4 },
  saveBtn: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnFloating: {
    position: 'absolute',
    left: 24,
    right: 24,
  },
  saveBtnText: { color: '#111', fontSize: 16, fontWeight: '800' },
});
