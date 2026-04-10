import { useState, useEffect } from 'react';
import { NearbyEvent } from '../types/radar';
import { nearbyEventService } from '../services/nearbyEvents';

type Position = { latitude: number; longitude: number } | null;

export function useNearbyEvents(position: Position) {
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Initial fetch on mount — always runs regardless of position
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    nearbyEventService
      .fetchNearbyEvents(0, 0, 10)
      .then((data) => {
        if (!cancelled) {
          setEvents(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch with real coordinates once location becomes available
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    nearbyEventService
      .fetchNearbyEvents(position.latitude, position.longitude, 10)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [position?.latitude, position?.longitude]);

  return { events, loading };
}
