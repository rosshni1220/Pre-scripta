import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, addDoc, orderBy } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Appointment, Prescription } from '../types';
import { LogOut, Calendar, Stethoscope, CheckCircle, Clock, FileText, Upload, PenTool, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import SignatureCanvas from 'react-signature-canvas';
import { jsPDF } from 'jspdf';
import { openPrescriptionViewer } from '../utils/prescriptionUtils';

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [consultingApp, setConsultingApp] = useState<Appointment | null>(null);
  const [prescriptionMode, setPrescriptionMode] = useState<'draw' | 'text'>('draw');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [penColor, setPenColor] = useState('#0f172a');
  const [penWidth, setPenWidth] = useState<'normal' | 'thick'>('normal');
  const sigPad = useRef<SignatureCanvas>(null);
  
  const today = format(new Date(), 'yyyy-MM-dd');

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

      // Load prescriptions mapping
      const pQuery = query(collection(db, 'prescriptions'));
      const pSnap = await getDocs(pQuery);
      const pMap: Record<string, string> = {};
      pSnap.docs.forEach(d => {
        const data = d.data() as Prescription;
        pMap[data.appointmentId] = data.pdfDataUri;
      });
      setPrescriptions(pMap);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'appointments or prescriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!consultingApp) {
      loadAppointments();
    } else {
      setDiagnosis(consultingApp.diagnosis || '');
      setPrescriptionText('');
    }
  }, [consultingApp]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !consultingApp) return;
    const file = e.target.files[0];
    
    // File limits
    if (file.size > 500 * 1024) {
      alert("File is too large. Please upload an image under 500KB for this demo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target?.result && typeof ev.target.result === 'string') {
        try {
          await addDoc(collection(db, 'medicalDocuments'), {
            patientId: consultingApp.patientId,
            name: file.name,
            fileDataUri: ev.target.result,
            createdAt: Date.now()
          });
          alert('Document uploaded successfully.');
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'medicalDocuments');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteConsultation = async () => {
    if (!consultingApp) return;
    try {
      setLoading(true);
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setFontSize(20);
      pdf.text(`Prescription: ${consultingApp.patientName}`, 10, 20);
      pdf.setFontSize(12);
      pdf.text(`Date: ${today} | Token: ${consultingApp.tokenNumber}`, 10, 30);
      pdf.text(`Reason: ${consultingApp.consultationReason}`, 10, 40);
      
      let startY = 50;
      if (diagnosis.trim()) {
        pdf.text(`Diagnosis: ${diagnosis.trim()}`, 10, 50);
        startY = 60;
      }
      
      if (prescriptionMode === 'draw') {
        if (sigPad.current && !sigPad.current.isEmpty()) {
          const originalCanvas = sigPad.current.getCanvas();
          const tempCanvas = document.createElement('canvas');
          let scale = 1;
          if (originalCanvas.width > 800) scale = 800 / originalCanvas.width;
          tempCanvas.width = originalCanvas.width * scale;
          tempCanvas.height = originalCanvas.height * scale;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(originalCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
          }
          const sigData = tempCanvas.toDataURL('image/jpeg', 0.4);
          const props = pdf.getImageProperties(sigData);
          const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
          const pdfHeight = (props.height * pdfWidth) / props.width;
          pdf.addImage(sigData, 'JPEG', 10, startY, pdfWidth, pdfHeight, undefined, 'FAST');
        } else {
          pdf.text("(No handwritten notes)", 10, startY);
        }
      } else {
        if (prescriptionText.trim()) {
          const splitText = pdf.splitTextToSize(prescriptionText, pdf.internal.pageSize.getWidth() - 20);
          pdf.text(splitText, 10, startY);
        } else {
          pdf.text("(No text notes)", 10, startY);
        }
      }

      const pdfDataUri = pdf.output('datauristring');

      await addDoc(collection(db, 'prescriptions'), {
        appointmentId: consultingApp.id,
        patientId: consultingApp.patientId,
        pdfDataUri: pdfDataUri,
        createdAt: Date.now()
      });

      await updateDoc(doc(db, 'appointments', consultingApp.id), {
        status: 'completed',
        diagnosis: diagnosis.trim()
      });

      setConsultingApp(null);
      alert('Consultation completed and prescription saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'prescriptions or appointments');
    } finally {
      setLoading(false);
    }
  };

  const activeTokens = appointments.filter(a => a.status !== 'completed');

  const switchRole = async () => {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { role: 'receptionist' });
        window.location.href = '/';
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
      }
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
            <span className="text-sm font-medium text-slate-700">Doctor Workspace</span>
          </div>
          <button onClick={switchRole} className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition">
            <RefreshCw className="h-4 w-4" />
            Reception Desk
          </button>
          <button onClick={() => auth.signOut()} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      {consultingApp ? (
        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: Token Queue snippet */}
          <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 hidden lg:flex">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-slate-800">Live Queue</h2>
              <span className="text-[10px] uppercase font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{activeTokens.length} Pending</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="p-4 rounded-2xl border-2 border-blue-500 bg-blue-50 flex items-center space-x-4 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xl">{consultingApp.tokenNumber}</div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">In Consultation</p>
                  <p className="font-bold text-slate-900 truncate">{consultingApp.patientName}</p>
                </div>
              </div>
              
              {activeTokens.filter(a => a.id !== consultingApp.id).map(app => (
                <div key={app.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 flex items-center space-x-4 opacity-75 transition hover:opacity-100 hover:border-slate-200">
                  <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xl">{app.tokenNumber}</div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-semibold text-slate-700 truncate">{app.patientName}</p>
                    <p className="text-xs text-slate-400 max-w-[150px] truncate">{app.consultationReason || 'Waiting'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Active Consultation Workspace */}
          <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
            <div className="p-6 flex flex-col h-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-[12px] font-bold text-slate-800">Consultation: Token #{consultingApp.tokenNumber}</h2>
                  <p className="text-[20px] text-slate-500 mt-1">{consultingApp.patientName} • {consultingApp.consultationReason || 'No specific reason'}</p>
                </div>
                <div className="flex-1 max-w-sm">
                  <div className="relative">
                    <input
                      type="text"
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Diagnosis (Tamil/English)..."
                      className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:bg-slate-50/20 text-slate-800 rounded-xl px-4 py-2.5 text-[18px] font-semibold shadow-sm transition-all duration-200 outline-none"
                    />
                  </div>
                </div>
                <div className="flex space-x-3 items-center">
                  <label className="cursor-pointer px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Reports
                    <input type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
                  </label>
                  <button onClick={() => setConsultingApp(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                    Close
                  </button>
                  <button disabled={loading} onClick={handleCompleteConsultation} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2">
                    {loading ? 'Saving...' : 'Finish & Save PDF'}
                  </button>
                </div>
              </div>

              {/* Prescription Pad */}
              <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden min-h-[400px]">
                {/* Grid Pattern Background */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                
                <div className="p-5 flex items-center justify-between border-b border-slate-100 z-10 bg-white/80 backdrop-blur-sm">
                  <div className="flex items-center space-x-4">
                    <span className="text-base font-bold text-slate-400 uppercase">Rx</span>
                    <div className="flex bg-slate-100 rounded-lg p-1">
                      <button 
                        onClick={() => setPrescriptionMode('draw')}
                        className={`px-3 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1.5 transition ${prescriptionMode === 'draw' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        <PenTool className="w-3 h-3" /> Draw
                      </button>
                      <button 
                        onClick={() => setPrescriptionMode('text')}
                        className={`px-3 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1.5 transition ${prescriptionMode === 'text' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        <FileText className="w-3 h-3" /> Text
                      </button>
                    </div>
                    {prescriptionMode === 'draw' && (
                      <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-slate-200">
                        <div className="flex space-x-1">
                          <button onClick={() => setPenColor('#0f172a')} className={`w-5 h-5 rounded-full bg-slate-900 border border-slate-300 transition-all ${penColor === '#0f172a' ? 'scale-110 ring-2 ring-blue-400 ring-offset-1' : 'opacity-70 hover:opacity-100'}`} title="Black"></button>
                          <button onClick={() => setPenColor('#2563eb')} className={`w-5 h-5 rounded-full bg-blue-600 border border-slate-300 transition-all ${penColor === '#2563eb' ? 'scale-110 ring-2 ring-blue-400 ring-offset-1' : 'opacity-70 hover:opacity-100'}`} title="Blue"></button>
                          <button onClick={() => setPenColor('#dc2626')} className={`w-5 h-5 rounded-full bg-red-600 border border-slate-300 transition-all ${penColor === '#dc2626' ? 'scale-110 ring-2 ring-blue-400 ring-offset-1' : 'opacity-70 hover:opacity-100'}`} title="Red"></button>
                        </div>
                        <div className="flex items-center bg-slate-100 rounded-md p-0.5">
                          <button onClick={() => setPenWidth('normal')} className={`px-2 py-1 text-[10px] font-bold rounded ${penWidth === 'normal' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Thin</button>
                          <button onClick={() => setPenWidth('thick')} className={`px-2 py-1 text-[10px] font-bold rounded ${penWidth === 'thick' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Thick</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-4">
                    {prescriptionMode === 'draw' ? (
                      <button onClick={() => sigPad.current?.clear()} className="text-xs font-semibold text-red-500 hover:text-red-700 uppercase tracking-widest transition">Clear Pad</button>
                    ) : (
                      <button onClick={() => setPrescriptionText('')} className="text-xs font-semibold text-red-500 hover:text-red-700 uppercase tracking-widest transition">Clear Text</button>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 relative z-10 cursor-text">
                  {prescriptionMode === 'draw' ? (
                    <div className="w-full h-full cursor-crosshair">
                      <SignatureCanvas 
                        ref={sigPad} 
                        penColor={penColor}
                        minWidth={penWidth === 'normal' ? 1.0 : 2.5}
                        maxWidth={penWidth === 'normal' ? 2.5 : 5.0}
                        canvasProps={{ className: 'w-full h-full' }} 
                        backgroundColor="transparent"
                      />
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-50 z-[-1]">
                        <span className="text-slate-300 font-serif italic text-2xl filter drop-shadow-sm">Start writing prescription here...</span>
                      </div>
                    </div>
                  ) : (
                    <textarea 
                      value={prescriptionText}
                      onChange={(e) => setPrescriptionText(e.target.value)}
                      placeholder="Type prescription here (Supports Tamil, English, etc.)..."
                      className="w-full h-full p-6 resize-none outline-none bg-transparent text-slate-700 font-medium leading-relaxed"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-800">
              <Calendar className="h-6 w-6 text-blue-600" /> Today's Schedule
            </h2>

            <div className="space-y-6">
              {loading ? (
                <div className="p-8 text-center text-sm font-medium text-slate-500">Loading appointments...</div>
              ) : Object.entries({'Morning': 'morning', 'Evening': 'evening'}).map(([label, session]) => {
                const sessionApps = appointments.filter(a => a.session === session);
                return (
                  <div key={session} className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                      <h3 className="font-bold text-slate-800">{label} Session</h3>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{sessionApps.length} Tokens</span>
                    </div>
                    
                    <div className="p-6">
                      {sessionApps.length === 0 ? (
                        <p className="text-sm font-medium text-slate-500 text-center py-4">No appointments for this session.</p>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {sessionApps.map(app => (
                            <div key={app.id} className={`relative flex flex-col p-5 rounded-2xl border transition ${app.status === 'completed' ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-blue-100 bg-white hover:shadow-md hover:border-blue-200'}`}>
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl mb-4 ${app.status === 'completed' ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>
                                {app.tokenNumber}
                              </div>
                              <span className={`font-bold text-lg ${app.status === 'completed' ? 'text-slate-600' : 'text-slate-900'}`}>{app.patientName}</span>
                              <span className="mt-1 text-sm text-slate-500 line-clamp-2">Reason: {app.consultationReason || 'N/A'}</span>
                              
                              <div className="mt-6 pt-4 border-t flex items-center justify-between border-slate-100 mt-auto bg-white/50 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                                <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest ${app.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {app.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5"/> : <Clock className="h-3.5 w-3.5"/>}
                                  {app.status}
                                </span>

                                {app.status === 'booked' && (
                                  <button
                                    onClick={() => setConsultingApp(app)}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-sm"
                                  >
                                    Start Consult
                                  </button>
                                )}

                                {app.status === 'completed' && prescriptions[app.id] && (
                                  <div className="flex gap-1.5 items-center">
                                    <button 
                                      onClick={() => openPrescriptionViewer(prescriptions[app.id], app.patientName)}
                                      className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                                      title="View Prescription PDF"
                                    >
                                      <FileText className="h-3.5 w-3.5 text-slate-500" /> PDF
                                    </button>
                                    <button 
                                      onClick={() => openPrescriptionViewer(prescriptions[app.id], app.patientName)}
                                      className="flex items-center gap-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1.5 text-xs font-semibold hover:bg-indigo-100 hover:text-indigo-950 transition"
                                      title="Print Prescription"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                      </svg>
                                      Print
                                    </button>
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
          </div>
        </main>
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
