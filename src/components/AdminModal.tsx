import React, { useEffect, useRef, useState } from 'react';
import { Lock, LogIn, ShieldCheck, X } from 'lucide-react';
import type { User } from 'firebase/auth';

interface AdminModalProps {
  open: boolean;
  user: User | null;
  isAuthorizedAdminAccount: boolean;
  onClose: () => void;
  onGoogleSignIn: () => Promise<void>;
  onUnlockSuccess: () => void;
}

const ADMIN_PASSCODE = '6933173';

export function AdminModal({
  open,
  user,
  isAuthorizedAdminAccount,
  onClose,
  onGoogleSignIn,
  onUnlockSuccess,
}: AdminModalProps) {
  const [passcode, setPasscode] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPasscode('');
      setPinVerified(false);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (open && pinVerified && isAuthorizedAdminAccount) {
      onUnlockSuccess();
    }
  }, [open, pinVerified, isAuthorizedAdminAccount, onUnlockSuccess]);

  if (!open) return null;

  const handleSubmitPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() !== ADMIN_PASSCODE) {
      setError('Incorrect verification passcode.');
      return;
    }

    setError(null);
    if (isAuthorizedAdminAccount) {
      onUnlockSuccess();
    } else {
      setPinVerified(true);
    }
  };

  const handleSignInClick = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Google sign-in was cancelled or failed.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
    >
      <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-sm p-6 shadow-xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close admin modal"
          className="absolute top-3.5 right-3.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#008069]/10 text-[#008069] flex items-center justify-center shrink-0">
            {pinVerified ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <h2 id="admin-modal-title" className="font-display text-base font-bold text-stone-900">
              Admin Verification
            </h2>
            <p className="text-xs text-stone-500">
              Janiru tech academy broadcast controls
            </p>
          </div>
        </div>

        {!pinVerified ? (
          <form onSubmit={handleSubmitPin} className="space-y-4">
            <div>
              <label htmlFor="admin-passcode" className="block text-xs font-medium text-stone-600 mb-1.5">
                Channel Admin Passcode
              </label>
              <input
                ref={inputRef}
                id="admin-passcode"
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter passcode"
                className="w-full h-11 px-3.5 rounded-lg border border-stone-300 text-center font-mono-tabular text-base tracking-widest focus:outline-none focus:border-[#008069] focus:ring-2 focus:ring-[#008069]/20"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-[#008069] hover:bg-[#006B58] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Unlock
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-stone-600 leading-relaxed">
              {user
                ? `Signed in as ${user.email}. Please sign in with the authorized channel admin Google account to publish or schedule alerts.`
                : 'Passcode accepted. Sign in with your authorized channel admin Google account to activate broadcasting.'}
            </p>

            {error && (
              <p className="text-xs text-red-600 font-medium" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={signingIn}
                onClick={handleSignInClick}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[#008069] hover:bg-[#006B58] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {signingIn ? 'Connecting...' : 'Sign in with Google'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
