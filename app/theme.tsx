'use client';

import { useSyncExternalStore } from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { NativeSelect } from '@/components/ui/native-select';

export { ThemeProvider };

const subscribe = () => () => {};

export function ThemeSwitch() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  return <NativeSelect aria-label="Color theme" size="sm" disabled={!mounted}
    value={mounted ? theme ?? 'system' : 'system'} onChange={event => setTheme(event.target.value)}>
    <option value="system">System</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </NativeSelect>;
}
