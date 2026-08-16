import React from 'react';
import { HeaderRow } from './HeaderRow';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showLogo?: boolean;
  compact?: boolean;
  onBack?: () => void;
  showBack?: boolean;
}

export function AppHeader({
  title,
  subtitle,
  rightSlot,
  showLogo = true,
  compact = false,
  onBack,
  showBack,
}: AppHeaderProps) {
  return (
    <HeaderRow
      title={title}
      subtitle={subtitle}
      rightSlot={rightSlot}
      showLogo={showLogo}
      compact={compact}
      onBack={onBack}
      showBack={showBack}
    />
  );
}
