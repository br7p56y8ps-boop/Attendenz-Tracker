import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';

const AUTH_KEY = 'att_auth';
const SESSION_KEY = 'att_session';
const PROFILE_IMAGE_KEY = 'att_profile_image';
const LAST_ACTIVE_KEY = 'att_last_active_at';

/** UTF-8 safe base64 encode — btoa() alone throws on non-Latin1 characters. */
function encodePassword(password: string): string {
  const bytes = new TextEncoder().encode(password);
  return btoa(String.fromCharCode(...bytes));
}

function checkPassword(password: string, encoded: string): boolean {
  try { return encodePassword(password) === encoded; } catch { return false; }
}

interface StoredAuth {
  username: string;
  passwordEncoded?: string;
  email?: string;
}

export interface DataTransferPayload {
  subjects?: any;
  wards?: any;
  homeSelections?: any;
  customSubjects?: any;
  customWards?: any;
  presetTimetable?: any;
  presetWardSchedule?: any;
  presetSubjectTotals?: any;
  preferredPercentage?: number;
}

interface AuthContextType {
  isLoggedIn: boolean;
  hasAccount: boolean;
  username: string;
  userEmail: string | null;
  userPhone: string | null;
  authMethod: 'google' | 'email' | 'phone' | 'local' | 'none';
  isNewAccount: boolean;
  profileImage: string | null;
  lastActiveAt: string;
  
  // Storage & PWA Persistence
  isPersistentStorage: boolean;
  requestPersistentStorage: () => Promise<boolean>;
  
  // Auto-calculated retention policy
  retentionPolicy: {
    days: number;
    reason: string;
    hasActiveRotationOrLectures: boolean;
  };
  
  updateProfileImage: (image: string | null) => void;
  
  // Local Auth
  createAccount: (username: string, password: string) => boolean;
  login: (username: string, password: string) => boolean;
  updateUsername: (newUsername: string) => void;
  
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Always logged in (Offline local app)
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [hasAccount, setHasAccount] = useState(true);
  const [username, setUsername] = useState(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.username) return parsed.username;
      } catch {}
    }
    return 'Medical Student';
  });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<'google' | 'email' | 'phone' | 'local' | 'none'>('local');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isPersistentStorage, setIsPersistentStorage] = useState<boolean>(false);

  const [lastActiveAt, setLastActiveAt] = useState<string>(() => {
    return localStorage.getItem(LAST_ACTIVE_KEY) || new Date().toISOString();
  });

  // Check persistent storage status
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(persisted => {
        setIsPersistentStorage(persisted);
      }).catch(() => {});
    }
  }, []);

  const requestPersistentStorage = async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const granted = await navigator.storage.persist();
        setIsPersistentStorage(granted);
        return granted;
      } catch {
        return false;
      }
    }
    return false;
  };

  const updateLastActive = useCallback(() => {
    const now = new Date().toISOString();
    setLastActiveAt(now);
    storageSetItem(LAST_ACTIVE_KEY, now);
  }, []);

  // Sync state on load
  useEffect(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      try {
        const parsed: StoredAuth = JSON.parse(raw);
        setHasAccount(true);
        if (parsed.username) setUsername(parsed.username);
        setUserEmail(parsed.email || null);
      } catch {}
    }

    const storedImage = localStorage.getItem(PROFILE_IMAGE_KEY);
    if (storedImage) setProfileImage(storedImage);
  }, []);

  // Retention calculation
  const calculateRetentionPolicy = useCallback(() => {
    return {
      days: 365,
      reason: 'Offline Local Storage Policy: All data is stored directly on your device with no expiration.',
      hasActiveRotationOrLectures: true
    };
  }, []);

  const [retentionPolicy] = useState(calculateRetentionPolicy());

  // Local account creation
  const createAccount = (user: string, password: string): boolean => {
    if (!user.trim() || !password) return false;
    try {
      const stored: StoredAuth = { username: user.trim(), passwordEncoded: encodePassword(password) };
      storageSetItem(AUTH_KEY, JSON.stringify(stored));
      storageSetItem(SESSION_KEY, 'true');
      storageRemoveItem('att_setup_done');
      storageRemoveItem('att_subject_mode');
      setHasAccount(true);
      setIsLoggedIn(true);
      setIsNewAccount(true);
      setUsername(user.trim());
      setAuthMethod('local');
      updateLastActive();
      return true;
    } catch { return false; }
  };

  // Local login
  const login = (user: string, password: string): boolean => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    try {
      const stored: StoredAuth = JSON.parse(raw);
      if (stored.username.toLowerCase() === user.trim().toLowerCase() && checkPassword(password, stored.passwordEncoded || '')) {
        storageSetItem(SESSION_KEY, 'true');
        setIsLoggedIn(true);
        setIsNewAccount(false);
        setUsername(stored.username);
        setAuthMethod('local');
        updateLastActive();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const logout = () => {
    storageRemoveItem(SESSION_KEY);
    setIsLoggedIn(false);
    setIsNewAccount(false);
    setAuthMethod('none');
  };

  const updateUsername = (newUsername: string) => {
    const trimmed = newUsername.trim() || 'Medical Student';
    setUsername(trimmed);
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      let stored: StoredAuth = raw ? JSON.parse(raw) : { username: trimmed };
      stored.username = trimmed;
      storageSetItem(AUTH_KEY, JSON.stringify(stored));
    } catch {
      storageSetItem(AUTH_KEY, JSON.stringify({ username: trimmed }));
    }
  };

  const updateProfileImage = (image: string | null) => {
    if (image) {
      storageSetItem(PROFILE_IMAGE_KEY, image);
    } else {
      storageRemoveItem(PROFILE_IMAGE_KEY);
    }
    setProfileImage(image);
  };

  return (
    <AuthContext.Provider value={{ 
      isLoggedIn, 
      hasAccount, 
      username, 
      userEmail,
      userPhone,
      authMethod,
      isNewAccount, 
      profileImage,
      lastActiveAt,
      isPersistentStorage,
      requestPersistentStorage,
      retentionPolicy,
      updateProfileImage,
      createAccount, 
      login, 
      updateUsername,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
