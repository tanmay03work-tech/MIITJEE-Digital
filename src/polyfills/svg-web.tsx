// Web polyfill for react-native-svg
// Provides SVG components using standard web SVG elements
import React from 'react';

function createSvgComponent(tag: string) {
  return React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement(tag, { ref, ...props }, children);
  });
}

const Svg = createSvgComponent('svg');
const Circle = createSvgComponent('circle');
const Rect = createSvgComponent('rect');
const Path = createSvgComponent('path');
const G = createSvgComponent('g');
const Text = createSvgComponent('text');
const TSpan = createSvgComponent('tspan');
const Defs = createSvgComponent('defs');
const LinearGradient = createSvgComponent('linearGradient');
const RadialGradient = createSvgComponent('radialGradient');
const Stop = createSvgComponent('stop');
const ClipPath = createSvgComponent('clipPath');
const Mask = createSvgComponent('mask');
const Line = createSvgComponent('line');
const Polygon = createSvgComponent('polygon');
const Polyline = createSvgComponent('polyline');
const Ellipse = createSvgComponent('ellipse');
const Use = createSvgComponent('use');
const Symbol = createSvgComponent('symbol');
const Pattern = createSvgComponent('pattern');
const Image = createSvgComponent('image');
const ForeignObject = createSvgComponent('foreignObject');

export {
  Circle, Rect, Path, G, Text, TSpan, Defs,
  LinearGradient, RadialGradient, Stop, ClipPath, Mask,
  Line, Polygon, Polyline, Ellipse, Use, Symbol, Pattern,
  Image, ForeignObject,
};

export default Svg;
