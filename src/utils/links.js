import { Linking } from 'react-native';

export function normalizeUrl(rawUrl) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidUrl(rawUrl) {
  try {
    const url = new URL(normalizeUrl(rawUrl));
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

export async function openAdLink(url) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // ignore: nothing sensible to do if the device can't open the link
  }
}
