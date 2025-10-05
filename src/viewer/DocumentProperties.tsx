import React from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  propsData: any;
}

const formatBytes = (b: number | null | undefined) => {
  if (b == null) return 'Unknown';
  if (b === 0) return '0 bytes';
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

const DocumentProperties: React.FC<Props> = ({ open, onClose, propsData }) => {
  if (!open) return null;

  const d = propsData || {};

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 rounded-lg shadow-2xl p-6 z-50 max-w-2xl w-full mx-4">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-bold">Document properties</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold">Filename</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.fileName || 'Unknown'}</div>
          </div>

          <div>
            <div className="font-semibold">File size</div>
            <div className="text-neutral-600 dark:text-neutral-300">{formatBytes(d.fileSize)}</div>
          </div>

          <div>
            <div className="font-semibold">Title</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.title || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Author</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.author || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Subject</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.subject || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Keywords</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.keywords || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Created</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.creationDate || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Modified</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.modDate || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Application</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.creator || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">PDF producer</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.producer || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">PDF version</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.pdfVersion || '-'}</div>
          </div>

          <div>
            <div className="font-semibold">Page count</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.pageCount ?? '-'}</div>
          </div>

          <div className="col-span-2">
            <div className="font-semibold">Page sizes</div>
            <div className="text-neutral-600 dark:text-neutral-300 max-h-40 overflow-auto mt-1 border border-neutral-100 dark:border-neutral-700 p-2 rounded">
              {d.pageSizes && d.pageSizes.length > 0 ? (
                <ul className="text-xs list-inside">
                  {d.pageSizes.map((p: any) => (
                    <li key={p.page}>Page {p.page}: {p.width} × {p.height} pts</li>
                  ))}
                </ul>
              ) : (
                <div>-</div>
              )}
            </div>
          </div>

          <div>
            <div className="font-semibold">Fast Web View</div>
            <div className="text-neutral-600 dark:text-neutral-300">{d.fastWebView ? 'Yes' : 'No'}</div>
          </div>

        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded bg-neutral-100 dark:bg-neutral-700 text-sm">Close</button>
        </div>
      </div>
    </div>
  );
};

export default DocumentProperties;
