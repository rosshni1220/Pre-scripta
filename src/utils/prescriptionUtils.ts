/**
 * Utility helper to convert Base64 PDF Data URIs into Blob URLs
 * and open a highly interactive, beautifully styled, same-origin
 * printable viewer window that bypasses standard browser iframe printing blocks.
 */
export const openPrescriptionViewer = (pdfDataUri: string, patientName: string) => {
  try {
    // 1. Convert Base64 dataURI to Blob URL to ensure exact same-origin properties
    const parts = pdfDataUri.split(',');
    const byteString = atob(parts[1]);
    const mimeString = parts[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });
    const blobUrl = URL.createObjectURL(blob);

    // 2. Open a clean blank page
    const w = window.open('about:blank', '_blank');
    if (!w) {
      alert("Popup blocker active! Please allow popups for this dashboard to view or print the prescription.");
      return;
    }

    // 3. Write dynamic, responsive, beautifully styled HTML loaded with Tailwind CDN
    w.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <title>Prescription Viewer - ${patientName}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', -apple-system, sans-serif;
            }
            @media print {
              .no-print {
                display: none !important;
              }
              body {
                background: #ffffff !important;
              }
              .print-container {
                height: 100vh !important;
                width: 100vw !important;
                padding: 0 !important;
                margin: 0 !important;
              }
            }
          </style>
        </head>
        <body class="bg-slate-100 flex flex-col h-screen overflow-hidden m-0 p-0">
          <!-- Control Header (hidden on print) -->
          <header class="no-print bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 z-50">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-extrabold shadow-sm shadow-indigo-100 ring-2 ring-indigo-50">Rx</div>
              <div>
                <h1 class="text-sm font-bold text-slate-800">Prescription Print Assistant</h1>
                <p class="text-xs text-slate-500 font-medium">${patientName}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="printBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-xl text-sm transition duration-150 shadow-md shadow-indigo-100 hover:shadow-indigo-200 flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Prescription
              </button>
              <button id="closeBtn" class="bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 font-semibold py-2 px-4 rounded-xl text-sm transition duration-150">
                Close Window
              </button>
            </div>
          </header>

          <!-- Printable area containing the iframe -->
          <main class="print-container flex-1 bg-slate-50 relative h-full w-full">
            <iframe id="pdfFrame" src="${blobUrl}" class="w-full h-full border-none" title="PDF Document"></iframe>
          </main>

          <script>
            // Attempt to trigger the native printing dialog automatically once loaded
            window.addEventListener('load', function() {
              setTimeout(function() {
                try {
                  var frame = document.getElementById('pdfFrame');
                  if (frame && frame.contentWindow) {
                    frame.contentWindow.focus();
                    frame.contentWindow.print();
                  }
                } catch(e) {
                  console.warn("Same-origin auto-print on loaded frame blocked, waiting for print button click.", e);
                }
              }, 800);
            });

            document.getElementById('printBtn').addEventListener('click', function() {
              var frame = document.getElementById('pdfFrame');
              if (frame) {
                try {
                  frame.contentWindow.focus();
                  frame.contentWindow.print();
                } catch (e) {
                  window.print();
                }
              }
            });

            document.getElementById('closeBtn').addEventListener('click', function() {
              window.close();
            });
          </script>
        </body>
      </html>
    `);
    w.document.close();
  } catch (e) {
    console.error("Failed to generate same-origin printable PDF view:", e);
    // Standard dataURI fallback
    const fallbackWindow = window.open(pdfDataUri, '_blank');
    if (!fallbackWindow) {
      alert("Popup blocker active! Please allow popups for this portal.");
    }
  }
};
