import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, fontSize, radius, space, touch } from '../theme';
import { Icon, type IconName } from './Icon';

// ---------- Text ----------

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'meta' | 'caption' | 'price' | 'label';

const VARIANTS: Record<Variant, TextStyle> = {
  h1: { fontFamily: fonts.display[700], fontSize: fontSize.h1, lineHeight: 34 },
  h2: { fontFamily: fonts.display[600], fontSize: fontSize.h2, lineHeight: 26 },
  h3: { fontFamily: fonts.display[600], fontSize: fontSize.h3, lineHeight: 22 },
  body: { fontFamily: fonts.body[400], fontSize: fontSize.body, lineHeight: 24 },
  meta: { fontFamily: fonts.body[400], fontSize: fontSize.meta, lineHeight: 20 },
  caption: { fontFamily: fonts.body[400], fontSize: fontSize.caption, lineHeight: 18 },
  price: { fontFamily: fonts.display[700], fontSize: fontSize.price, lineHeight: 26 },
  label: { fontFamily: fonts.body[600], fontSize: fontSize.meta, lineHeight: 20 },
};

export function T({
  variant = 'body',
  color = colors.text,
  muted,
  weight,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string; muted?: boolean; weight?: 500 | 600 | 700 }) {
  return (
    <Text
      {...rest}
      style={[
        VARIANTS[variant],
        { color: muted ? colors.textSecondary : color, textAlign: 'auto', writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' },
        weight ? { fontFamily: fonts.body[weight] } : null,
        style,
      ]}
    />
  );
}

// ---------- Button ----------

type ButtonKind = 'primary' | 'secondary' | 'tonal' | 'danger' | 'ghost';

const BUTTON: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: '#fff' },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  tonal: { bg: colors.primaryTint, fg: colors.primaryPressed },
  danger: { bg: colors.danger, fg: '#fff' },
  ghost: { bg: 'transparent', fg: colors.primary },
};

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const k = BUTTON[kind];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: touch.button,
          borderRadius: radius.button,
          backgroundColor: off && kind === 'primary' ? colors.line : pressed && kind === 'primary' ? colors.primaryPressed : k.bg,
          borderWidth: k.border ? 1.5 : 0,
          borderColor: k.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.xs,
          paddingHorizontal: space.lg,
          opacity: pressed && kind !== 'primary' ? 0.7 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={k.fg} /> : icon ? <Icon name={icon} color={off && kind === 'primary' ? colors.placeholder : k.fg} /> : null}
      <Text style={{ fontFamily: fonts.display[600], fontSize: 16, color: off && kind === 'primary' ? colors.placeholder : k.fg }}>{title}</Text>
    </Pressable>
  );
}

// ---------- Card ----------

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const base: ViewStyle = { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space.md };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

// ---------- Field ----------

export const Field = forwardRef<
  TextInputInstance,
  TextInputProps & { label?: string; error?: string; hint?: string; prefix?: ReactNode; suffix?: ReactNode }
>(function Field({ label, error, hint, prefix, suffix, style, onFocus, onBlur, ...rest }, ref) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label" color={colors.textTertiary}>{label}</T> : null}
      <View
        style={{
          minHeight: touch.field,
          backgroundColor: colors.surface,
          borderRadius: radius.button,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : colors.lineStrong,
          paddingHorizontal: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {prefix}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={label}
          style={[{ flex: 1, fontFamily: fonts.body[500], fontSize: fontSize.body, color: colors.text, paddingVertical: 12, textAlign: I18nManager.isRTL ? 'right' : 'left' }, style]}
          {...rest}
        />
        {suffix}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <T variant="caption" color={colors.dangerText}>{error}</T>
        </View>
      ) : hint ? (
        <T variant="caption" muted>{hint}</T>
      ) : null}
    </View>
  );
});

// ---------- Chip, Segmented, Toggle ----------

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={{
        height: 40,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.text : colors.lineStrong,
        backgroundColor: selected ? colors.text : colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? '#fff' : colors.text} /> : null}
      <T variant="meta" weight={500} color={selected ? '#fff' : colors.text}>{label}</T>
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.line, borderRadius: 14, padding: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: on ? colors.surface : 'transparent' }}
          >
            <T variant="meta" weight={on ? 600 : 500} color={on ? colors.text : colors.textTertiary}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="caption" muted>{hint}</T> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.lineStrong }}
        thumbColor="#fff"
      />
    </View>
  );
}

// ---------- Misc ----------

export function Avatar({ name, size = 44, color = colors.primary }: { name: string | null | undefined; size?: number; color?: string }) {
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase() || '؟';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden>
      <Text style={{ color: '#fff', fontFamily: fonts.display[600], fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'teal' }: { label: string; tone?: 'teal' | 'sand' | 'blue' | 'red' | 'gray' }) {
  const map = {
    teal: [colors.primaryTint, colors.primaryPressed],
    sand: [colors.accentTint, colors.accentText],
    blue: [colors.infoTint, colors.infoText],
    red: [colors.dangerTint, colors.dangerText],
    gray: [colors.muted, colors.textTertiary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.tag, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <T variant="caption" weight={600} color={fg}>{label}</T>
    </View>
  );
}

export function Notice({ text, tone = 'info', icon = 'lock' }: { text: string; tone?: 'info' | 'warn' | 'error' | 'neutral'; icon?: IconName }) {
  const map = {
    info: [colors.primaryTint, colors.primaryPressed],
    warn: [colors.accentTint, colors.accentText],
    error: [colors.dangerTint, colors.dangerText],
    neutral: [colors.muted, colors.textTertiary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: bg, borderRadius: 14, padding: 12 }}>
      <Icon name={icon} color={fg} size={18} />
      <T variant="meta" color={fg} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: touch.min,
        height: touch.min,
        borderRadius: radius.icon,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.ground : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name={icon} />
    </Pressable>
  );
}

export function Row({ icon, title, subtitle, onPress, trailing, danger }: { icon?: IconName; title: string; subtitle?: string; onPress?: () => void; trailing?: ReactNode; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
    >
      {icon ? <Icon name={icon} color={danger ? colors.dangerText : colors.primary} /> : null}
      <View style={{ flex: 1 }}>
        <T weight={danger ? 600 : undefined} color={danger ? colors.dangerText : colors.text}>{title}</T>
        {subtitle ? <T variant="caption" muted>{subtitle}</T> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron" size={16} color={colors.textSecondary} /> : null)}
    </Pressable>
  );
}

export const Divider = () => <View style={{ height: 1, backgroundColor: colors.line }} />;
