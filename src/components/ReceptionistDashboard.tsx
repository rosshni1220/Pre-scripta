import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Appointment, Prescription } from '../types';
import { LogOut, Calendar, Users, DollarSign, Plus, CheckCircle, Clock, FileText, RefreshCw, XCircle, Pencil, X } from 'lucide-react';
import { format } from 'date-fns';
import { openPrescriptionViewer } from '../utils/prescriptionUtils';

export default function ReceptionistDashboard() {
  const [activeTab, setActiveTab] = useState<'appointments' | 'book'>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Record<string, string>>({});
  const [medicalDocs, setMedicalDocs] = useState<Record<string, {name: string, url: string}[]>>({});
  const [loading, setLoading] = useState(false);
  const [editingApp, setEditingApp] = useState<Appointment | null>(null);
  const [billingApp, setBillingApp] = useState<Appointment | null>(null);
  const [billData, setBillData] = useState({ doctorFee: 500, medicationFee: 0 });
  const today = format(new Date(), 'yyyy-MM-dd');

  const [editFormData, setEditFormData] = useState({
    date: today,
    session: 'morning' as 'morning' | 'evening',
    reason: '',
    status: 'booked' as 'booked' | 'completed' | 'cancelled'
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'male',
    date: today,
    session: 'morning' as 'morning' | 'evening',
    reason: ''
  });

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'appointments'),
        where('date', '==', today),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(q);
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(acts);

      // Load today's prescriptions
      const pQuery = query(collection(db, 'prescriptions')); 
      const pSnap = await getDocs(pQuery);
      const pMap: Record<string, string> = {};
      pSnap.docs.forEach(d => {
        const data = d.data() as Prescription;
        pMap[data.appointmentId] = data.pdfDataUri;
      });
      setPrescriptions(pMap);

      const mQuery = query(collection(db, 'medicalDocuments'));
      const mSnap = await getDocs(mQuery);
      const mMap: Record<string, {name: string, url: string}[]> = {};
      mSnap.docs.forEach(d => {
        const data = d.data();
        if(!mMap[data.patientId]) mMap[data.patientId] = [];
        mMap[data.patientId].push({ name: data.name, url: data.fileDataUri });
      });
      setMedicalDocs(mMap);

    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'appointments OR prescriptions OR medicalDocuments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'appointments') {
      loadAppointments();
    }
  }, [activeTab]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      // Determine token number
      const existingQuery = query(
        collection(db, 'appointments'),
        where('date', '==', formData.date),
        where('session', '==', formData.session)
      );
      const existingDocs = await getDocs(existingQuery);
      const nextToken = existingDocs.size + 1;

      // Create Patient Profile (Simplified)
      let patientId = `temp-${Date.now()}`;
      // Basic match by phone
      const patientQuery = query(collection(db, 'patients'), where('phone', '==', formData.phone));
      const patientDocs = await getDocs(patientQuery);
      if (!patientDocs.empty) {
        patientId = patientDocs.docs[0].id;
      } else {
        const pRef = await addDoc(collection(db, 'patients'), {
          name: formData.name,
          phone: formData.phone,
          age: parseInt(formData.age),
          gender: formData.gender,
          createdAt: Date.now()
        });
        patientId = pRef.id;
      }

      await addDoc(collection(db, 'appointments'), {
        patientId,
        patientName: formData.name,
        date: formData.date,
        session: formData.session,
        tokenNumber: nextToken,
        status: 'booked',
        consultationReason: formData.reason,
        doctorFee: 500,
        platformFee: 20,
        paymentStatus: 'pending',
        createdAt: Date.now()
      });

      alert(`Appointment booked successfully! Token Number: ${nextToken}`);
      setActiveTab('appointments');
      setFormData({ ...formData, name: '', phone: '', age: '', reason: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'patients OR appointments');
    } finally {
      setLoading(false);
    }
  };

  const switchRole = async () => {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { role: 'doctor' });
        window.location.href = '/';
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  const openEditModal = (app: Appointment) => {
    setEditingApp(app);
    setEditFormData({
      date: app.date,
      session: app.session,
      reason: app.consultationReason || '',
      status: app.status
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingApp) return;
    try {
      setLoading(true);
      let newTokenNumber = editingApp.tokenNumber;
      if (editingApp.date !== editFormData.date || editingApp.session !== editFormData.session) {
        const existingQuery = query(
          collection(db, 'appointments'),
          where('date', '==', editFormData.date),
          where('session', '==', editFormData.session)
        );
        const existingDocs = await getDocs(existingQuery);
        newTokenNumber = existingDocs.size + 1;
      }

      await updateDoc(doc(db, 'appointments', editingApp.id), {
        date: editFormData.date,
        session: editFormData.session,
        consultationReason: editFormData.reason,
        status: editFormData.status,
        tokenNumber: newTokenNumber
      });
      setEditingApp(null);
      loadAppointments();
      alert('Appointment updated successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${editingApp.id}`);
    } finally {
      setLoading(false);
    }
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingApp) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'appointments', billingApp.id), {
        doctorFee: billData.doctorFee,
        medicationFee: billData.medicationFee,
        paymentStatus: 'paid'
      });
      setBillingApp(null);
      loadAppointments();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${billingApp.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">P</div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Prescripta</h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="hidden md:flex items-center bg-slate-100 rounded-full px-4 py-1.5">
            <div className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></div>
            <span className="text-sm font-medium text-slate-700">Reception Desk</span>
          </div>
          <button onClick={switchRole} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition">
            <RefreshCw className="h-4 w-4" />
            Doctor Workspace
          </button>
          <button onClick={() => auth.signOut()} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex gap-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('appointments')}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors ${activeTab === 'appointments' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Users className="h-4 w-4" /> Live Queue
            </button>
            <button
              onClick={() => setActiveTab('book')}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors ${activeTab === 'book' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Plus className="h-4 w-4" /> New Booking
            </button>
          </div>

          {activeTab === 'appointments' && (
            <div className="space-y-6">
              {loading ? (
                <div className="p-8 text-center text-sm font-medium text-slate-500">Loading live queue...</div>
              ) : Object.entries({'Morning': 'morning', 'Evening': 'evening'}).map(([label, session]) => {
                const sessionApps = appointments.filter(a => a.session === session);
                return (
                  <div key={session} className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                      <h2 className="font-bold text-slate-800">{label} Session</h2>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{sessionApps.length} Tokens</span>
                    </div>

                    <div className="p-6">
                      {sessionApps.length === 0 ? (
                        <p className="text-sm font-medium text-slate-500 text-center py-4">No appointments for this session.</p>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {sessionApps.map(app => (
                            <div key={app.id} className={`p-4 rounded-2xl border flex flex-col space-y-3 transition ${app.status === 'completed' ? 'border-emerald-200 bg-emerald-50/20 shadow-sm' : 'border-slate-100 bg-slate-50'}`}>
                              <div className="flex items-center space-x-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl shrink-0 ${app.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                  {app.tokenNumber}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <p className="font-semibold text-slate-800 truncate">{app.patientName}</p>
                                  <p className="text-xs text-slate-500 truncate mt-0.5">Reason: {app.consultationReason || 'N/A'}</p>
                                </div>
                              </div>
                              
                              {app.status === 'completed' && app.diagnosis && (
                                <div className="bg-white border border-emerald-100/80 rounded-xl p-2.5 text-xs text-slate-700">
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-0.5">Diagnosis</span>
                                  <p className="font-semibold text-slate-800">{app.diagnosis}</p>
                                </div>
                              )}
                              
                              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/60 mt-auto">
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest ${app.status === 'completed' ? 'text-emerald-600' : app.status === 'cancelled' ? 'text-red-600' : 'text-slate-500'}`}>
                                    {app.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5"/> : app.status === 'cancelled' ? <XCircle className="h-3.5 w-3.5"/> : <Clock className="h-3.5 w-3.5"/>}
                                    {app.status}
                                  </span>
                                  
                                  {app.status === 'booked' && (
                                    <button onClick={() => openEditModal(app)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 transition">
                                      <Pencil className="h-3.5 w-3.5" /> Edit
                                    </button>
                                  )}
                                </div>
                                
                                {app.status === 'completed' && (
                                  <div className="flex flex-wrap gap-1.5 items-center justify-end mt-1">
                                    {(medicalDocs[app.patientId] && medicalDocs[app.patientId].length > 0) && (
                                      <button 
                                        onClick={() => {
                                          medicalDocs[app.patientId].forEach(doc => {
                                            const w = window.open('about:blank', '_blank');
                                            if (w) w.document.write(`<iframe src="${doc.url}" style="width:100%; height:100vh; border:none;" title="${doc.name}"></iframe>`);
                                          });
                                        }}
                                        className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                                        title="View Attached Documents"
                                      >
                                        <FileText className="h-3.5 w-3.5 text-slate-500" /> Docs
                                      </button>
                                    )}
                                    {prescriptions[app.id] && (
                                      <>
                                        <button 
                                          onClick={() => openPrescriptionViewer(prescriptions[app.id], app.patientName)}
                                          className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                                          title="View Prescription PDF"
                                        >
                                          <FileText className="h-3.5 w-3.5 text-slate-500" /> PDF
                                        </button>
                                        <button 
                                          onClick={() => openPrescriptionViewer(prescriptions[app.id], app.patientName)}
                                          className="flex items-center gap-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 text-xs font-semibold hover:bg-indigo-100 hover:text-indigo-950 transition"
                                          title="Print Prescription"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                          </svg>
                                          Print
                                        </button>
                                      </>
                                    )}
                                    {app.paymentStatus === 'pending' ? (
                                      <button
                                        onClick={() => {
                                          setBillingApp(app);
                                          setBillData({ doctorFee: app.doctorFee, medicationFee: app.medicationFee || 0 });
                                        }}
                                        className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-sm ml-1"
                                      >
                                        <DollarSign className="h-3.5 w-3.5" />
                                        Bill
                                      </button>
                                    ) : (
                                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1.5 rounded-lg tracking-wider uppercase ml-1">PAID</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'book' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm max-w-2xl">
              <h2 className="mb-6 text-xl font-bold text-slate-800">Schedule New Appointment</h2>
              <form onSubmit={handleBook} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Patient Name</label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Phone</label>
                    <input required type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Age</label>
                    <input required type="number" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Gender</label>
                    <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition">
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Date</label>
                    <input required type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Session</label>
                    <select value={formData.session} onChange={e => setFormData({...formData, session: e.target.value as any})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition">
                      <option value="morning">Morning</option>
                      <option value="evening">Evening</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Consultation Reason</label>
                  <textarea required rows={2} value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition" />
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
                  <div className="flex justify-between items-center text-sm font-medium text-slate-600 mb-2">
                    <span>Doctor Fee</span>
                    <span className="text-slate-800">₹500</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-medium text-slate-600 mb-4">
                    <span>Platform Fee</span>
                    <span className="text-slate-800">₹20</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-blue-200/60 pt-3">
                    <span className="text-xs font-black tracking-widest text-slate-500 uppercase">Total Payable</span>
                    <span className="text-xl font-bold text-blue-700">₹520</span>
                  </div>
                </div>

                <button disabled={loading} type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-3.5 font-bold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 disabled:opacity-50">
                  {loading ? 'Processing...' : 'Confirm Appointment'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Billing Modal */}
      {billingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Process Payment</h3>
              <button onClick={() => setBillingApp(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 bg-slate-50 flex-1 overflow-y-auto">
              <form id="billingForm" onSubmit={submitPayment} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Consultant Fee (₹)</label>
                  <input type="number" required value={billData.doctorFee} onChange={e => setBillData({...billData, doctorFee: parseInt(e.target.value) || 0})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Platform Fee (₹)</label>
                  <input type="number" disabled value={20} className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-500 cursor-not-allowed outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Medication Fee (₹)</label>
                  <input type="number" required value={billData.medicationFee} onChange={e => setBillData({...billData, medicationFee: parseInt(e.target.value) || 0})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                    <span>Total Payable:</span>
                    <span className="text-2xl text-blue-700">₹{(billData.doctorFee) + 20 + (billData.medicationFee)}</span>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
              <button type="button" onClick={() => setBillingApp(null)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition text-sm">Cancel</button>
              <button type="submit" form="billingForm" disabled={loading} className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition text-sm shadow-sm disabled:opacity-50">Mark as Paid</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-lg">Edit Appointment</h3>
              <button onClick={() => setEditingApp(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 bg-slate-50/50 flex-1 overflow-y-auto">
              <form id="editAppForm" onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Status</label>
                  <select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value as any})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="booked">Booked</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Date</label>
                    <input type="date" required value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Session</label>
                    <select value={editFormData.session} onChange={e => setEditFormData({...editFormData, session: e.target.value as any})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="morning">Morning</option>
                      <option value="evening">Evening</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Reason</label>
                  <textarea rows={2} required value={editFormData.reason} onChange={e => setEditFormData({...editFormData, reason: e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </form>
            </div>
            <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
              <button type="button" onClick={() => setEditingApp(null)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition text-sm">Cancel</button>
              <button type="submit" form="editAppForm" disabled={loading} className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition text-sm shadow-sm disabled:opacity-50">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0">
        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          System Status: <span className="text-emerald-500">Secure & Connected</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-[10px] text-slate-400 font-bold">VERSION 1.0.0</span>
        </div>
      </footer>
    </div>
  );
}
