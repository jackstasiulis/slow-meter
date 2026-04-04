import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

export default function EditPostScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { post } = route.params;

  const [caption, setCaption] = useState(post.caption ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('posts')
      .update({ caption: caption.trim() || null })
      .eq('id', post.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      navigation.goBack();
    }
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <View style={styles.content}>
        <Text style={styles.label}>Caption</Text>
        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
          autoFocus
        />
        <TouchableOpacity
          style={[styles.btn, saving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { padding: 20, flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 12, fontSize: 15, color: '#1a1a1a',
    minHeight: 120, textAlignVertical: 'top', marginBottom: 20,
  },
  btn: {
    height: 50, backgroundColor: '#1a1a1a', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
