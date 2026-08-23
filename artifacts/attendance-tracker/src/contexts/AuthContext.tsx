import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { storageSetItem, storageRemoveItem } from '@/lib/idb';

const AUTH_KEY = 'att_auth';
const SESSION_KEY = 'att_session';
const PROFILE_IMAGE_KEY = 'att_profile_image';
const LAST_ACTIVE_KEY = 'att_last_active_at';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable.');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function createPasswordRecord(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { passwordHash: await derivePasswordHash(password, salt), passwordSalt: bytesToBase64(salt) };
}

async function checkPassword(password: string, stored: StoredAuth): Promise<boolean> {
  try {
    if (stored.passwordHash && stored.passwordSalt) {
      return await derivePasswordHash(password, base64ToBytes(stored.passwordSalt)) === stored.passwordHash;
    }
    if (stored.passwordEncoded) {
      const bytes = new TextEncoder().encode(password);
      return bytesToBase64(bytes) === stored.passwordEncoded;
    }
  } catch {}
  return false;
}

interface StoredAuth {
  username: string;
  passwordEncoded?: string;
  passwordHash?: string;
  passwordSalt?: string;
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
  createAccount: (username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
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
  const createAccount = async (user: string, password: string): Promise<boolean> => {
    if (!user.trim() || !password) return false;
    try {
      const stored: StoredAuth = { username: user.trim(), ...(await createPasswordRecord(password)) };
      await Promise.all([
        storageSetItem(AUTH_KEY, JSON.stringify(stored)),
        storageSetItem(SESSION_KEY, 'true'),
      ]);
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
  const login = async (user: string, password: string): Promise<boolean> => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    try {
      const stored: StoredAuth = JSON.parse(raw);
      if (stored.username.toLowerCase() === user.trim().toLowerCase() && await checkPassword(password, stored)) {
        if (stored.passwordEncoded && !stored.passwordHash) {
          const upgraded = await createPasswordRecord(password);
          const { passwordEncoded: _legacyPassword, ...withoutLegacyPassword } = stored;
          await storageSetItem(AUTH_KEY, JSON.stringify({ ...withoutLegacyPassword, ...upgraded }));
        }
        await storageSetItem(SESSION_KEY, 'true');
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
