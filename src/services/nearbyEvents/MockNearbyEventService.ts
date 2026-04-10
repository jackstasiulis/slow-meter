import { NearbyEvent } from '../../types/radar';
import { NearbyEventService } from './NearbyEventService';

export class MockNearbyEventService implements NearbyEventService {
  async fetchNearbyEvents(_lat: number, _lng: number, _radiusKm: number): Promise<NearbyEvent[]> {
    const now = new Date();

    const tonight = new Date(now);
    tonight.setHours(20, 0, 0, 0);

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);

    const thisWeekend = new Date(now);
    const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
    thisWeekend.setDate(now.getDate() + daysUntilSat);
    thisWeekend.setHours(19, 0, 0, 0);

    const toTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const toDate = (d: Date) => d.toISOString().slice(0, 10);

    return [
      {
        id: 'mock-1',
        title: 'Live Jazz at The Venue',
        time: toTime(tonight),
        date: toDate(tonight),
        distanceKm: 0.8,
        lat: _lat + 0.007,
        lng: _lng + 0.005,
        source: 'mock',
      },
      {
        id: 'mock-2',
        title: 'Rooftop Market',
        time: toTime(tomorrow),
        date: toDate(tomorrow),
        distanceKm: 1.4,
        lat: _lat - 0.01,
        lng: _lng + 0.012,
        source: 'mock',
      },
      {
        id: 'mock-3',
        title: 'Open Mic Night',
        time: '21:00',
        date: toDate(tonight),
        distanceKm: 2.2,
        lat: _lat + 0.02,
        lng: _lng - 0.008,
        source: 'mock',
      },
      {
        id: 'mock-4',
        title: 'Weekend Food Festival',
        time: toTime(thisWeekend),
        date: toDate(thisWeekend),
        distanceKm: 3.5,
        lat: _lat - 0.03,
        lng: _lng + 0.02,
        source: 'mock',
      },
    ];
  }
}
