import { useEffect, useState } from 'react';
import { distanceInKm } from '../utils/geo';

const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const SEARCH_RADIUS_METERS = 5000;
const FIELD_MASK = 'places.id,places.displayName,places.location,places.formattedAddress';

// Real, live nearby pharmacies from Google Places (New) — distinct from the
// ONPB on-duty roster, this covers ordinary pharmacies that keep normal
// hours (not part of any "de garde" rotation), so a user can find any
// pharmacy by name even when it isn't currently on call.
export function useNearbyPharmacies(coords) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [pharmacies, setPharmacies] = useState([]);

  useEffect(() => {
    if (!coords) return;
    if (!PLACES_API_KEY) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ['pharmacy'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: coords.latitude, longitude: coords.longitude },
            radius: SEARCH_RADIUS_METERS,
          },
        },
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setStatus('error');
          return;
        }
        const results = (data.places ?? [])
          .filter((place) => place.location)
          .map((place) => ({
            id: place.id,
            name: place.displayName?.text ?? '',
            address: place.formattedAddress,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
            distance: distanceInKm(coords, {
              latitude: place.location.latitude,
              longitude: place.location.longitude,
            }),
          }))
          .sort((a, b) => a.distance - b.distance);
        setPharmacies(results);
        setStatus('loaded');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  return { status, pharmacies };
}
