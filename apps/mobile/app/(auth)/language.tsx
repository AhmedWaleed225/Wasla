import type { Locale } from '@wasla/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { Button, T } from '../../src/components/ui';
import { setLanguage } from '../../src/i18n';
import { colors, fonts, radius, space } from '../../src/theme';

function LanguageOption({ lang, title, hint, glyph, selected, onPress }: { lang: Locale; title: string; hint: string; glyph: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLanguage={lang}
      onPress={onPress}
      style={{
        flexDirection: lang === 'ar' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.line,
      }}
    >
      <T style={{ fontFamily: fonts.display[700], fontSize: 22, width: 44, textAlign: 'center' }}>{glyph}</T>
      <View style={{ flex: 1, alignItems: lang === 'ar' ? 'flex-end' : 'flex-start' }}>
        <T variant="h3">{title}</T>
        <T variant="meta" muted>{hint}</T>
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: selected ? 0 : 2,
          borderColor: colors.lineStrong,
          backgroundColor: selected ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const [choice, setChoice] = useState<Locale>(i18n.language === 'en' ? 'en' : 'ar');
  const [saving, setSaving] = useState(false);

  const onContinue = async () => {
    setSaving(true);
    // May reload the app to switch layout direction; the stored choice routes to Welcome after reload.
    await setLanguage(choice);
    router.replace('/welcome');
  };

  return (
    <Screen footer={<Button title={t('common.continue')} onPress={onContinue} loading={saving} />}>
      <View style={{ paddingTop: space.xxxl, gap: space.xs }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="globe" color={colors.primary} />
        </View>
        <T variant="h1">Choose your language</T>
        <T variant="h1" color={colors.primary}>اختار لغتك</T>
        <T muted>{t('language.subtitle')}</T>
      </View>
      <LanguageOption lang="en" title="English" hint="Left-to-right" glyph="Aa" selected={choice === 'en'} onPress={() => setChoice('en')} />
      <LanguageOption lang="ar" title="العربية" hint="من اليمين للشمال" glyph="أ" selected={choice === 'ar'} onPress={() => setChoice('ar')} />
    </Screen>
  );
}
