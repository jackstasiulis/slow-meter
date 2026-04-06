import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

const SHARING_PREF_KEY = 'radar_location_sharing';

export type CurrentPosition = {
  lat: number;
  lng: number;
} | null;

export function useLocationSharing() {
  const [isSharing, setIsSharing] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const myIdRef = useRef<string | null>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const isSharingRef = useRef(false);

  // Keep ref in sync with state so callbacks always have latest value
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  // On mount: get user ID and restore sharing preference from AsyncStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      myIdRef.current = user.id;

      // Read preference from AsyncStorage (instant, no network)
      const stored = await AsyncStorage.getItem(SHARING_PREF_KEY);
      if (!mounted) return;

      if (stored === 'true') {
        // Check location permission is still granted before restoring
        const { status } = await Location.getForegroundPermissionsAsync();
        if (!mounted) return;
        if (status === 'granted') {
          setIsSharing(true);
          isSharingRef.current = true;
          await startWatcher();
        } else {
          // Permission was revoked — clear preference
          await AsyncStorage.setItem(SHARING_PREF_KEY, 'false');
          setPermissionDenied(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Pause watcher when app goes to background; resume on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        stopWatcher();
      } else if (state === 'active' && isSharingRef.current) {
        startWatcher();
      }
    });
    return () => sub.remove();
  }, []);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => { stopWatcher(); };
  }, []);

  async function requestPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return false;
    }
    setPermissionDenied(false);
    return true;
  }

  async function startWatcher() {
    if (watcherRef.current) return; // Already running

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }

    // Get an immediate fix first
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude: lat, longitude: lng } = pos.coords;
      setCurrentPosition({ lat, lng });
      if (myIdRef.current && isSharingRef.current) {
        await upsertLocation(myIdRef.current, lat, lng, true);
      }
    } catch (_) {}

    // Then watch for changes
    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 15000,
      },
      async (loc) => {
        const { latitude: lat, longitude: lng } = loc.coords;
        setCurrentPosition({ lat, lng });
        if (myIdRef.current && isSharingRef.current) {
          await upsertLocation(myIdRef.current, lat, lng, true);
        }
      }
    );
  }

  function stopWatcher() {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  }

  async function upsertLocation(userId: string, lat: number, lng: number, sharing: boolean) {
    const { error } = await supabase.from('user_locations').upsert(
      { user_id: userId, lat, lng, is_sharing: sharing, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error && __DEV__) {
      console.warn('[LocationSharing] user_locations upsert failed:', error.message);
    }
  }

  const toggle = useCallback(async () => {
    const myId = myIdRef.current;
    if (!myId) return;

    if (!isSharing) {
      // Turning ON
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          'Location Permission Required',
          'Enable location access in Settings to share your location with friends.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      // Persist preference immediately — survives app restarts before DB write
      await AsyncStorage.setItem(SHARING_PREF_KEY, 'true');
      setIsSharing(true);
      isSharingRef.current = true;
      await startWatcher();
    } else {
      // Turning OFF
      await AsyncStorage.setItem(SHARING_PREF_KEY, 'false');
      stopWatcher();
      setIsSharing(false);
      isSharingRef.current = false;
      // Mark as not sharing in DB (RLS blocks friend reads when is_sharing=false)
      if (currentPosition) {
        await upsertLocation(myId, currentPosition.lat, currentPosition.lng, false);
      } else {
        const { error } = await supabase
          .from('user_locations')
          .update({ is_sharing: false })
          .eq('user_id', myId);
        if (error && __DEV__) {
          console.warn('[LocationSharing] user_locations update failed:', error.message);
        }
      }
    }
  }, [isSharing, currentPosition]);

  return { isSharing, toggle, currentPosition, permissionDenied };
}
