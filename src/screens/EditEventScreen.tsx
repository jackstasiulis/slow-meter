import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import {
  formatNominatimSuggestionLabel,
  fetchNominatimSearch,
  normalizeNominatimSearchQuery,
} from '../lib/nominatim';
import EventHeroCropModal from '../components/event/EventHeroCropModal';

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function parseDisplayDate(s: string | null): Date | null {
  if (!s?.trim()) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function parseDisplayTime(s: string | null): Date | null {
  if (!s?.trim()) return null;
  for (const base of ['2000-01-01', '01/01/2000', 'January 1, 2000']) {
    const d = new Date(`${base} ${s}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

type LocSuggestion = { name: string; lat: string; lon: string };

export default function EditEventScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { eventId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<LocSuggestion[]>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: string; lon: string } | null>(null);
  const [locationSearching, setLocationSearching] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [eventImageUri, setEventImageUri] = useState<string | null>(null);
  const [eventHeroCropUri, setEventHeroCropUri] = useState<string | null>(null);
  const [imageCleared, setImageCleared] = useState(false);

  const originalImageUrlRef = useRef<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedLocationSearch = useCallback((q: string) => {
    setLocationQuery(q);
    setEventLocation('');
    setLocationSuggestions([]);
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);
    if (!q.trim()) return;
    const qNormalized = normalizeNominatimSearchQuery(q);
    if (!qNormalized) return;
    locationSearchTimeout.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const data = await fetchNominatimSearch({ q, limit: 10 });
        setLocationSuggestions(
          data.map((r: any) => ({
            name: formatNominatimSuggestionLabel(r),
            lat: String(r.lat),
            lon: String(r.lon),
          }))
        );
      } catch {
        setLocationSuggestions([]);
      }
      setLocationSearching(false);
    }, 500);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      myIdRef.current = user.id;

      const { data: ev, error } = await supabase
        .from('events')
        .select('id, title, date, time, location, description, image_url, created_by')
        .eq('id', eventId)
        .single();

      if (error || !ev) {
        Alert.alert('Error', error?.message ?? 'Event not found');
        navigation.goBack();
        setLoading(false);
        return;
      }

      if (ev.created_by !== user.id) {
        Alert.alert('Error', 'Only the host can edit this event.');
        navigation.goBack();
        setLoading(false);
        return;
      }

      setTitle(ev.title ?? '');
      setEventDescription(ev.description ?? '');
      setEventLocation(ev.location ?? '');
      setSelectedDate(parseDisplayDate(ev.date));
      setSelectedTime(parseDisplayTime(ev.time));
      originalImageUrlRef.current = ev.image_url ?? null;
      setImageCleared(false);
      setEventImageUri(null);

      if (ev.location) {
        try {
          const data = await fetchNominatimSearch({ q: ev.location, limit: 1, addressdetails: false });
          if (data[0]) {
            setLocationCoords({ lat: String(data[0].lat), lon: String(data[0].lon) });
          }
        } catch {
          /* keep coords null */
        }
      }

      setLoading(false);
    })();
  }, [eventId, navigation]);

  async function pickEventImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setEventHeroCropUri(result.assets[0].uri);
    }
  }

  function staticMapFromCoords(lat: string, lon: string) {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=800x400&markers=${lat},${lon},red-pushpin`;
  }

  async function handleSave() {
    if (!title.trim() || saving) return;
    const myId = myIdRef.current;
    if (!myId) return;
    setSaving(true);

    let image_url: string | null = originalImageUrlRef.current;

    if (eventImageUri) {
      const resizedEvent = await ImageManipulator.manipulateAsync(
        eventImageUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
      );
      const filePath = `${myId}/event_${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(resizedEvent.uri, { encoding: 'base64' as any });
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, decode(base64), { contentType: 'image/jpeg', upsert: true });
      if (!uploadError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from('media').getPublicUrl(filePath);
        image_url = publicUrl;
      }
    } else if (imageCleared) {
      image_url = locationCoords ? staticMapFromCoords(locationCoords.lat, locationCoords.lon) : null;
    }

    const { error } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        date: selectedDate ? formatDate(selectedDate) : null,
        time: selectedTime ? formatTime(selectedTime) : null,
        location: eventLocation.trim() || null,
        description: eventDescription.trim() || null,
        image_url,
      })
      .eq('id', eventId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      navigation.goBack();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const displayRemote =
    !imageCleared && !eventImageUri && originalImageUrlRef.current ? originalImageUrlRef.current : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Event title"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />

        <Text style={styles.label}>Photo</Text>
        <TouchableOpacity style={styles.photoPicker} onPress={pickEventImage} activeOpacity={0.9}>
          {eventImageUri ? (
            <Image source={{ uri: eventImageUri }} style={styles.photoPreview} />
          ) : displayRemote ? (
            <Image source={{ uri: displayRemote }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoEmpty}>
              <Text style={styles.photoEmptyIcon}>🖼</Text>
              <Text style={styles.photoEmptyLabel}>Add or change photo</Text>
            </View>
          )}
          {(eventImageUri || displayRemote) && (
            <TouchableOpacity
              style={styles.photoClear}
              onPress={() => {
                setEventImageUri(null);
                setImageCleared(true);
              }}
            >
              <Text style={styles.photoClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.pickerBtn}
          onPress={() => {
            setShowDatePicker((v) => !v);
            setShowTimePicker(false);
          }}
        >
          <Text style={styles.pickerIcon}>📆</Text>
          <Text style={[styles.pickerText, !selectedDate && styles.pickerPlaceholder]}>
            {selectedDate ? formatDate(selectedDate) : 'Date (optional)'}
          </Text>
          {selectedDate ? (
            <TouchableOpacity
              onPress={() => {
                setSelectedDate(null);
                setShowDatePicker(false);
              }}
            >
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        {showDatePicker ? (
          <DateTimePicker
            value={selectedDate ?? new Date()}
            mode="date"
            display="spinner"
            textColor="#fff"
            themeVariant="dark"
            onChange={(_: any, date?: Date) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (date) setSelectedDate(date);
            }}
            style={styles.inlinePicker}
          />
        ) : null}

        <TouchableOpacity
          style={styles.pickerBtn}
          onPress={() => {
            setShowTimePicker((v) => !v);
            setShowDatePicker(false);
          }}
        >
          <Text style={styles.pickerIcon}>🕐</Text>
          <Text style={[styles.pickerText, !selectedTime && styles.pickerPlaceholder]}>
            {selectedTime ? formatTime(selectedTime) : 'Time (optional)'}
          </Text>
          {selectedTime ? (
            <TouchableOpacity
              onPress={() => {
                setSelectedTime(null);
                setShowTimePicker(false);
              }}
            >
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        {showTimePicker ? (
          <DateTimePicker
            value={selectedTime ?? new Date()}
            mode="time"
            display="spinner"
            textColor="#fff"
            themeVariant="dark"
            onChange={(_: any, time?: Date) => {
              if (Platform.OS === 'android') setShowTimePicker(false);
              if (time) setSelectedTime(time);
            }}
            style={styles.inlinePicker}
          />
        ) : null}

        <View style={styles.locationWrap}>
          <View style={styles.pickerBtn}>
            <Text style={styles.pickerIcon}>📍</Text>
            <TextInput
              style={styles.locationInput}
              placeholder="Location (optional)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={eventLocation || locationQuery}
              onChangeText={(t) => {
                if (eventLocation) setEventLocation('');
                debouncedLocationSearch(t);
              }}
              autoCorrect={false}
            />
            {locationQuery || eventLocation ? (
              <TouchableOpacity
                onPress={() => {
                  setEventLocation('');
                  setLocationQuery('');
                  setLocationSuggestions([]);
                  setLocationCoords(null);
                }}
              >
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {locationSearching ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginTop: 8 }} />
          ) : null}
          {locationSuggestions.length > 0 ? (
            <View style={styles.suggestBox}>
              {locationSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={`${s.name}-${i}`}
                  style={[styles.suggestRow, i < locationSuggestions.length - 1 && styles.suggestBorder]}
                  onPress={() => {
                    setEventLocation(s.name);
                    setLocationQuery(s.name);
                    setLocationCoords({ lat: s.lat, lon: s.lon });
                    setLocationSuggestions([]);
                  }}
                >
                  <Text style={styles.suggestText} numberOfLines={2}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={eventDescription}
          onChangeText={setEventDescription}
          placeholder="Description (optional)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          multiline
        />

        <TouchableOpacity
          style={[styles.saveBtn, (!title.trim() || saving) && styles.saveBtnOff]}
          onPress={handleSave}
          disabled={!title.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <EventHeroCropModal
        visible={Boolean(eventHeroCropUri)}
        imageUri={eventHeroCropUri}
        onClose={() => setEventHeroCropUri(null)}
        onComplete={(uri) => {
          setEventImageUri(uri);
          setEventHeroCropUri(null);
          setImageCleared(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08090a',
  },
  loadingBox: {
    flex: 1,
    backgroundColor: '#08090a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 8,
    marginTop: 4,
  },
  inputMulti: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  photoPicker: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    minHeight: 140,
  },
  photoPreview: {
    width: '100%',
    height: 160,
  },
  photoEmpty: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoEmptyIcon: { fontSize: 32 },
  photoEmptyLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: '600' },
  photoClear: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoClearText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pickerIcon: { fontSize: 16 },
  pickerText: { flex: 1, fontSize: 16, color: '#fff', fontWeight: '500' },
  pickerPlaceholder: { color: 'rgba(255,255,255,0.38)' },
  clearText: { color: 'rgba(255,255,255,0.55)', fontSize: 16, fontWeight: '600' },
  inlinePicker: { marginBottom: 8 },
  locationWrap: { marginBottom: 8 },
  locationInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 0,
    minHeight: 22,
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: 'rgba(12,12,14,1)',
  },
  suggestRow: { paddingHorizontal: 14, paddingVertical: 12 },
  suggestBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  suggestText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 20 },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnOff: { opacity: 0.45 },
  saveBtnText: { color: '#08090a', fontSize: 16, fontWeight: '700' },
});
