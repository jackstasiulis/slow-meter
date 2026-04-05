import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  PixelRatio,
  Animated,
  PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { supabase } from '../../lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAGE_WIDTH = SCREEN_WIDTH - 40;

type TaggedUser = { id: string; username: string };
type CropState = { scale: number; panX: number; panY: number };

export default function PostScreen() {
  const navigation = useNavigation<any>();
  const headerHeight = useHeaderHeight();
  const [images, setImages] = useState<string[]>([]);
  // Original dimensions kept so we can compute crop bounds
  const [imageDims, setImageDims] = useState<{ width: number; height: number }[]>([]);
  const [cropRatio, setCropRatio] = useState<'4:3' | '4:3L' | '1:1'>('4:3');
  const [selectedThumb, setSelectedThumb] = useState<number | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  // ── Crop-gesture animated values ──────────────────────────────────────────
  // These drive the absolute position / size of the image inside the preview frame.
  // At scale=1, pan=(0,0): image exactly fills the frame (cover fit).
  const CW = SCREEN_WIDTH - 40;
  const animW = useRef(new Animated.Value(CW)).current;
  const animH = useRef(new Animated.Value(CW * 4 / 3)).current;
  const animL = useRef(new Animated.Value(0)).current;
  const animT = useRef(new Animated.Value(0)).current;

  // Live values tracked in refs so PanResponder callbacks always see current state
  const cropScaleR  = useRef(1);
  const cropPanXR   = useRef(0);
  const cropPanYR   = useRef(0);
  const cropRatioR  = useRef<'4:3' | '4:3L' | '1:1'>('4:3');
  // Per-photo crop keyed by asset URI (stable when reordering), not by list index
  const cropStatesR = useRef<Record<string, CropState>>({});
  const [cropStates, setCropStates] = useState<Record<string, CropState>>({});
  /** URI currently shown in the main preview — refs apply to this photo until loadCrop switches */
  const visibleUriRef = useRef<string | null>(null);
  const carouselIdxR = useRef(0);
  // Gesture tracking refs
  const pinchDistR     = useRef<number | null>(null);
  const gestScale0R    = useRef(1);
  const gestPanX0R     = useRef(0);
  const gestPanY0R     = useRef(0);
  // Ref to horizontal carousel ScrollView so we can disable swipe during pinch
  const carouselScrollR = useRef<any>(null);
  // Ref to the outer page ScrollView so we can lock it during crop gestures
  const pageScrollR = useRef<any>(null);
  // Whether crop/reposition mode is explicitly active
  const [cropModeActive, setCropModeActive] = useState(false);
  const cropModeActiveR = useRef(false);
  useEffect(() => { cropModeActiveR.current = cropModeActive; }, [cropModeActive]);

  function cDims() {
    const cW = SCREEN_WIDTH - 40;
    const cH = cropRatioR.current === '1:1' ? cW : cropRatioR.current === '4:3L' ? cW * 3 / 4 : cW * 4 / 3;
    return { cW, cH };
  }

  function setAnimCrop(scale: number, panX: number, panY: number) {
    const { cW, cH } = cDims();
    animW.setValue(cW * scale);
    animH.setValue(cH * scale);
    animL.setValue(cW * (1 - scale) / 2 + panX);
    animT.setValue(cH * (1 - scale) / 2 + panY);
  }

  function saveCrop(forUri?: string | null) {
    const uri = forUri ?? visibleUriRef.current;
    if (!uri) return;
    const next: CropState = {
      scale: cropScaleR.current,
      panX:  cropPanXR.current,
      panY:  cropPanYR.current,
    };
    cropStatesR.current[uri] = next;
    setCropStates((prev) => ({ ...prev, [uri]: next }));
  }

  function loadCrop(uri: string) {
    visibleUriRef.current = uri;
    const s = cropStatesR.current[uri] ?? { scale: 1, panX: 0, panY: 0 };
    cropScaleR.current = s.scale;
    cropPanXR.current  = s.panX;
    cropPanYR.current  = s.panY;
    setAnimCrop(s.scale, s.panX, s.panY);
  }

  /** Static layout for carousel slides that are not the active (animated) slide */
  function cropLayoutStyle(scale: number, panX: number, panY: number) {
    const { cW, cH } = cDims();
    return {
      position: 'absolute' as const,
      width: cW * scale,
      height: cH * scale,
      left: cW * (1 - scale) / 2 + panX,
      top: cH * (1 - scale) / 2 + panY,
    };
  }

  /** Same crop math as the main preview, scaled to fit inside a square thumbnail (THUMB px). */
  function thumbPreviewInnerStyle(scale: number, panX: number, panY: number, fit: number) {
    const { cW, cH } = cDims();
    return {
      position: 'absolute' as const,
      width: cW * scale * fit,
      height: cH * scale * fit,
      left: (cW * (1 - scale) / 2 + panX) * fit,
      top: (cH * (1 - scale) / 2 + panY) * fit,
    };
  }

  // Keep carouselIdxR in sync with state
  useEffect(() => { carouselIdxR.current = carouselIndex; }, [carouselIndex]);

  // When the visible slot changes (carousel swipe, reorder, add/remove): save crop for the
  // previous URI from refs, then load the photo now at this index by URI.
  useEffect(() => {
    const uri = images[carouselIndex];
    if (!uri) {
      visibleUriRef.current = null;
      return;
    }
    const prev = visibleUriRef.current;
    if (prev !== null && prev !== uri) {
      saveCrop(prev);
    }
    loadCrop(uri);
  }, [carouselIndex, images]);

  // When ratio changes: reset crop for every URI still in the post
  useEffect(() => {
    cropRatioR.current = cropRatio;
    const next: Record<string, CropState> = {};
    for (const u of images) {
      next[u] = { scale: 1, panX: 0, panY: 0 };
    }
    cropStatesR.current = next;
    setCropStates(next);
    cropScaleR.current = 1;
    cropPanXR.current  = 0;
    cropPanYR.current  = 0;
    setAnimCrop(1, 0, 0);
    setCropModeActive(false);
    const uri = images[carouselIndex];
    if (uri) loadCrop(uri);
  }, [cropRatio]);

  // When crop mode turns off, ensure nested carousel + page scroll are unlocked
  useEffect(() => {
    if (!cropModeActive) {
      carouselScrollR.current?.setNativeProps({ scrollEnabled: true });
      pageScrollR.current?.setNativeProps({ scrollEnabled: true });
    }
  }, [cropModeActive]);

  // PanResponder: pinch-to-zoom + drag-to-pan (only active when cropModeActive)
  const cropPanResponder = useMemo(() => PanResponder.create({
    // Only claim immediately when zoomed (need to pan). At 1× in crop mode, horizontal
    // swipes must reach the carousel — do not capture single-finger on touch-down.
    onStartShouldSetPanResponder: () =>
      cropModeActiveR.current && cropScaleR.current > 1.01,
    // Always capture 2-finger pinch in crop mode (needed to beat nested ScrollView)
    onMoveShouldSetPanResponderCapture: (evt) =>
      cropModeActiveR.current && evt.nativeEvent.touches.length >= 2,
    // Claim 1-finger pan via move (not capture) so taps still land on sibling views
    onMoveShouldSetPanResponder: (evt) =>
      cropModeActiveR.current && (
        evt.nativeEvent.touches.length >= 2 ||
        (evt.nativeEvent.touches.length === 1 && cropScaleR.current > 1.01)
      ),

    onPanResponderGrant: () => {
      gestScale0R.current = cropScaleR.current;
      gestPanX0R.current  = cropPanXR.current;
      gestPanY0R.current  = cropPanYR.current;
      pinchDistR.current  = null;
      // Lock both the page scroll and the horizontal carousel during crop
      pageScrollR.current?.setNativeProps({ scrollEnabled: false });
      carouselScrollR.current?.setNativeProps({ scrollEnabled: false });
    },

    onPanResponderMove: (evt, gs) => {
      const touches = evt.nativeEvent.touches;
      const { cW, cH } = cDims();

      if (touches.length >= 2) {
        // ── Pinch-to-zoom ──
        const dx   = touches[0].pageX - touches[1].pageX;
        const dy   = touches[0].pageY - touches[1].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (pinchDistR.current === null) {
          pinchDistR.current = dist;
          gestScale0R.current = cropScaleR.current;
          gestPanX0R.current  = cropPanXR.current;
          gestPanY0R.current  = cropPanYR.current;
        }

        const newScale = Math.max(1, Math.min(5, gestScale0R.current * (dist / pinchDistR.current)));
        const maxPX = cW * (newScale - 1) / 2;
        const maxPY = cH * (newScale - 1) / 2;
        // Clamp existing pan into the new scale's bounds
        const newPanX = Math.max(-maxPX, Math.min(maxPX, gestPanX0R.current));
        const newPanY = Math.max(-maxPY, Math.min(maxPY, gestPanY0R.current));

        cropScaleR.current = newScale;
        cropPanXR.current  = newPanX;
        cropPanYR.current  = newPanY;
        setAnimCrop(newScale, newPanX, newPanY);
      } else if (touches.length === 1 && cropScaleR.current > 1.01) {
        // ── Single-finger pan (only when zoomed) ──
        const newPanX = gestPanX0R.current + gs.dx;
        const newPanY = gestPanY0R.current + gs.dy;
        const maxPX = cW * (cropScaleR.current - 1) / 2;
        const maxPY = cH * (cropScaleR.current - 1) / 2;
        const cx = Math.max(-maxPX, Math.min(maxPX, newPanX));
        const cy = Math.max(-maxPY, Math.min(maxPY, newPanY));
        cropPanXR.current = cx;
        cropPanYR.current = cy;
        setAnimCrop(cropScaleR.current, cx, cy);
      }
    },

    onPanResponderRelease: () => {
      pinchDistR.current = null;
      saveCrop();
      // Always restore page scroll; only restore carousel if not zoomed
      pageScrollR.current?.setNativeProps({ scrollEnabled: true });
      if (cropScaleR.current <= 1.01) {
        carouselScrollR.current?.setNativeProps({ scrollEnabled: true });
      }
    },

    onPanResponderTerminate: () => {
      pinchDistR.current = null;
      pageScrollR.current?.setNativeProps({ scrollEnabled: true });
      if (cropScaleR.current <= 1.01) {
        carouselScrollR.current?.setNativeProps({ scrollEnabled: true });
      }
    },
  }), []); // all dependencies accessed via refs — stable

  function handleCancel() {
    const hasContent = images.length > 0 || caption.trim().length > 0;
    const doCancel = () => {
      setImages([]);
      setImageDims([]);
      setCropRatio('4:3');
      setCaption('');
      setSelectedThumb(null);
      setCarouselIndex(0);
      cropStatesR.current = {};
      setCropStates({});
      visibleUriRef.current = null;
      cropScaleR.current  = 1;
      cropPanXR.current   = 0;
      cropPanYR.current   = 0;
      setAnimCrop(1, 0, 0);
      clearLocation();
      setTaggedUsers([]);
      setTagQuery('');
      navigation.navigate('Feed');
    };
    if (!hasContent) { doCancel(); return; }
    Alert.alert('Discard post?', 'Your changes will be lost.', [
      { text: 'Discard', style: 'destructive', onPress: doCancel },
      { text: 'Keep editing', style: 'cancel' },
    ]);
  }

  // Location
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<{ name: string; lat: number; lon: number }[]>([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tagging
  const [tagQuery, setTagQuery] = useState('');
  const [tagResults, setTagResults] = useState<TaggedUser[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [searchingTags, setSearchingTags] = useState(false);

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to post.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
      setImageDims((prev) => [
        ...prev,
        ...result.assets.map((a) => ({ width: a.width, height: a.height })),
      ].slice(0, 5));
    }
  }

  // Crop a URI to the selected ratio, honouring the user's pinch-zoom / pan crop choice.
  // Preview layout uses dp; picker reports image size in pixels — we must use layout pixels
  // (dp × PixelRatio) for the same math RN Image uses with resizeMode="cover", or the
  // exported crop is tighter (extra zoom) than what you see on screen.
  async function cropImage(
    uri: string,
    originalWidth: number,
    originalHeight: number,
    userScale: number = 1,
    panX: number = 0,
    panY: number = 0,
  ): Promise<string> {
    const pr = PixelRatio.get();
    const cW_dp = SCREEN_WIDTH - 40;
    const cH_dp = cropRatioR.current === '1:1' ? cW_dp : cropRatioR.current === '4:3L' ? cW_dp * 3 / 4 : cW_dp * 4 / 3;
    // Frame and pan in **layout pixels** (same space as bitmap vs view in RN Image)
    const cW = cW_dp * pr;
    const cH = cH_dp * pr;
    const panX_px = panX * pr;
    const panY_px = panY * pr;

    // Prefer dimensions that match how the file decodes (EXIF), fallback to picker dims
    const { w: W, h: H } = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ w, h }), reject);
    }).catch(() => ({ w: originalWidth, h: originalHeight }));

    if (W <= 0 || H <= 0) {
      throw new Error('Invalid image dimensions');
    }

    // Base cover scale for the preview frame (layout px vs bitmap px)
    const coverScale = Math.max(cW / W, cH / H);
    const totalScale = coverScale * userScale;

    const boxW = cW * userScale;
    const boxH = cH * userScale;

    const displayW = W * totalScale;
    const displayH = H * totalScale;
    const imgOffsetX = (boxW - displayW) / 2;
    const imgOffsetY = (boxH - displayH) / 2;

    const boxLeft = cW * (1 - userScale) / 2 + panX_px;
    const boxTop  = cH * (1 - userScale) / 2 + panY_px;

    const imageLeft = boxLeft + imgOffsetX;
    const imageTop  = boxTop + imgOffsetY;

    // Intersection of viewport [0,cW]×[0,cH] with the scaled image rect (avoids off-by-zoom)
    const leftEdge = Math.max(0, imageLeft);
    const rightEdge = Math.min(cW, imageLeft + displayW);
    const topEdge = Math.max(0, imageTop);
    const bottomEdge = Math.min(cH, imageTop + displayH);

    let cropX = (leftEdge - imageLeft) / totalScale;
    let cropY = (topEdge - imageTop) / totalScale;
    let cropW = (rightEdge - leftEdge) / totalScale;
    let cropH = (bottomEdge - topEdge) / totalScale;

    cropX = Math.max(0, Math.floor(cropX));
    cropY = Math.max(0, Math.floor(cropY));
    cropW = Math.min(W - cropX, Math.max(1, Math.round(cropW)));
    cropH = Math.min(H - cropY, Math.max(1, Math.round(cropH)));

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  }

  function removeImage(index: number) {
    const removedUri = images[index];
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setCarouselIndex((ci) => {
        if (index < ci) return ci - 1;
        if (index === ci) return Math.min(ci, Math.max(0, next.length - 1));
        return ci;
      });
      return next;
    });
    setImageDims((prev) => prev.filter((_, i) => i !== index));
    if (removedUri) {
      delete cropStatesR.current[removedUri];
      setCropStates((prev) => {
        const next = { ...prev };
        delete next[removedUri];
        return next;
      });
    }
  }

  function formatNominatimAddress(r: any): string {
    const addr = r.address ?? {};
    const parts: string[] = [];
    const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
    if (street) parts.push(street);
    const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality;
    if (city) parts.push(city);
    if (addr.postcode) parts.push(addr.postcode);
    if (addr.country) parts.push(addr.country);
    return parts.join(', ') || r.display_name;
  }

  function debouncedLocationSearch(q: string) {
    setLocationQuery(q);
    setLocationSuggestions([]);
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);
    if (!q.trim()) return;
    locationSearchTimeout.current = setTimeout(async () => {
      setLocationSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=5`,
          { headers: { 'User-Agent': 'SlowMeterApp/1.0' } }
        );
        const data = await res.json();
        setLocationSuggestions(data.map((r: any) => ({ name: formatNominatimAddress(r), lat: parseFloat(r.lat), lon: parseFloat(r.lon) })));
      } catch { /* ignore */ }
      setLocationSearching(false);
    }, 500);
  }

  function selectLocation(s: { name: string; lat: number; lon: number }) {
    setLocationLabel(s.name);
    setLocationLat(s.lat);
    setLocationLng(s.lon);
    setLocationEnabled(true);
    setLocationQuery('');
    setLocationSuggestions([]);
  }

  function clearLocation() {
    setLocationEnabled(false);
    setLocationLabel(null);
    setLocationLat(null);
    setLocationLng(null);
    setLocationQuery('');
    setLocationSuggestions([]);
  }

  async function searchTags(text: string) {
    setTagQuery(text);
    if (!text.trim()) { setTagResults([]); return; }
    setSearchingTags(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('users')
      .select('id, username')
      .ilike('username', `%${text.trim()}%`)
      .neq('id', user?.id ?? '')
      .limit(6);
    const taggedIds = new Set(taggedUsers.map((u) => u.id));
    setTagResults((data ?? []).filter((u: TaggedUser) => !taggedIds.has(u.id)));
    setSearchingTags(false);
  }

  function addTag(user: TaggedUser) {
    setTaggedUsers((prev) => [...prev, user]);
    setTagQuery('');
    setTagResults([]);
  }

  function removeTag(id: string) {
    setTaggedUsers((prev) => prev.filter((u) => u.id !== id));
  }

  async function uploadSingleImage(userId: string, uri: string): Promise<string> {
    const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const contentType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
    const { error } = await supabase.storage.from('media').upload(filePath, decode(base64), { contentType });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filePath);
    return publicUrl;
  }

  async function handleShare() {
    if (images.length === 0) { Alert.alert('Pick a photo first'); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      // Persist the crop state for whichever image is currently on-screen
      saveCrop();

      const urls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const uri = images[i];
        const dims = imageDims[i];
        const cs   = cropStatesR.current[uri] ?? { scale: 1, panX: 0, panY: 0 };
        const croppedUri = dims
          ? await cropImage(uri, dims.width, dims.height, cs.scale, cs.panX, cs.panY)
          : uri;
        const url = await uploadSingleImage(user.id, croppedUri);
        urls.push(url);
      }

      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        media_url: urls[0],
        media_urls: urls,
        media_type: 'photo',
        caption: caption.trim() || null,
        location_label: locationLabel,
        location_lat: locationLat,
        location_lng: locationLng,
        tagged_user_ids: taggedUsers.map((u) => u.id),
      });
      if (error) throw error;

      setImages([]);
      setImageDims([]);
      setCropRatio('4:3');
      setCaption('');
      setTaggedUsers([]);
      setTagQuery('');
      cropStatesR.current = {};
      setCropStates({});
      visibleUriRef.current = null;
      cropScaleR.current  = 1;
      cropPanXR.current   = 0;
      cropPanYR.current   = 0;
      clearLocation();

      navigation.navigate('Feed');
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView ref={pageScrollR} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Cancel bar — always visible */}
        <TouchableOpacity style={styles.cancelBar} onPress={handleCancel}>
          <Text style={styles.cancelBarText}>✕  Cancel</Text>
        </TouchableOpacity>

        {/* Image picker / preview */}
        {images.length === 0 ? (
          <TouchableOpacity style={styles.imagePicker} onPress={pickImages}>
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>+</Text>
              <Text style={styles.placeholderText}>Choose up to 5 photos</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.imageSection}>
            {/* Crop ratio toggle */}
            <View style={styles.ratioRow}>
              <Text style={styles.ratioLabel}>Crop</Text>
              <View style={styles.ratioToggle}>
                {(['4:3', '4:3L', '1:1'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.ratioBtn, cropRatio === r && styles.ratioBtnActive]}
                    onPress={() => setCropRatio(r)}
                  >
                    <Text style={[styles.ratioBtnText, cropRatio === r && styles.ratioBtnTextActive]}>
                      {r === '4:3' ? '3:4' : r === '4:3L' ? '4:3' : '1:1'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Image preview with pinch-to-crop — wrapped so the toggle button
                can be a sibling (outside the PanResponder) yet appear on top */}
            <View style={styles.cropWrapper}>
              {/* PanResponder frame */}
              <View
                style={[styles.carouselContainer, cropRatio === '1:1' ? styles.carouselSquare : cropRatio === '4:3L' ? styles.carouselLandscape : styles.carouselPortrait]}
                {...cropPanResponder.panHandlers}
              >
                {images.length === 1 ? (
                  // ── Single image: no horizontal scroll ──
                  <Animated.View style={{ position: 'absolute', width: animW, height: animH, left: animL, top: animT }}>
                    <Image source={{ uri: images[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Animated.View>
                ) : (
                  // ── Multiple images: horizontal carousel ──
                  <ScrollView
                    ref={carouselScrollR}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={(e) =>
                      setCarouselIndex(Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH))
                    }
                  >
                    {images.map((uri, i) => {
                      const slide = cropRatio === '1:1' ? styles.carouselSquare : cropRatio === '4:3L' ? styles.carouselLandscape : styles.carouselPortrait;
                      const cs = cropStates[uri] ?? { scale: 1, panX: 0, panY: 0 };
                      return (
                        <View key={i} style={[slide, { overflow: 'hidden' }]}>
                          {i === carouselIndex ? (
                            <Animated.View style={{ position: 'absolute', width: animW, height: animH, left: animL, top: animT }}>
                              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            </Animated.View>
                          ) : (
                            <View style={cropLayoutStyle(cs.scale, cs.panX, cs.panY)}>
                              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Rule-of-thirds grid — only shown when crop mode is active */}
                {cropModeActive && (
                  <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <View style={[styles.gridLine, styles.gridLineV, { left: '33.33%' }]} />
                    <View style={[styles.gridLine, styles.gridLineV, { left: '66.67%' }]} />
                    <View style={[styles.gridLine, styles.gridLineH, { top: '33.33%' }]} />
                    <View style={[styles.gridLine, styles.gridLineH, { top: '66.67%' }]} />
                  </View>
                )}

                {images.length > 1 && (
                  <View style={styles.carouselDots}>
                    {images.map((_, i) => (
                      <View key={i} style={[styles.carouselDot, i === carouselIndex && styles.carouselDotActive]} />
                    ))}
                  </View>
                )}
              </View>

              {/* Crop toggle button — sibling of the PanResponder frame so taps
                  always register even when crop mode is active */}
              <TouchableOpacity
                style={[styles.cropToggleBtn, cropModeActive && styles.cropToggleBtnActive]}
                onPress={() => setCropModeActive((v) => !v)}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {/* Minimal 3×3 grid icon — cells flip from white to dark when active */}
                {(() => {
                  const cellStyle = [styles.cropBtnCell, cropModeActive && { backgroundColor: 'rgba(26,26,26,0.75)' }];
                  const row = <View style={styles.cropBtnRow}><View style={cellStyle} /><View style={cellStyle} /><View style={cellStyle} /></View>;
                  return (
                    <View style={styles.cropBtnIcon}>
                      {row}{row}{row}
                    </View>
                  );
                })()}
              </TouchableOpacity>
            </View>

            {cropModeActive && (
              <Text style={styles.cropHint}>Pinch to zoom  ·  drag to reposition</Text>
            )}
            <View style={styles.thumbStrip}>
              {(() => {
                const cW = PAGE_WIDTH;
                const cH = cropRatio === '1:1' ? cW : cW * 4 / 3;
                const THUMB = 64;
                const fit = Math.min(THUMB / cW, THUMB / cH);
                const frameW = cW * fit;
                const frameH = cH * fit;
                return images.map((uri, i) => {
                  const cs = cropStates[uri] ?? { scale: 1, panX: 0, panY: 0 };
                  return (
                <TouchableOpacity
                  key={i}
                  style={[styles.thumbWrap, selectedThumb === i && styles.thumbSelected]}
                  onPress={() => {
                    if (selectedThumb === null) {
                      setSelectedThumb(i);
                    } else if (selectedThumb === i) {
                      setSelectedThumb(null);
                    } else {
                      // Swap positions
                      setImages((prev) => {
                        const next = [...prev];
                        [next[selectedThumb], next[i]] = [next[i], next[selectedThumb]];
                        return next;
                      });
                      setSelectedThumb(null);
                    }
                  }}
                >
                  <View style={styles.thumbPreviewOuter}>
                    <View
                      style={[
                        styles.thumbPreviewFrame,
                        { width: frameW, height: frameH, marginLeft: (THUMB - frameW) / 2, marginTop: (THUMB - frameH) / 2 },
                      ]}
                    >
                      <View style={thumbPreviewInnerStyle(cs.scale, cs.panX, cs.panY, fit)}>
                        <Image source={{ uri }} style={styles.thumbPreviewImage} resizeMode="cover" />
                      </View>
                    </View>
                  </View>
                  {selectedThumb === i && (
                    <View style={styles.thumbSelectedOverlay}>
                      <Text style={styles.thumbSelectedText}>↕</Text>
                    </View>
                  )}
                  {selectedThumb === null && (
                    <TouchableOpacity style={styles.thumbRemove} onPress={() => removeImage(i)}>
                      <Text style={styles.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                  )}
                  {i === 0 && selectedThumb === null && (
                    <View style={styles.thumbCover}>
                      <Text style={styles.thumbCoverText}>cover</Text>
                    </View>
                  )}
                </TouchableOpacity>
                  );
                });
              })()}
              {images.length < 5 && selectedThumb === null && (
                <TouchableOpacity style={styles.thumbAdd} onPress={pickImages}>
                  <Text style={styles.thumbAddText}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <TextInput
          style={styles.captionInput}
          placeholder="Write a caption..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
          value={caption}
          onChangeText={setCaption}
        />

        {/* Tag people */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Tag people</Text>
          {taggedUsers.length > 0 && (
            <View style={styles.chips}>
              {taggedUsers.map((u) => (
                <TouchableOpacity key={u.id} style={styles.chip} onPress={() => removeTag(u.id)}>
                  <Text style={styles.chipText}>@{u.username} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.tagInputRow}>
            <TextInput
              style={styles.tagInput}
              placeholder="Search username..."
              placeholderTextColor="#999"
              value={tagQuery}
              onChangeText={searchTags}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {searchingTags && <ActivityIndicator style={{ marginTop: 6 }} color="#1a1a1a" size="small" />}
          {tagResults.map((u) => (
            <TouchableOpacity key={u.id} style={styles.tagResult} onPress={() => addTag(u)}>
              <Text style={styles.tagResultText}>@{u.username}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Location */}
        <View style={styles.locationSection}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>📍</Text>
            {locationEnabled ? (
              <>
                <Text style={styles.locationSelectedText}>{locationLabel}</Text>
                <TouchableOpacity onPress={clearLocation}>
                  <Text style={styles.locationRemove}>✕</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TextInput
                style={styles.locationSearchInput}
                placeholder="Search location..."
                placeholderTextColor="#999"
                value={locationQuery}
                onChangeText={debouncedLocationSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            {locationSearching && <ActivityIndicator color="#1a1a1a" size="small" />}
          </View>
          {locationSuggestions.length > 0 && (
            <View style={styles.locationDropdown}>
              {locationSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.locationSuggestion, i < locationSuggestions.length - 1 && styles.locationSuggestionBorder]}
                  onPress={() => selectLocation(s)}
                >
                  <Text style={styles.locationSuggestionText} numberOfLines={2}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, (images.length === 0 || uploading) && styles.buttonDisabled]}
          onPress={handleShare}
          disabled={images.length === 0 || uploading}
        >
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Share</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf8' },
  content: { padding: 20, alignItems: 'center' },
  imagePicker: {
    width: '100%', aspectRatio: 3 / 4,
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: '#eee', marginBottom: 16,
  },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12, marginBottom: 8 },
  imageSection: { width: '100%', marginBottom: 16 },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ratioLabel: { fontSize: 13, fontWeight: '600', color: '#555' },
  ratioToggle: {
    flexDirection: 'row',
    backgroundColor: '#ebebeb',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  ratioBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  ratioBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  ratioBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  ratioBtnTextActive: { color: '#1a1a1a' },
  cropHint: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 6, marginBottom: 2 },
  // Wrapper that lets the toggle button float over the frame as a sibling
  cropWrapper: { width: '100%', marginBottom: 0 },
  // Rule-of-thirds grid lines
  gridLine: { position: 'absolute' },
  gridLineV: { width: 1, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.4)' },
  gridLineH: { height: 1, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.4)' },
  // Crop toggle button (bottom-right corner, sibling of the PanResponder frame)
  cropToggleBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cropToggleBtnActive: { backgroundColor: '#fff' },
  // 3×3 grid icon inside the button
  cropBtnIcon: { width: 18, height: 18, gap: 2 },
  cropBtnIconActive: {},
  cropBtnRow: { flex: 1, flexDirection: 'row', gap: 2 },
  cropBtnCell: { flex: 1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
  carouselContainer: { width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 8, position: 'relative' },
  carouselPortrait: { width: SCREEN_WIDTH - 40, aspectRatio: 3 / 4 },
  carouselLandscape: { width: SCREEN_WIDTH - 40, aspectRatio: 4 / 3 },
  carouselSquare: { width: SCREEN_WIDTH - 40, aspectRatio: 1 },
  carouselImage: { width: SCREEN_WIDTH - 40 },
  carouselDots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  carouselDotActive: { backgroundColor: '#fff' },
  thumbStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  thumbWrap: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  // Miniature of the same crop as the main preview (scaled to fit 64×64)
  thumbPreviewOuter: { width: 64, height: 64, overflow: 'hidden' },
  thumbPreviewFrame: { overflow: 'hidden' },
  thumbPreviewImage: { width: '100%', height: '100%' },
  thumbSelected: { borderWidth: 2, borderColor: '#1a1a1a', borderRadius: 8 },
  thumbSelectedOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  thumbSelectedText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  thumbRemove: {
    position: 'absolute', top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  thumbRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  thumbCover: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, alignItems: 'center',
  },
  thumbCoverText: { color: '#fff', fontSize: 9, fontWeight: '600' },
  thumbAdd: {
    width: 64, height: 64, borderRadius: 8,
    backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed',
  },
  thumbAddText: { fontSize: 28, color: '#888' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderIcon: { fontSize: 48, color: '#bbb' },
  placeholderText: { fontSize: 16, color: '#aaa' },
  captionInput: {
    width: '100%', minHeight: 80,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
    borderRadius: 10, padding: 12, fontSize: 15, color: '#1a1a1a',
    marginBottom: 16, textAlignVertical: 'top',
  },
  section: { width: '100%', marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { color: '#fff', fontSize: 13 },
  tagInputRow: { flexDirection: 'row' },
  tagInput: {
    flex: 1, height: 40, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 12, fontSize: 14, color: '#1a1a1a',
  },
  tagResult: {
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  tagResultText: { fontSize: 14, color: '#1a1a1a' },
  locationSection: { width: '100%', marginBottom: 20 },
  locationRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
  },
  locationIcon: { fontSize: 18 },
  locationSelectedText: { flex: 1, fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  locationSearchInput: { flex: 1, fontSize: 14, color: '#1a1a1a', height: 24 },
  locationRemove: { fontSize: 16, color: '#aaa', paddingHorizontal: 4 },
  locationDropdown: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0', marginTop: 4, overflow: 'hidden',
  },
  locationSuggestion: { paddingHorizontal: 14, paddingVertical: 12 },
  locationSuggestionBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  locationSuggestionText: { fontSize: 13, color: '#1a1a1a', lineHeight: 18 },
  cancelBar: {
    width: '100%', paddingVertical: 10, paddingHorizontal: 4,
    marginBottom: 12, alignItems: 'flex-start',
  },
  cancelBarText: { fontSize: 15, color: '#e0245e', fontWeight: '600' },
  button: {
    width: '100%', height: 50,
    backgroundColor: '#1a1a1a', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
