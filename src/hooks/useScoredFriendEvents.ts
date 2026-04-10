import { useMemo } from 'react';
import { RadarEvent, ScoredFriendEvent, TimeFilter } from '../types/radar';
import { parseRadarEventDate } from '../utils/radarEventDate';
import { distanceKm } from '../utils/haversine';

type Position = { latitude: number; longitude: number } | null;

function getHoursUntil(date: string | null, time: string | null): number | null {
  if (!date) return null;
  const eventDate = parseRadarEventDate(date);
  if (!eventDate) return null;

  if (time) {
    const [h, m] = time.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      eventDate.setHours(h, m, 0, 0);
    }
  }

  return (eventDate.getTime() - Date.now()) / (1000 * 60 * 60);
}

function buildUrgencyLabel(date: string | null, time: string | null): string | null {
  const hours = getHoursUntil(date, time);
  if (hours === null) return null;
  if (hours < 0) return null;

  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `Starts in ${mins}m`;
  }
  if (hours < 6) {
    return `Starts in ${Math.round(hours)}h`;
  }

  const eventDate = parseRadarEventDate(date!);
  if (!eventDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) {
    if (time) {
      const [h, m] = time.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `Today ${h12}:${String(m).padStart(2, '0')} ${suffix}`;
    }
    return 'Today';
  }
  if (eventDay.getTime() === tomorrow.getTime()) {
    return 'Tomorrow';
  }
  return null;
}

function scoreEvent(event: RadarEvent, position: Position): ScoredFriendEvent {
  // friendScore — 2× multiplier, friends signal is king
  const friendScore = Math.min(event.goingPreview.length * 10, 50) * 2;

  // distanceScore
  let distKm: number | null = null;
  let distanceScore = 0;
  if (position && event.locationLat != null && event.locationLng != null) {
    distKm = distanceKm(position.latitude, position.longitude, event.locationLat, event.locationLng);
    if (distKm < 1) distanceScore = 40;
    else if (distKm < 5) distanceScore = 30;
    else if (distKm < 20) distanceScore = 15;
    else distanceScore = 0;
  }

  // urgencyScore
  const hours = getHoursUntil(event.date, event.time);
  let urgencyScore = 5; // default for undated events
  if (hours !== null) {
    if (hours < 0) urgencyScore = 0;
    else if (hours < 2) urgencyScore = 50;
    else if (hours < 6) urgencyScore = 35;
    else if (hours < 24) urgencyScore = 20;
    else if (hours < 72) urgencyScore = 10;
    else urgencyScore = 0;
  }

  const urgencyLabel = buildUrgencyLabel(event.date, event.time);
  const n = event.goingPreview.length;
  const friendsGoingLabel = n > 0 ? `${n} friend${n > 1 ? 's' : ''} going` : null;

  return {
    ...event,
    score: friendScore + distanceScore + urgencyScore,
    distanceKm: distKm,
    urgencyLabel,
    friendsGoingLabel,
  };
}

function passesTimeFilter(event: RadarEvent, filter: TimeFilter): boolean {
  if (filter === 'all') return true;

  const hours = getHoursUntil(event.date, event.time);

  if (filter === 'now') {
    if (hours === null) return false;
    return hours >= 0 && hours <= 4;
  }

  if (filter === 'tonight') {
    if (!event.date) return true; // undated plans included
    const eventDate = parseRadarEventDate(event.date);
    if (!eventDate) return true;
    const today = new Date();
    const isToday =
      eventDate.getFullYear() === today.getFullYear() &&
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getDate() === today.getDate();
    if (!isToday) return false;
    if (!event.time) return true;
    const [h] = event.time.split(':').map(Number);
    return !isNaN(h) && h >= 17;
  }

  if (filter === 'weekend') {
    if (!event.date) return false;
    const eventDate = parseRadarEventDate(event.date);
    if (!eventDate) return false;
    const day = eventDate.getDay();
    const today = new Date();
    // Find the coming Saturday and Sunday
    const daysUntilSat = (6 - today.getDay() + 7) % 7 || 7;
    const sat = new Date(today);
    sat.setDate(today.getDate() + daysUntilSat);
    sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    const eventDay = new Date(eventDate);
    eventDay.setHours(0, 0, 0, 0);
    return eventDay.getTime() === sat.getTime() || eventDay.getTime() === sun.getTime();
  }

  return true;
}

export function useScoredFriendEvents(
  upcoming: RadarEvent[],
  later: RadarEvent[],
  position: Position,
  filter: TimeFilter
): ScoredFriendEvent[] {
  return useMemo(() => {
    const all = [...upcoming, ...later];
    const filtered = all.filter((e) => passesTimeFilter(e, filter));
    const scored = filtered.map((e) => scoreEvent(e, position));
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [upcoming, later, position, filter]);
}
