'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * A submit button that switches itself off while its form is being sent.
 *
 * Without it a fast double click submits twice: two copies of a new note, or a
 * second "delete" that reports the note missing right after it succeeded. The
 * form still works with JavaScript off; this only removes the double submit.
 */
export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={cn(className, pending && 'cursor-wait opacity-60')}
    >
      {children}
    </button>
  );
}
