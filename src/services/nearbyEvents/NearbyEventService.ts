import { NearbyEvent } from '../../types/radar';

export interface NearbyEventService {
  fetchNearbyEvents(lat: number, lng: number, radiusKm: number): Promise<NearbyEvent[]>;
}
