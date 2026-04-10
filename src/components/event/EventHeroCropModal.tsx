import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_W } = Dimensions.get('window');

const AnimatedImage = Animated.createAnimatedComponent(Image);

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type Props = {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onComplete: (croppedLocalUri: string) => void;
};

function boundPanInViewport(
  tx: number,
  ty: number,
  cw: number,
  ch: number,
  dispW: number,
  dispH: number,
) {
  'worklet';
  const txMin = (cw - dispW) / 2;
  const txMax = (dispW - cw) / 2;
  const tyMin = (ch - dispH) / 2;
  const tyMax = (dispH - ch) / 2;
  return {
    tx: Math.min(txMax, Math.max(txMin, tx)),
    ty: Math.min(tyMax, Math.max(tyMin, ty)),
  };
}

/**
 * Full-screen crop: same cover math as the event detail background (`resizeMode="cover"`).
 * No in-frame crop box — the whole screen is the preview.
 */
export default function EventHeroCropModal({ visible, imageUri, onClose, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [naturalError, setNaturalError] = useState(false);
  const [busy, setBusy] = useState(false);

  const viewportW = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const iw = useSharedValue(0);
  const ih = useSharedValue(0);

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const pinchStartZoom = useSharedValue(1);
  const panStartTx = useSharedValue(0);
  const panStartTy = useSharedValue(0);

  const resetState = useCallback(() => {
    zoom.value = 1;
    tx.value = 0;
    ty.value = 0;
    setNatural(null);
    setNaturalError(false);
    viewportW.value = 0;
    viewportH.value = 0;
    iw.value = 0;
    ih.value = 0;
  }, [zoom, tx, ty, viewportW, viewportH, iw, ih]);

  useEffect(() => {
    if (!visible || !imageUri) return;
    resetState();
    setNaturalError(false);
    Image.getSize(
      imageUri,
      (w, h) => {
        if (w > 0 && h > 0) {
          setNatural({ w, h });
          iw.value = w;
          ih.value = h;
        } else setNaturalError(true);
      },
      () => setNaturalError(true),
    );
  }, [visible, imageUri, resetState, iw, ih]);

  const onViewportLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        viewportW.value = width;
        viewportH.value = height;
      }
    },
    [viewportW, viewportH],
  );

  const composed = useMemo(() => {
    const pinchGesture = Gesture.Pinch()
      .onBegin(() => {
        pinchStartZoom.value = zoom.value;
      })
      .onUpdate((e) => {
        const next = pinchStartZoom.value * e.scale;
        zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        const cw = viewportW.value;
        const ch = viewportH.value;
        const niw = iw.value;
        const nih = ih.value;
        if (cw <= 0 || niw <= 0) return;
        const base = Math.max(cw / niw, ch / nih);
        const z = zoom.value;
        const dispW = niw * base * z;
        const dispH = nih * base * z;
        const c = boundPanInViewport(tx.value, ty.value, cw, ch, dispW, dispH);
        tx.value = c.tx;
        ty.value = c.ty;
      });

    const panGesture = Gesture.Pan()
      .onBegin(() => {
        panStartTx.value = tx.value;
        panStartTy.value = ty.value;
      })
      .onUpdate((e) => {
        const cw = viewportW.value;
        const ch = viewportH.value;
        const niw = iw.value;
        const nih = ih.value;
        if (cw <= 0 || niw <= 0) return;
        const base = Math.max(cw / niw, ch / nih);
        const z = zoom.value;
        const dispW = niw * base * z;
        const dispH = nih * base * z;
        const nextTx = panStartTx.value + e.translationX;
        const nextTy = panStartTy.value + e.translationY;
        const c = boundPanInViewport(nextTx, nextTy, cw, ch, dispW, dispH);
        tx.value = c.tx;
        ty.value = c.ty;
      });

    return Gesture.Simultaneous(panGesture, pinchGesture);
  }, []);

  const imageStyle = useAnimatedStyle(() => {
    const cw = viewportW.value;
    const ch = viewportH.value;
    const niw = iw.value;
    const nih = ih.value;
    if (cw <= 0 || niw <= 0) return { opacity: 0 };
    const base = Math.max(cw / niw, ch / nih);
    const z = zoom.value;
    const dispW = niw * base * z;
    const dispH = nih * base * z;
    const L0 = (cw - dispW) / 2;
    const T0 = (ch - dispH) / 2;
    return {
      position: 'absolute',
      left: L0 + tx.value,
      top: T0 + ty.value,
      width: dispW,
      height: dispH,
      opacity: 1,
    };
  });

  const applyCropImpl = useCallback(
    (
      z: number,
      txVal: number,
      tyVal: number,
      cw: number,
      ch: number,
      niw: number,
      nih: number,
    ) => {
      if (!imageUri || cw <= 0 || niw <= 0) return;
      const base = Math.max(cw / niw, ch / nih);
      const dispW = niw * base * z;
      const dispH = nih * base * z;
      const L0 = (cw - dispW) / 2;
      const T0 = (ch - dispH) / 2;
      const left = L0 + txVal;
      const top = T0 + tyVal;

      let originX = Math.round((-left / dispW) * niw);
      let originY = Math.round((-top / dispH) * nih);
      let cropW = Math.round((cw / dispW) * niw);
      let cropH = Math.round((ch / dispH) * nih);

      const maxOx = Math.max(0, niw - 1);
      const maxOy = Math.max(0, nih - 1);
      originX = Math.min(maxOx, Math.max(0, originX));
      originY = Math.min(maxOy, Math.max(0, originY));
      cropW = Math.min(niw - originX, Math.max(1, cropW));
      cropH = Math.min(nih - originY, Math.max(1, cropH));

      setBusy(true);
      void (async () => {
        try {
          const targetW = Math.min(1600, cropW);
          const actions = [
            { crop: { originX, originY, width: cropW, height: cropH } },
            { resize: { width: targetW } },
          ];
          const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
            compress: 0.88,
            format: ImageManipulator.SaveFormat.JPEG,
          });
          onComplete(result.uri);
          onClose();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Could not process the image.';
          Alert.alert('Could not save crop', msg);
        } finally {
          setBusy(false);
        }
      })();
    },
    [imageUri, onComplete, onClose],
  );

  const onPressDone = useCallback(() => {
    applyCropImpl(
      zoom.value,
      tx.value,
      ty.value,
      viewportW.value,
      viewportH.value,
      iw.value,
      ih.value,
    );
  }, [applyCropImpl, zoom, tx, ty, viewportW, viewportH, iw, ih]);

  const ready = Boolean(natural && !naturalError && natural.w > 0 && natural.h > 0);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.shell}>
          <GestureDetector gesture={composed}>
            <View style={styles.viewport} onLayout={onViewportLayout}>
              {ready && imageUri ? (
                <AnimatedImage
                  source={{ uri: imageUri }}
                  style={imageStyle}
                  resizeMode="stretch"
                />
              ) : (
                <View style={styles.viewportInner}>
                  {naturalError ? (
                    <Text style={styles.errorText}>Could not load this image.</Text>
                  ) : (
                    <ActivityIndicator color="#fff" size="large" />
                  )}
                </View>
              )}
            </View>
          </GestureDetector>

          <View style={styles.chromeLayer} pointerEvents="box-none">
            <TouchableOpacity
              onPress={onClose}
              style={[styles.floatingPill, { top: insets.top + 10, left: 16 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              activeOpacity={0.88}
            >
              <Text style={styles.floatingPillText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onPressDone}
              style={[styles.floatingPill, styles.floatingPillPrimary, { top: insets.top + 10, right: 16 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityLabel="Use this photo"
              activeOpacity={0.88}
            >
              <Text style={[styles.floatingPillTextPrimary, (!ready || busy) && styles.disabledText]}>
                Done
              </Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { bottom: Math.max(insets.bottom, 12) + 56 }]} pointerEvents="none">
              Full-screen preview — matches your event cover. Pinch to zoom · drag to position
            </Text>
          </View>

          {busy ? (
            <View style={styles.busyOverlay} pointerEvents="auto">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  shell: {
    flex: 1,
    backgroundColor: '#000',
  },
  chromeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  floatingPill: {
    position: 'absolute',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  floatingPillPrimary: {
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderColor: 'rgba(255,255,255,0.62)',
  },
  floatingPillText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  floatingPillTextPrimary: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  disabledText: { opacity: 0.35 },
  hint: {
    position: 'absolute',
    left: 24,
    right: 24,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  viewport: {
    flex: 1,
    width: SCREEN_W,
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
  },
  viewportInner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { color: 'rgba(255,255,255,0.6)', padding: 16, textAlign: 'center' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
