import { useEffect, useState } from 'react';
import { distanceInKm } from '../utils/geo';
import { extractPlacePhoto } from '../utils/placePhoto';

const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const FIELD_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,' +
  'places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.rating,' +
  'places.photos';

// The Republic of Bénin's real bounding box. "Benin" in a text query is
// genuinely ambiguous to Google — it also matches Benin City, Nigeria
// (~700km east, in Edo State), and a soft locationBias alone doesn't
// prevent that from mixing into results (confirmed live: "pharmacy Benin"
// returned real Nigerian pharmacies interleaved with Cotonou ones). A hard
// locationRestriction rectangle is the only way to actually guarantee every
// result is really in Bénin, not just biased toward it.
const BENIN_BOUNDS = {
  low: { latitude: 6.1, longitude: 0.75 },
  high: { latitude: 12.45, longitude: 3.9 },
};

// useNearbyPharmacies only ever sees whatever's within a fixed radius of the
// user (capped at 20 results) — a specific pharmacy the user names by
// search, like "Pharmacie Les Archanges", can easily be further away than
// that, or just outside the top 20 nearest. This calls Google Places' Text
// Search (searching by name, not proximity) so a user can look up any real
// pharmacy by name, on duty or not, anywhere — not only ones close by.
// Distinct from the ONPB on-duty roster: these are ordinary Google Places
// results and never claim to be "on duty" — CategoryListingsScreen already
// keeps that distinction visually explicit for useNearbyPharmacies results,
// and this reuses the exact same presentation.
export function useSearchPharmacies(query, coords) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [pharmacies, setPharmacies] = useState([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setStatus('idle');
      setPharmacies([]);
      return undefined;
    }
    if (!PLACES_API_KEY) {
      console.log('[pharmacy text search] no API key configured');
      setStatus('error');
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');
    console.log('[pharmacy text search] query', trimmed, 'coords', coords);

    const body = {
      textQuery: `${trimmed} pharmacy Benin`,
      includedType: 'pharmacy',
      maxResultCount: 10,
      locationRestriction: { rectangle: BENIN_BOUNDS },
    };

    fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log('[pharmacy text search] response', JSON.stringify(data).slice(0, 500));
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
            phone: place.internationalPhoneNumber ?? null,
            isOpenNow: place.currentOpeningHours?.openNow ?? null,
            // Exact match by construction: this photo belongs to this
            // place record, not to a name we guessed at.
            ...extractPlacePhoto(place),
            rating: place.rating ?? null,
            distance: coords
              ? distanceInKm(coords, { latitude: place.location.latitude, longitude: place.location.longitude })
              : null,
          }));
        setPharmacies(results);
        setStatus('loaded');
      })
      .catch((e) => {
        console.log('[pharmacy text search] fetch failed', e.message);
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, coords?.latitude, coords?.longitude]);

  return { status, pharmacies };
}
