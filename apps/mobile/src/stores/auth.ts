import type { MeDto, VerifyOtpResultDto } from '@wasla/shared';
import { create } from 'zustand';
import { ApiError, ensureFreshSession, tokenStore } from '../api/client';
import { authApi, meApi } from '../api/endpoints';

type Status = 'loading' | 'offline' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  me: MeDto | null;
  /** Phone being verified between the phone and OTP screens. */
  pendingPhone: string | null;
  resendAfter: number;
  bootstrap: () => Promise<void>;
  setPendingPhone: (phone: string, resendAfter: number) => void;
  signIn: (result: VerifyOtpResultDto) => Promise<void>;
  setMe: (me: MeDto) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  me: null,
  pendingPhone: null,
  resendAfter: 0,

  async bootstrap() {
    if (!(await tokenStore.hasRefreshToken())) {
      set({ status: 'signedOut', me: null });
      return;
    }
    try {
      await ensureFreshSession();
      const me = await meApi.get();
      set({ status: 'signedIn', me });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NETWORK') {
        // Offline at launch: keep the stored session and offer a retry.
        set({ status: 'offline', me: null });
        return;
      }
      await tokenStore.clear();
      set({ status: 'signedOut', me: null });
    }
  },

  setPendingPhone: (phone, resendAfter) => set({ pendingPhone: phone, resendAfter }),

  async signIn(result) {
    await tokenStore.save(result);
    set({ status: 'signedIn', me: result.user, pendingPhone: null });
  },

  setMe: (me) => set({ me }),

  async signOut() {
    try {
      await authApi.logout();
    } catch {
      // Already invalid on the server, or offline — clear locally either way.
    }
    await tokenStore.clear();
    set({ status: 'signedOut', me: null });
  },
}));

tokenStore.onSessionLost(() => useAuth.setState({ status: 'signedOut', me: null }));
