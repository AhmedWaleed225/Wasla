import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { I18nManager, type ColorValue } from 'react-native';
import { colors } from '../theme';

/** Stroke icons from the Wasla icon set (24 px grid, 1.8 px rounded stroke). */
const ICONS = {
  home: <Path d="M3 11 12 4l9 7M5 10v10h14V10" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  calendar: (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  chat: <Path d="M4 5h16v11H9l-5 4z" />,
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.5} />
    </>
  ),
  shield: <Path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4" />,
  car: <Path d="M3 13l2-6h14l2 6v5H3zM3 13h18" />,
  users: <Path d="M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2" />,
  bell: <Path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />,
  back: <Path d="M19 12H5M11 6l-6 6 6 6" />,
  chevron: <Path d="m9 6 6 6-6 6" />,
  check: <Path d="m5 12 5 5 9-10" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  swap: <Path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />,
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  globe: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </>
  ),
  gear: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  briefcase: <Path d="M3 7h18v13H3zM9 7V4h6v3M3 12h18" />,
  logout: <Path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  trash: <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <Path d="M4 20h4L19 9l-4-4L4 16z" />,
  cash: (
    <>
      <Rect x={2} y={6} width={20} height={12} rx={2} />
      <Circle cx={12} cy={12} r={2.5} />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
} as const;

export type IconName = keyof typeof ICONS;

/** Icons that point somewhere and must mirror in Arabic. */
const DIRECTIONAL: IconName[] = ['back', 'chevron'];

export function Icon({ name, size = 20, color = colors.text, strokeWidth = 1.8 }: { name: IconName; size?: number; color?: ColorValue; strokeWidth?: number }) {
  const mirror = I18nManager.isRTL && DIRECTIONAL.includes(name);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name]}
    </Svg>
  );
}

/** The Wasla mark: pickup ring and destination dot joined by one road. */
export function LogoMark({ size = 64, onDark = false }: { size?: number; onDark?: boolean }) {
  const ground = onDark ? colors.primary : colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Wasla">
      {!onDark && <Rect width={64} height={64} rx={18} fill={colors.primary} />}
      <Path d="M17 44c0-10 8-12 15-12s15-2 15-12" stroke="#fff" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Circle cx={17} cy={45} r={6} fill={ground} stroke="#fff" strokeWidth={4} />
      <Circle cx={47} cy={19} r={6.5} fill={colors.accent} />
    </Svg>
  );
}
