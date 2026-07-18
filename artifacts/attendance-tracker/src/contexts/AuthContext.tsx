import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const AUTH_KEY = 'att_auth';
const SESSION_KEY = 'att_session';
const PROFILE_IMAGE_KEY = 'att_profile_image';

// All localStorage keys owned by this app — used for targeted wipe in forgotPassword.
// Keep this list in sync with every key used across all contexts/components.
const ALL_APP_KEYS = [
  'att_auth',
  'att_session',
  'att_profile_image',
  'att_custom_subjects',
  'att_custom_wards',
  'att_whats_new_version',
  'att_subject_mode',
  'att_setup_done',
  'attendance_tracker_subjects',
  'attendance_tracker_ward',
  'attendance_tracker_home_selections',
] as const;

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
  passwordEncoded: string; // UTF-8 safe base64
}

interface AuthContextType {
  isLoggedIn: boolean;
  hasAccount: boolean;
  username: string;
  /** True immediately after createAccount() succeeds; used to show new-user setup vs migration prompt */
  isNewAccount: boolean;
  profileImage: string | null;
  updateProfileImage: (image: string | null) => void;
  createAccount: (username: string, password: string) => boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  forgotPassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(AUTH_KEY);
    const storedImage = localStorage.getItem(PROFILE_IMAGE_KEY);
    if (storedImage) setProfileImage(storedImage);
    
    if (raw) {
      try {
        const parsed: StoredAuth = JSON.parse(raw);
        setHasAccount(true);
        setUsername(parsed.username);
        const session = localStorage.getItem(SESSION_KEY);
        if (session === 'true') setIsLoggedIn(true);
      } catch {
        setHasAccount(false);
      }
    }
  }, []);

  const createAccount = (user: string, password: string): boolean => {
    if (!user.trim() || !password) return false;
    try {
      const stored: StoredAuth = { username: user.trim(), passwordEncoded: encodePassword(password) };
      localStorage.setItem(AUTH_KEY, JSON.stringify(stored));
      localStorage.setItem(SESSION_KEY, 'true');
      setHasAccount(true);
      setIsLoggedIn(true);
      setIsNewAccount(true);
      setUsername(user.trim());
      return true;
    } catch { return false; }
  };

  const login = (user: string, password: string): boolean => {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    try {
      const stored: StoredAuth = JSON.parse(raw);
      if (stored.username === user.trim() && checkPassword(password, stored.passwordEncoded)) {
        localStorage.setItem(SESSION_KEY, 'true');
        setIsLoggedIn(true);
        setIsNewAccount(false);
        setUsername(stored.username);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setIsLoggedIn(false);
    setIsNewAccount(false);
  };

  const updateProfileImage = (image: string | null) => {
    if (image) {
      localStorage.setItem(PROFILE_IMAGE_KEY, image);
    } else {
      localStorage.removeItem(PROFILE_IMAGE_KEY);
    }
    setProfileImage(image);
  };

  const forgotPassword = () => {
    ALL_APP_KEYS.forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    setHasAccount(false);
    setIsNewAccount(false);
    setUsername('');
  };

  return (
    <AuthContext.Provider value={{ 
      isLoggedIn, 
      hasAccount, 
      username, 
      isNewAccount, 
      profileImage,
      updateProfileImage,
      createAccount, 
      login, 
      logout, 
      forgotPassword 
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
