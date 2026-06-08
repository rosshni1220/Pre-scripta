/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import Auth from './components/Auth';
import ReceptionistDashboard from './components/ReceptionistDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import { UserProfile } from './types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.uid);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      const docSnap = await getDoc(doc(db, 'users', uid));
      if (docSnap.exists()) {
        setProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user || !profile) {
    return <Auth onLogin={() => { if (user) loadProfile(user.uid); }} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={<Navigate to={`/${profile.role}`} replace />} 
        />
        <Route 
          path="/doctor/*" 
          element={profile.role === 'doctor' ? <DoctorDashboard /> : <Navigate to="/" replace />} 
        />
        <Route 
          path="/receptionist/*" 
          element={profile.role === 'receptionist' ? <ReceptionistDashboard /> : <Navigate to="/" replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}
