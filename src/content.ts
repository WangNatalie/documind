// Content script to detect PDF files
// Runs on all pages to check if they are PDFs

(function() {
  const isPDF = () => {
    const contentType = document.contentType;
    return contentType === 'application/pdf' || 
           window.location.pathname.toLowerCase().endsWith('.pdf');
  };

  if (isPDF()) {
    console.log('PDF detected in content script');
    chrome.runtime.sendMessage({
      type: 'PDF_DETECTED',
      url: window.location.href
    });
  }
})();
