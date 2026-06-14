import { useState } from 'react';
import { importService, ImportResult } from '../services/import.service';
import { Button } from './Button';

interface ImportExpensesModalProps {
  groupId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportExpensesModal({
  groupId,
  onClose,
  onSuccess,
}: ImportExpensesModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await importService.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expense_import_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError('Failed to download template');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsUploading(true);
    setError('');
    setResult(null);

    try {
      const res = await importService.importExpenses(groupId, file);
      setResult(res);
      if (res.summary.created > 0) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-5 py-4 flex justify-between items-center">
          <h3 className="text-white font-semibold">Import Expenses from CSV</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Instructions */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h4 className="text-white font-medium mb-2">How to import:</h4>
            <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
              <li>Download the CSV template below</li>
              <li>Fill in your expense data following the format</li>
              <li>Upload the completed CSV file</li>
              <li>Review the results and fix any errors</li>
            </ol>
          </div>

          {/* Download Template */}
          <div>
            <button
              onClick={handleDownloadTemplate}
              className="text-primary-400 hover:text-primary-300 text-sm underline"
            >
              📥 Download CSV Template
            </button>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Select CSV File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:border-primary-500 focus:outline-none"
            />
            {file && (
              <p className="text-sm text-gray-500 mt-1">
                Selected: {file.name} ({Math.round(file.size / 1024)}KB)
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg text-sm bg-red-900/30 text-red-400 border border-red-800">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className={`p-4 rounded-lg border ${
                result.summary.failed === 0
                  ? 'bg-green-900/20 border-green-800'
                  : 'bg-yellow-900/20 border-yellow-800'
              }`}
            >
              <h4 className="text-white font-medium mb-2">Import Results</h4>
              <div className="text-sm space-y-1">
                <p className="text-gray-300">
                  ✅ Created: {result.summary.created} / {result.summary.total} expenses
                </p>
                {result.summary.failed > 0 && (
                  <p className="text-yellow-400">❌ Failed: {result.summary.failed}</p>
                )}
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="mt-3 bg-gray-800 rounded p-3 max-h-40 overflow-y-auto">
                  <p className="text-red-400 text-xs font-semibold mb-1">Errors:</p>
                  <ul className="text-xs text-gray-400 space-y-0.5">
                    {result.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* CSV Format Guide */}
          <details className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <summary className="text-white text-sm font-medium cursor-pointer">
              CSV Format Guide
            </summary>
            <div className="mt-3 text-xs text-gray-400 space-y-2">
              <div>
                <p className="font-semibold text-gray-300">Required Columns:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>
                    <code className="bg-gray-700 px-1 rounded">date</code> - Format: YYYY-MM-DD
                  </li>
                  <li>
                    <code className="bg-gray-700 px-1 rounded">description</code> - Expense
                    description
                  </li>
                  <li>
                    <code className="bg-gray-700 px-1 rounded">amount</code> - Total amount (number)
                  </li>
                  <li>
                    <code className="bg-gray-700 px-1 rounded">paidBy</code> - Email of person who
                    paid
                  </li>
                  <li>
                    <code className="bg-gray-700 px-1 rounded">participants</code> - Comma-separated
                    emails
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-300">Optional Columns:</p>
                <ul className="list-disc list-inside ml-2">
                  <li>
                    <code className="bg-gray-700 px-1 rounded">splitType</code> - EQUAL (default),
                    PERCENTAGE, EXACT, SHARE
                  </li>
                  <li>
                    <code className="bg-gray-700 px-1 rounded">participantShares</code> - Values for
                    each participant (if not EQUAL)
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-300">Example:</p>
                <pre className="bg-gray-900 p-2 rounded text-xs overflow-x-auto">
                  2024-01-15,Lunch,1200,alice@x.com,EQUAL,"alice@x.com,bob@x.com",
                </pre>
              </div>
            </div>
          </details>

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="button" onClick={onClose} className="flex-1 bg-gray-700">
              {result?.summary.created ? 'Done' : 'Cancel'}
            </Button>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="flex-1"
            >
              {isUploading ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
