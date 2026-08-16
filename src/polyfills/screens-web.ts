// Web polyfill for react-native-screens
// On web, react-native-screens containers need absolute positioning and visibility toggling
// so screens overlay each other at (0, 0) and covered background screens are hidden with `display: 'none'`.
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function enableScreens(_shouldEnable?: boolean) {
  // no-op on web
}

export function enableFreeze(_shouldEnable?: boolean) {
  // no-op on web
}

export const screensEnabled = () => true;

// Compatibility flags
export const compatibilityFlags: Record<string, boolean> = {};

function isScreenActive(props: any): boolean {
  const { activityState, active, visible } = props;

  // activityState: 0 = inactive, 1 = background/tab active, 2 = top active screen
  if (activityState !== undefined && activityState !== null) {
    const stateNum = Number(activityState);
    if (stateNum === 0) {
      return false;
    }
    return true;
  }

  // active: 0 = inactive, 1 = active (for older 2-state props)
  if (active !== undefined && active !== null) {
    const activeNum = Number(active);
    return activeNum !== 0;
  }

  if (visible !== undefined && visible !== null) {
    return Boolean(visible);
  }

  return true;
}

// Screen container - relative flex container for overlaying absolute screen children
export function ScreenContainer(props: any) {
  const { children, style, ...rest } = props;
  return React.createElement(
    View,
    { style: [styles.container, style], ...rest },
    children
  );
}

export function NativeScreenContainer(props: any) {
  const { children, style, ...rest } = props;
  return React.createElement(
    View,
    { style: [styles.container, style], ...rest },
    children
  );
}

// Screen item - must position absolutely inside ScreenContainer and hide when inactive/background
export function Screen(props: any) {
  const { children, style, activityState, active, visible, stackPresentation, ...rest } = props;
  const activeState = isScreenActive(props);

  return React.createElement(
    View,
    {
      style: [
        styles.screen,
        style,
        !activeState && styles.hidden,
      ],
      ...rest,
    },
    children
  );
}

export function NativeScreen(props: any) {
  const { children, style, activityState, active, visible, stackPresentation, ...rest } = props;
  const activeState = isScreenActive(props);

  return React.createElement(
    View,
    {
      style: [
        styles.screen,
        style,
        !activeState && styles.hidden,
      ],
      ...rest,
    },
    children
  );
}

export function ScreenStack(props: any) {
  const { children, style, ...rest } = props;
  return React.createElement(
    View,
    { style: [styles.container, style], ...rest },
    children
  );
}

export function ScreenStackItem(props: any) {
  const { children, style, activityState, active, visible, stackPresentation, ...rest } = props;
  const activeState = isScreenActive(props);

  return React.createElement(
    View,
    {
      style: [
        styles.screen,
        style,
        !activeState && styles.hidden,
      ],
      ...rest,
    },
    children
  );
}

export function ScreenStackHeaderConfig(_props: any) {
  return null;
}

export function ScreenStackHeaderBackButtonImage(_props: any) {
  return null;
}

export function ScreenStackHeaderCenterView({ children }: any) {
  return React.createElement(View, { style: styles.headerView }, children);
}

export function ScreenStackHeaderLeftView({ children }: any) {
  return React.createElement(View, { style: styles.headerView }, children);
}

export function ScreenStackHeaderRightView({ children }: any) {
  return React.createElement(View, { style: styles.headerView }, children);
}

export function ScreenStackHeaderSearchBarView({ children }: any) {
  return React.createElement(View, null, children);
}

export function SearchBar(_props: any) {
  return null;
}

export function ScreenFooter({ children }: any) {
  return React.createElement(View, null, children);
}

export const isSearchBarAvailableForCurrentPlatform = false;

export function FullWindowOverlay(props: any) {
  const { children, style, ...rest } = props;
  return React.createElement(
    View,
    { style: [styles.container, style], ...rest },
    children
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  hidden: {
    display: 'none',
  },
  headerView: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default {
  enableScreens,
  enableFreeze,
  screensEnabled,
  compatibilityFlags,
  ScreenContainer,
  Screen,
  NativeScreen,
  NativeScreenContainer,
  ScreenStack,
  ScreenStackItem,
  ScreenStackHeaderConfig,
  ScreenStackHeaderBackButtonImage,
  ScreenStackHeaderCenterView,
  ScreenStackHeaderLeftView,
  ScreenStackHeaderRightView,
  ScreenStackHeaderSearchBarView,
  SearchBar,
  ScreenFooter,
  FullWindowOverlay,
  isSearchBarAvailableForCurrentPlatform,
};
