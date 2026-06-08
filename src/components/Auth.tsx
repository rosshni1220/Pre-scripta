import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { Activity } from 'lucide-react';

interface AuthProps {
  onLogin: () => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<boolean>(false);
  const [tempUser, setTempUser] = useState<any>(null);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          onLogin();
        } else {
          setTempUser(user);
          setRoleSelection(true);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }
    } catch (error) {
      console.error('Login failed', error);
      alert('Login failed. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = async (role: 'doctor' | 'receptionist') => {
    if (!tempUser) return;
    try {
      setLoading(true);
      try {
        await setDoc(doc(db, 'users', tempUser.uid), {
          email: tempUser.email,
          name: tempUser.displayName || 'Unknown',
          role,
          createdAt: Date.now()
        });
        onLogin();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${tempUser.uid}`);
      }
    } catch (error) {
      console.error('Failed to create user role', error);
      alert('Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col font-sans text-slate-900 bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-blue-200 mb-4">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Prescripta
          </h1>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            ePrescription & Appointment Management
          </p>
        </div>

        {!roleSelection ? (
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 font-semibold shadow-sm"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="h-5 w-5" />
            <span>Sign in with Google</span>
          </button>
        ) : (
          <div className="space-y-6">
            <h3 className="text-center font-bold text-xs uppercase tracking-wider text-slate-400">Select your role to continue</h3>
            <div className="flex gap-4">
              <button
                onClick={() => handleRoleSelect('doctor')}
                disabled={loading}
                className="flex-1 rounded-xl bg-blue-600 py-3 text-white transition hover:bg-blue-700 disabled:opacity-50 font-semibold shadow-md shadow-blue-100"
              >
                Doctor
              </button>
              <button
                onClick={() => handleRoleSelect('receptionist')}
                disabled={loading}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 py-3 text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 font-semibold"
              >
                Receptionist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
