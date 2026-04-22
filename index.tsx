import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmModal';
import { PdfStartPageProvider } from './components/PdfStartPageModal';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <PdfStartPageProvider>
          <App />
        </PdfStartPageProvider>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>
);