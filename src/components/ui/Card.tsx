import type { HTMLAttributes } from 'react';

/** Static neobrutalist container — border + hard offset shadow, no press
 * behaviour (use Button, or add .press-surface directly, for clickable
 * surfaces). */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`surface p-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}
