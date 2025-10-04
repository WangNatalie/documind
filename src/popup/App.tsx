import React, { useState, useRef } from 'react';
import { nanoid } from 'nanoid';
import { writeOPFSFile, requestPersistentStorage } from '../db/opfs';
import { putDoc } from '../db';
import { generateDocHash } from '../utils/hash';

export const PopupApp: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.type === 'application/pdf');

    if (!pdfFile) {
      setError('Please drop a PDF file');
      return;
    }

    await processFile(pdfFile);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const pdfFile = files[0];
    if (pdfFile.type !== 'application/pdf') {
      setError('Please select a PDF file');
      return;
    }

    await processFile(pdfFile);
  };

  const processFile = async (file: File) => {
    try {
      setIsUploading(true);
      setError(null);

      // Request persistent storage on first use
      await requestPersistentStorage();

      // Generate upload ID
      const uploadId = nanoid();

      // Read file
      const arrayBuffer = await file.arrayBuffer();

      // Write to OPFS
      await writeOPFSFile(uploadId, arrayBuffer);

      // Generate doc hash
      const source = { type: 'uploadId' as const, value: uploadId };
      const firstBytes = arrayBuffer.slice(0, 64 * 1024);
      const lastBytes = arrayBuffer.slice(-64 * 1024);
      const docHash = await generateDocHash(source, {
        size: arrayBuffer.byteLength,
        firstBytes,
        lastBytes,
      });

      // Create doc record (page count will be filled by viewer)
      await putDoc({
        docHash,
        source,
        name: file.name,
        pageCount: 0, // Will be updated by viewer
        lastPage: 1,
        lastZoom: 'fitWidth',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Open viewer in new tab
      const viewerUrl = chrome.runtime.getURL(
        `viewer.html?uploadId=${uploadId}&name=${encodeURIComponent(file.name)}`
      );
      chrome.tabs.create({ url: viewerUrl });

      // Close popup
      window.close();
    } catch (err: any) {
      console.error('Failed to process file:', err);
      setError(err.message || 'Failed to upload file');
      setIsUploading(false);
    }
  };

  return (
    <div className="w-96 p-6 bg-white dark:bg-neutral-900">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">
          DocuMind PDF Viewer
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Drop a PDF file to open in the viewer
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-neutral-300 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-600'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="hidden"
        />

        {isUploading ? (
          <div>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <p className="text-neutral-600 dark:text-neutral-400">Uploading...</p>
          </div>
        ) : (
          <div>
            <svg
              className="mx-auto h-12 w-12 text-neutral-400 dark:text-neutral-600 mb-3"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-neutral-700 dark:text-neutral-300 font-medium mb-1">
              Drop PDF file here
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              or click to browse
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          PDFs opened from the web are automatically handled by this extension.
        </p>
      </div>
    </div>
  );
};
