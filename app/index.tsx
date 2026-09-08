import { Redirect } from 'expo-router';

import { HousewireHub } from '@/src/features/hub/HousewireHub';
import { useHousewireStore } from '@/src/store/use-housewire-store';

export default function IndexScreen() {
  const onboardingComplete = useHousewireStore((state) => state.onboardingComplete);

  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  return <HousewireHub />;
}
