import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

export function useCurrentLocation({ enabled = true } = {}) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'locating' | 'granted' | 'denied' | 'error'
  const [coords, setCoords] = useState(null);

  const requestLocation = useCallback(async () => {
    setStatus('locating');
    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        setStatus('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setStatus('granted');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (enabled) requestLocation();
  }, [enabled, requestLocation]);

  return { status, coords, requestLocation };
}
