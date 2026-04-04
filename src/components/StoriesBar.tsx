import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

type Story = {
  id: string;
  media_url: string;
  user_id: string;
  created_at: string;
  user?: { username: string; avatar_url: string | null };
};

type StoryGroup = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  stories: Story[];
};

export default function StoriesBar() {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewing, setViewing] = useState<StoryGroup | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);
  const [showAddStory, setShowAddStory] = useState(false);
  const [storyImage, setStoryImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadStories(); }, []);

  async function loadStories() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: follows } = await supabase
      .from('links')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

    const linkedIds = (follows ?? []).map((r: any) => r.user_a_id === user.id ? r.user_b_id : r.user_a_id);
    const allIds = [user.id, ...linkedIds];

    const { data: stories } = await supabase
      .from('stories')
      .select('*, user:users!stories_user_id_fkey(username, avatar_url)')
      .in('user_id', allIds)
      .order('created_at', { ascending: false });

    if (!stories) return;

    const map: Record<string, StoryGroup> = {};
    for (const s of stories) {
      if (!map[s.user_id]) {
        map[s.user_id] = {
          user_id: s.user_id,
          username: s.user?.username ?? '',
          avatar_url: s.user?.avatar_url ?? null,
          stories: [],
        };
      }
      map[s.user_id].stories.push(s);
    }
    setGroups(Object.values(map));
  }

  function openStory(group: StoryGroup) {
    setViewing(group);
    setStoryIndex(0);
  }

  function nextStory() {
    if (!viewing) return;
    if (storyIndex < viewing.stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else {
      setViewing(null);
    }
  }

  async function pickStoryImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setStoryImage(result.assets[0].uri);
  }

  async function uploadStory() {
    if (!storyImage) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const fileExt = storyImage.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${user.id}/story_${Date.now()}.${fileExt}`;
      const contentType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;
      const base64 = await FileSystem.readAsStringAsync(storyImage, { encoding: 'base64' as any });
      const { error: uploadError } = await supabase.storage.from('media').upload(filePath, decode(base64), { contentType });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
      const { error } = await supabase.from('stories').insert({ user_id: user.id, media_url: publicUrl, media_type: 'photo' });
      if (error) throw error;
      setStoryImage(null);
      setShowAddStory(false);
      loadStories();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  const addStoryItem = { user_id: '__add__', username: '', avatar_url: null, stories: [] };
  const listData = [addStoryItem, ...groups];

  return (
    <>
      <FlatList
        data={listData}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.user_id === '__add__') {
            return (
              <TouchableOpacity style={styles.storyItem} onPress={() => { setStoryImage(null); setShowAddStory(true); }}>
                <View style={styles.addRing}>
                  <View style={styles.addCircle}>
                    <Text style={styles.addIcon}>+</Text>
                  </View>
                </View>
                <Text style={styles.storyUsername} numberOfLines={1}>Your story</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity style={styles.storyItem} onPress={() => openStory(item)}>
              <View style={styles.ring}>
                <View style={styles.avatarCircle}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <Text style={styles.initial}>{item.username[0]?.toUpperCase()}</Text>
                  )}
                </View>
              </View>
              <Text style={styles.storyUsername} numberOfLines={1}>{item.username}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Story viewer */}
      <Modal visible={!!viewing} animationType="fade" statusBarTranslucent>
        <StatusBar hidden />
        <TouchableOpacity style={styles.storyViewer} activeOpacity={1} onPress={nextStory}>
          {viewing && (
            <>
              <Image
                source={{ uri: viewing.stories[storyIndex]?.media_url }}
                style={styles.storyImage}
                resizeMode="contain"
              />
              <View style={styles.storyHeader}>
                <View style={styles.storyAvatarCircle}>
                  <Text style={styles.storyAvatarInitial}>{viewing.username[0]?.toUpperCase()}</Text>
                </View>
                <Text style={styles.storyUsernameOverlay}>@{viewing.username}</Text>
              </View>
              <View style={styles.progressDots}>
                {viewing.stories.map((_, i) => (
                  <View key={i} style={[styles.dot, i === storyIndex && styles.dotActive]} />
                ))}
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setViewing(null)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </Modal>

      {/* Add story modal */}
      <Modal visible={showAddStory} animationType="slide" transparent onRequestClose={() => setShowAddStory(false)}>
        <View style={styles.addStoryBackdrop}>
          <View style={styles.addStorySheet}>
            <View style={styles.handle} />
            <Text style={styles.addStoryTitle}>Add to Your Story</Text>

            <TouchableOpacity style={styles.addStoryPicker} onPress={pickStoryImage}>
              {storyImage ? (
                <Image source={{ uri: storyImage }} style={styles.addStoryPreview} />
              ) : (
                <View style={styles.addStoryPlaceholder}>
                  <Text style={styles.addStoryPlaceholderIcon}>+</Text>
                  <Text style={styles.addStoryPlaceholderText}>Choose a photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addStoryBtn, (!storyImage || uploading) && styles.addStoryBtnDisabled]}
              onPress={uploadStory}
              disabled={!storyImage || uploading}
            >
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addStoryBtnText}>Add to Story</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddStory(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  storyItem: { alignItems: 'center', width: 64 },
  addRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed',
    padding: 2, marginBottom: 4,
  },
  addCircle: {
    flex: 1, borderRadius: 30,
    backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center',
  },
  addIcon: { fontSize: 28, color: '#888', lineHeight: 32 },
  ring: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: '#1a1a1a',
    padding: 2, marginBottom: 4,
  },
  avatarCircle: {
    flex: 1, borderRadius: 30,
    backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  initial: { fontSize: 20, fontWeight: '600', color: '#888' },
  storyUsername: { fontSize: 11, color: '#555', width: 64, textAlign: 'center' },
  storyViewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  storyImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  storyHeader: { position: 'absolute', top: 60, left: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  storyAvatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  storyAvatarInitial: { fontSize: 14, fontWeight: '600', color: '#fff' },
  storyUsernameOverlay: { fontSize: 14, fontWeight: '600', color: '#fff' },
  progressDots: { position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1 },
  dotActive: { backgroundColor: '#fff' },
  closeButton: { position: 'absolute', top: 52, right: 16 },
  closeText: { fontSize: 20, color: '#fff' },
  addStoryBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  addStorySheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 16 },
  addStoryTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 20 },
  addStoryPicker: { width: '100%', aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#eee', marginBottom: 16 },
  addStoryPreview: { width: '100%', height: '100%' },
  addStoryPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addStoryPlaceholderIcon: { fontSize: 48, color: '#bbb' },
  addStoryPlaceholderText: { fontSize: 16, color: '#aaa' },
  addStoryBtn: { width: '100%', height: 50, backgroundColor: '#1a1a1a', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  addStoryBtnDisabled: { backgroundColor: '#ccc' },
  addStoryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 15, color: '#888' },
});
