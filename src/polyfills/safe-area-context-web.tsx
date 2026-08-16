// Web polyfill for react-native-safe-area-context
import React, { createContext, useContext } from 'react';

const defaultInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const defaultFrame = { x: 0, y: 0, width: typeof window !== 'undefined' ? window.innerWidth : 1280, height: typeof window !== 'undefined' ? window.innerHeight : 800 };

export const initialWindowMetrics = {
  frame: defaultFrame,
  insets: defaultInsets,
};

const SafeAreaInsetsContext = createContext(defaultInsets);
const SafeAreaFrameContext = createContext(defaultFrame);

export function SafeAreaProvider({ children, style, ...props }: any) {
  return React.createElement(
    SafeAreaInsetsContext.Provider,
    { value: defaultInsets },
    React.createElement(
      SafeAreaFrameContext.Provider,
      { value: defaultFrame },
      React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', boxSizing: 'border-box', ...flattenStyle(style) }, ...props }, children)
    )
  );
}

export function SafeAreaView({ children, style, edges, ...props }: any) {
  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', boxSizing: 'border-box', ...flattenStyle(style) }, ...props }, children);
}

export function useSafeAreaInsets() {
  return useContext(SafeAreaInsetsContext);
}

export function useSafeAreaFrame() {
  return useContext(SafeAreaFrameContext);
}

export function SafeAreaInsetsContext_() {
  return SafeAreaInsetsContext;
}

export { SafeAreaInsetsContext as SafeAreaInsetsContext };

function flattenStyle(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc: any, s: any) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style;
}
