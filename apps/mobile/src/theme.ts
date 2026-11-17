import { colors, fontSize, radius, space, touch } from '@wasla/shared';

export { colors, fontSize, radius, space, touch };

/** Font family names registered in app/_layout.tsx. */
export const fonts = {
  display: { 500: 'ReadexPro_500Medium', 600: 'ReadexPro_600SemiBold', 700: 'ReadexPro_700Bold' },
  body: {
    400: 'IBMPlexSansArabic_400Regular',
    500: 'IBMPlexSansArabic_500Medium',
    600: 'IBMPlexSansArabic_600SemiBold',
    700: 'IBMPlexSansArabic_700Bold',
  },
} as const;
