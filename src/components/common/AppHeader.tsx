import React from 'react';
import { HeaderRow } from './HeaderRow';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showLogo?: boolean;
  compact?: boolean;
}

export function AppHeader({ title, subtitle, rightSlot, showLogo = true, compact = false }: AppHeaderProps) {
  return <HeaderRow title={title} subtitle={subtitle} rightSlot={rightSlot} showLogo={showLogo} compact={compact} />;
}
