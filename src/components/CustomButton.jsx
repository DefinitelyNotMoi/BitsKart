import React, { forwardRef } from 'react';
import { Button } from '@mui/material';

const CustomButton = forwardRef(({ to, onClick, children, ...props }, ref) => {
  const handleContextMenu = (e) => {
    e.preventDefault();
    // This will show the browser's default context menu with "Open in new tab"
  };

  const handleClick = (e) => {
    if (e.button === 1 || (e.ctrlKey && e.button === 0)) {
      // Middle click or Ctrl+Click - open in new tab
      e.preventDefault();
      if (to) {
        window.open(to, '_blank');
      } else if (onClick) {
        const result = onClick(e);
        if (result && result.then) {
          result.catch(console.error);
        }
      }
      return;
    }
    
    if (e.button === 0 && !e.ctrlKey && onClick) {
      // Regular left click - normal behavior
      onClick(e);
    }
  };

  return (
    <Button
      ref={ref}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      component={to ? 'a' : 'button'}
      href={to || undefined}
      target={to ? "_blank" : undefined}
      rel={to ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </Button>
  );
});

CustomButton.displayName = 'CustomButton';

export default CustomButton;
