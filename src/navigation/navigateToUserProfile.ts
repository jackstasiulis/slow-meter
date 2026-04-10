import type { NavigationProp } from '@react-navigation/native';

/**
 * Opens UserProfile from any navigator: walks up until a stack that registers
 * `UserProfile` is found; otherwise navigates via MainTabs → Feed → UserProfile
 * so the floating dock stays visible.
 */
export function navigateToUserProfile(navigation: NavigationProp<any>, userId: string) {
  let nav: any = navigation;
  for (let i = 0; i < 8 && nav; i += 1) {
    const names = nav.getState?.()?.routeNames as string[] | undefined;
    if (names?.includes('UserProfile')) {
      nav.navigate('UserProfile', { userId });
      return;
    }
    nav = nav.getParent?.();
  }

  navigation.navigate('MainTabs', {
    screen: 'Feed',
    params: {
      screen: 'UserProfile',
      params: { userId },
    },
  });
}
