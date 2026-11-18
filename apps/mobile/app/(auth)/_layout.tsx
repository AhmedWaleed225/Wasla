import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/stores/auth';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  const status = useAuth((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />;
}
