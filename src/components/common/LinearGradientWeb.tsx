import React from 'react';
import { View, ViewProps } from 'react-native';

export interface LinearGradientProps extends ViewProps {
  colors: string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  children?: React.ReactNode;
}

export function LinearGradient({ colors, start, end, style, children, ...props }: LinearGradientProps) {
  const colorString = colors.join(', ');
  let angle = '185deg';

  if (start && end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    angle = `${Math.atan2(dy, dx) * (180 / Math.PI) + 90}deg`;
  }

  const gradientStyle = {
    background: `linear-gradient(${angle}, ${colorString})`,
  };

  return (
    <View style={[style, gradientStyle as unknown as ViewProps['style']]} {...props}>
      {children}
    </View>
  );
}

export default LinearGradient;
