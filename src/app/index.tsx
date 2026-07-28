import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { getSetting } from '@/data/repository';
import { useApp } from '@/state/app-provider';

export default function EntryScreen() {
  const { ready, sources } = useApp();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    if (ready) void getSetting('onboardingComplete').then((value) => setOnboarded(value === 'true'));
  }, [ready]);
  if (!ready || onboarded === null) return null;
  return <Redirect href={!onboarded && sources.length === 0 ? '/onboarding' : '/(tabs)'} />;
}
