import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { loadProfile, saveProfile, type Profile } from '../lib/profile';

interface ProfileApi {
  profile: Profile;
  setProfile: (next: Profile) => void;
}

const ProfileCtx = createContext<ProfileApi | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<Profile>(() => loadProfile());
  const setProfile = useCallback((next: Profile) => {
    setProfileState(next);
    saveProfile(next);
  }, []);
  const value = useMemo(() => ({ profile, setProfile }), [profile, setProfile]);
  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
