import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'yellow' | 'pink' | 'cyan' | 'violet' | 'lime' | 'paper' | 'ink';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_BG: Record<ButtonVariant, string> = {
  yellow: 'var(--yellow)',
  pink: 'var(--pink)',
  cyan: 'var(--cyan)',
  violet: 'var(--violet)',
  lime: 'var(--lime)',
  paper: 'var(--paper)',
  ink: 'var(--ink)',
};

/** Neobrutalist button (§7): hard border, offset shadow, translates onto
 * the shadow and drops it on press — all handled by the shared
 * `.press-surface` class so every pressable surface in the app behaves
 * identically. Fully keyboard-operable via native <button> semantics plus
 * `.press-surface`'s :focus-visible outline. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'yellow', className = '', style, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`press-surface font-display uppercase tracking-tight text-sm px-5 py-3 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={{
        background: VARIANT_BG[variant],
        color: variant === 'ink' ? 'var(--paper)' : 'var(--ink)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
});
