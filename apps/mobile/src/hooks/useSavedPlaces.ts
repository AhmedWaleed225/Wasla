import { useQuery } from '@tanstack/react-query';
import type { LocationDto, SavedLocationDto } from '@wasla/shared';
import { useTranslation } from 'react-i18next';
import { locationsApi } from '../api/endpoints';

export const savedPlacesKey = ['saved-locations'] as const;

export function useSavedPlaces() {
  return useQuery({ queryKey: savedPlacesKey, queryFn: locationsApi.saved });
}

/** Localized display name and secondary line for a place. */
export function usePlaceName() {
  const { i18n, t } = useTranslation();
  const ar = i18n.language === 'ar';
  return {
    name: (l: LocationDto) => (ar ? l.nameAr : l.nameEn),
    parent: (l: LocationDto) => (ar ? l.parentNameAr : l.parentNameEn),
    kind: (l: LocationDto) => t(`locationSearch.kinds.${l.kind}`),
    saved: (s: SavedLocationDto) =>
      s.location ? (ar ? s.location.nameAr : s.location.nameEn) : (s.customName ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`),
  };
}
