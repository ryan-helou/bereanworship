'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { enter, type EnterState } from './actions';

const initialState: EnterState = { status: 'idle' };

export function EnterForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(enter, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      {state.status === 'error' && (
        <div role="alert" className="rounded-lg border border-flare-200 bg-flare-50 px-4 py-3 text-sm text-flare-800">
          {state.message}
        </div>
      )}

      <div>
        <label htmlFor="site-password" className="block text-sm font-medium text-ink-800">
          Password
        </label>
        <input
          id="site-password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="mt-2 h-11 w-full rounded-xl border border-line bg-bone-50 px-3.5 text-[0.9375rem] text-ink-900 focus:border-volt-400 focus:outline-none focus:ring-4 focus:ring-volt-100"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-indigo-900 px-5 text-sm font-medium text-white transition-colors hover:bg-indigo-800 disabled:opacity-60"
    >
      {pending ? 'Checking…' : 'Enter'}
    </button>
  );
}
