import React, { useState } from 'react';

interface Props {
  open: boolean;
  initialName: string;
  blob: Blob | null;
  onClose: () => void;
  onSave: (fileName: string) => Promise<void>;
}

const SaveAsModal: React.FC<Props> = ({ open, initialName, blob, onClose, onSave }) => {
  const [name, setName] = useState(initialName || 'document-annotated.pdf');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-lg shadow-2xl p-6 z-50 max-w-lg w-full mx-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Save as</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">✕</button>
        </div>

        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">Your browser does not support the native file-save dialog. Choose a filename below and click Save. The file will be downloaded to your browser's default download folder. To choose a folder, use a Chromium browser with the "Ask where to save each file" setting enabled or a browser that supports the File System Access API.</p>

        <div className="mt-4">
          <label className="text-sm font-medium">Filename</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-2 px-3 py-2 border rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-neutral-100 dark:bg-neutral-700">Cancel</button>
          <button
            onClick={async () => {
              if (!blob) return;
              setSaving(true);
              try {
                await onSave(name);
              } catch (err) {
                console.error('Fallback save failed', err);
              }
              setSaving(false);
            }}
            disabled={saving}
            className="px-3 py-2 rounded bg-primary-600 text-white"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveAsModal;
