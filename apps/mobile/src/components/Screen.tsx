import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../theme';
import { IconButton, T } from './ui';

/**
 * Standard screen: safe area, optional header with back button, scrolling
 * content and an optional footer pinned above the keyboard.
 */
export function Screen({
  title,
  back,
  right,
  children,
  footer,
  scroll = true,
  background = colors.ground,
  contentStyle,
}: {
  title?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));
  const body: StyleProp<ViewStyle> = [{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 14 }, contentStyle];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {back || title || right ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm }}>
            {back ? <IconButton icon="back" label={t('common.back')} onPress={onBack} /> : <View style={{ width: 44 }} />}
            <T variant="h2" style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
              {title ?? ''}
            </T>
            {right ?? <View style={{ width: 44 }} />}
          </View>
        ) : null}
        {scroll ? (
          <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, body]}>{children}</View>
        )}
        {footer ? <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, paddingTop: space.xs, gap: 10 }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
