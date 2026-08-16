// Web polyfill for react-native-gesture-handler
import React from 'react';

export function GestureHandlerRootView({ children, style, ...props }: any) {
  return React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', boxSizing: 'border-box', ...flattenStyle(style) }, ...props }, children);
}

function flattenStyle(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce((acc: any, s: any) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style;
}

// Gesture stubs
export const Gesture = {
  Pan: () => ({ onStart: () => Gesture.Pan(), onUpdate: () => Gesture.Pan(), onEnd: () => Gesture.Pan() }),
  Tap: () => ({ onStart: () => Gesture.Tap(), onEnd: () => Gesture.Tap() }),
  Pinch: () => ({ onStart: () => Gesture.Pinch(), onUpdate: () => Gesture.Pinch(), onEnd: () => Gesture.Pinch() }),
};

export function GestureDetector({ children }: any) {
  return children;
}

// Legacy gesture handler stubs
export const PanGestureHandler = ({ children }: any) => children;
export const TapGestureHandler = ({ children }: any) => children;
export const PinchGestureHandler = ({ children }: any) => children;
export const RotationGestureHandler = ({ children }: any) => children;
export const FlingGestureHandler = ({ children }: any) => children;
export const LongPressGestureHandler = ({ children }: any) => children;
export const ScrollView = React.forwardRef((props: any, ref: any) =>
  React.createElement('div', { ref, style: { overflow: 'auto', ...flattenStyle(props.style) }, ...props }, props.children)
);
export const FlatList = React.forwardRef((props: any, ref: any) =>
  React.createElement('div', { ref, ...props }, props.children)
);
export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};
export const Directions = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 };

export default {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  State,
  Directions,
};
