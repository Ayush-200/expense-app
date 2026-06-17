import React, { useState, useRef, useMemo } from 'react';
import {
  importService,
  ImportReport,
  Anomaly,
  ResolutionMap,
  CSVRow,
} from '../services/import.service';

interface ImportExpensesModalProps {
  groupId: string;
  groupMembers: Array<{ id: string; name: string; email: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'review' | 'confirming' | 'result';

const SEVERITY_COLORS: Record<string, string> = {
  ERROR: 'text-red-400 bg-red-900/20 border-red-800',
  WARNING: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  INFO: 'text-blue-400 bg-blue-900/20 border-blue-800',
};

const ANOMALY_LABELS: Record<string, string> = {
  DUPLICATE_EXPENSE: 'Duplicate Expense',
  INCONSISTENT_NAME: 'Inconsistent Name',
  MISSING_PAYER: 'Missing Payer',
  SETTLEMENT_AS_EXPENSE: 'Settlement Detected',
  MISSING_CURRENCY: 'Missing Currency',
  CURRENCY_CONVERSION: 'Currency Conversion',
  NEGATIVE_AMOUNT: 'Negative Amount (Refund)',
  INVALID_DATE: 'Invalid Date',
  AMBIGUOUS_DATE: 'Ambiguous Date',
  SPLIT_INCONSISTENCY: 'Split Inconsistency',
  INVALID_MEMBER_FOR_DATE: 'Invalid Member for Date',
  GUEST_PARTICIPANT: 'Guest Participant',
  PAYER_NOT_MEMBER: 'Payer Not in Group',
  PERCENTAGE_MISMATCH: 'Percentage Mismatch',
};

export function ImportExpensesModal({
  groupId,
  groupMembers,
  onClose,
  onSuccess,
}: ImportExpensesModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [resolutions, setResolutions] = useState<ResolutionMap>({});
  const [resultMessage, setResultMessage] = useState('');
  const [exchangeRate, setExchangeRate] = useState('83');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rowsRequiringAction = useMemo(() => {
    if (!report) return [];
    return report.details.filter(
      (d) => d.anomalies.some((a) => !a.canAutoFix)
    );
  }, [report]);

  const groupedAnomalies = useMemo(() => {
    if (!report) return {};
    const grouped: Record<string, Anomaly[]> = {};
    for (const detail of report.details) {
      for (const anomaly of detail.anomalies) {
        if (!grouped[anomaly.anomalyType]) grouped[anomaly.anomalyType] = [];
        grouped[anomaly.anomalyType].push(anomaly);
      }
    }
    return grouped;
  }, [report]);

  const hasUnresolvedErrors = useMemo(() => {
    if (!report) return false;
    return report.details.some(
      (d) =>
        d.anomalies.some((a) => a.severity === 'ERROR' && !a.canAutoFix) &&
        !resolutions[d.rowNumber]
    );
  }, [report, resolutions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (!f.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setFile(f);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }
    setError('');
    setUploading(true);

    try {
      const rate = parseFloat(exchangeRate) || undefined;
      const result = await importService.uploadAndValidate(groupId, file, rate);
      setReport(result);
      setResolutions({});

      if (result.status === 'COMPLETED') {
        setStep('result');
        setResultMessage(result.summary);
      } else if (result.status === 'REQUIRES_APPROVAL') {
        setStep('review');
      } else {
        setStep('result');
        setResultMessage(`Import failed: ${result.summary}`);
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!report) return;
    setStep('confirming');

    try {
      const result = await importService.confirmImport(report.importJobId, resolutions);
      if (result.job) {
        setReport({
          ...report,
          status: result.job.status,
          processedRows: result.job.processedRows,
          successfulRows: result.job.successfulRows,
          failedRows: result.job.failedRows,
        });
      }
      setResultMessage('Import completed successfully');
      setStep('result');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Confirmation failed';
      setError(msg);
      setStep('review');
    }
  };

  const handleClose = () => {
    if (step === 'result') onSuccess();
    onClose();
  };

  const setResolution = (
    rowNum: number,
    partial: Partial<ResolutionMap[number]>
  ) => {
    setResolutions((prev) => ({
      ...prev,
      [rowNum]: { ...(prev[rowNum] || {}), ...partial },
    }));
  };

  const renderUpload = () => (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">
        Upload a CSV file with expense data.{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            importService.downloadTemplate().then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'expense_import_template.csv';
              a.click();
              URL.revokeObjectURL(url);
            });
          }}
          className="text-primary-500 hover:text-primary-400 underline"
        >
          Download template
        </a>
      </p>

      <div className="flex items-center gap-2 bg-gray-800 rounded p-3">
        <label className="text-xs text-gray-400 whitespace-nowrap">USD Rate:</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={exchangeRate}
          onChange={(e) => setExchangeRate(e.target.value)}
          className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white text-center"
        />
        <span className="text-xs text-gray-500">1 USD =</span>
        <span className="text-xs text-white font-medium">{exchangeRate || '83'} INR</span>
      </div>

      <div
        className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
        {file ? (
          <div>
            <p className="text-white font-medium">{file.name}</p>
            <p className="text-gray-500 text-xs mt-1">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-400">Click to select a CSV file</p>
            <p className="text-gray-600 text-xs mt-1">.csv files only</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-2 text-sm bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="px-4 py-2 text-sm bg-primary-500 text-white rounded hover:bg-primary-400 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {uploading && (
            <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {uploading ? 'Validating...' : 'Upload & Validate'}
        </button>
      </div>
    </div>
  );

  const renderAnomalyBadge = (anomaly: Anomaly) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[anomaly.severity]}`}
    >
      {anomaly.severity === 'ERROR' ? '✕' : anomaly.severity === 'WARNING' ? '⚠' : 'ℹ'}
      {ANOMALY_LABELS[anomaly.anomalyType] || anomaly.anomalyType}
    </span>
  );

  const renderResolutionControl = (anomaly: Anomaly) => {
    const rowNum = anomaly.rowNumber;

    switch (anomaly.anomalyType) {
      case 'MISSING_PAYER':
        return (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">Select payer:</label>
            <select
              value={resolutions[rowNum]?.payerId || ''}
              onChange={(e) => setResolution(rowNum, { payerId: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            >
              <option value="">-- Select --</option>
              {groupMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
        );

      case 'INVALID_DATE':
        return (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">Enter valid date (YYYY-MM-DD):</label>
            <input
              type="date"
              value={resolutions[rowNum]?.date || ''}
              onChange={(e) => setResolution(rowNum, { date: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            />
          </div>
        );

      case 'AMBIGUOUS_DATE':
        return (
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">
              Interpreted as:{" "}
              <span className="text-white">
                {anomaly.suggestedValue || 'unknown'}
              </span>
            </p>
            <div className="flex gap-2">
              <label className="text-xs text-gray-400 block mb-1">Override date (YYYY-MM-DD):</label>
              <input
                type="date"
                value={resolutions[rowNum]?.date || anomaly.suggestedValue || ''}
                onChange={(e) => setResolution(rowNum, { date: e.target.value })}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
          </div>
        );

      case 'SETTLEMENT_AS_EXPENSE':
        return (
          <div className="mt-2 flex items-center gap-3">
            <label className="text-xs text-gray-400">
              <input
                type="checkbox"
                checked={resolutions[rowNum]?.isSettlement ?? false}
                onChange={(e) =>
                  setResolution(rowNum, { isSettlement: e.target.checked })
                }
                className="mr-1"
              />
              Treat as settlement
            </label>
            {resolutions[rowNum]?.isSettlement && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Payee:</label>
                <select
                  value={resolutions[rowNum]?.payeeId || ''}
                  onChange={(e) => setResolution(rowNum, { payeeId: e.target.value })}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                >
                  <option value="">-- Select --</option>
                  {groupMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );

      case 'DUPLICATE_EXPENSE':
        return (
          <div className="mt-2 flex items-center gap-3">
            <label className="text-xs text-gray-400">
              <input
                type="checkbox"
                checked={resolutions[rowNum]?.skip ?? false}
                onChange={(e) =>
                  setResolution(rowNum, { skip: e.target.checked })
                }
                className="mr-1"
              />
              Skip this duplicate
            </label>
            <label className="text-xs text-gray-400">
              <input
                type="checkbox"
                checked={resolutions[rowNum]?.confirmedDuplicate ?? false}
                onChange={(e) =>
                  setResolution(rowNum, { confirmedDuplicate: e.target.checked, skip: false })
                }
                className="mr-1"
              />
              Import anyway (confirmed not duplicate)
            </label>
          </div>
        );

      case 'INCONSISTENT_NAME':
        return (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">
              Original: <span className="text-white">{anomaly.originalValue}</span>
            </label>
            <label className="text-xs text-gray-400 block mb-1">
              Suggested: <span className="text-white">{anomaly.suggestedValue}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={resolutions[rowNum]?.payerId || ''}
                placeholder="Or type a custom name..."
                onChange={(e) => {
                  const val = e.target.value;
                  const found = groupMembers.find(
                    (m) => m.id === val || m.name.toLowerCase() === val.toLowerCase()
                  );
                  if (found) {
                    setResolution(rowNum, { payerId: found.id });
                  } else {
                    setResolution(rowNum, { payerId: val });
                  }
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
          </div>
        );

      case 'PAYER_NOT_MEMBER':
        return (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">
              Payer not found in group. Select the correct payer:
            </label>
            <select
              value={resolutions[rowNum]?.payerId || ''}
              onChange={(e) => setResolution(rowNum, { payerId: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
            >
              <option value="">-- Select --</option>
              {groupMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
        );

      case 'PERCENTAGE_MISMATCH':
        return (
          <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/40 rounded">
            <p className="text-xs text-yellow-400 mb-1">{anomaly.message}</p>
            {anomaly.suggestedValue && (
              <p className="text-xs text-gray-400">
                Suggested: <span className="text-white">{anomaly.suggestedValue}</span>
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderSplitAdjustment = (rowNum: number, rowData: CSVRow) => {
    const splitType = (rowData.splitType || 'EQUAL').toUpperCase();
    if (splitType !== 'PERCENTAGE' && splitType !== 'UNEQUAL') return null;

    const partsStr = rowData.participants || '';
    const sep = partsStr.includes(',') ? ',' : ';';
    const rawParts: string[] = partsStr.split(sep).map((p: string) => p.trim()).filter(Boolean);
    const sharesSep = (rowData.participantShares || '').includes(',') ? ',' : ';';
    const rawShares: string[] = (rowData.participantShares || '').split(sharesSep).map((s: string) => s.trim()).filter(Boolean);

    // Parse existing resolution override if any
    const resolvedShares = resolutions[rowNum]?.participantShares;
    const currentValues: number[] = rawShares.map((s: string) => {
      const num = parseFloat(s.replace(/^[A-Za-z\s]+/, '').trim());
      return isNaN(num) ? 0 : num;
    });
    if (resolvedShares) {
      const resolvedVals = resolvedShares.split(';').map((v: string) => parseFloat(v.trim())).filter((v: number) => !isNaN(v));
      if (resolvedVals.length === rawParts.length) {
        // Use resolved values if count matches
        resolvedVals.forEach((v, i) => { currentValues[i] = v; });
      }
    }

    const isPercentage = splitType === 'PERCENTAGE';
    const totalAmount = parseFloat(rowData.amount) || 0;
    const total = currentValues.reduce((s, v) => s + v, 0);

    const updateValue = (idx: number, newVal: number) => {
      const updated = [...currentValues];
      updated[idx] = newVal;
      resolutions[rowNum] = { ...(resolutions[rowNum] || {}), participantShares: updated.join(';') };
      // Force re-render by updating resolutions state
      setResolutions({ ...resolutions });
    };

    return (
      <div className="mt-3 p-3 bg-gray-850 border border-gray-700 rounded">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-300">
            {isPercentage ? 'Percentage Split' : 'Unequal Split (Exact Amounts)'}
          </span>
          <span className={`text-xs font-mono ${Math.abs(total - (isPercentage ? 100 : totalAmount)) < 0.01 ? 'text-green-400' : 'text-red-400'}`}>
            {isPercentage ? `Total: ${total.toFixed(1)}%` : `Total: ${total.toFixed(2)} / ${totalAmount.toFixed(2)}`}
          </span>
        </div>
        <div className="space-y-1.5">
          {rawParts.map((part, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-24 truncate">{part}</span>
              <input
                type="number"
                step={isPercentage ? '0.1' : '0.01'}
                min="0"
                value={currentValues[idx] || ''}
                onChange={(e) => updateValue(idx, parseFloat(e.target.value) || 0)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white w-24"
              />
              <span className="text-xs text-gray-500 w-8">{isPercentage ? '%' : '₹'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReview = () => {
    if (!report) return null;

    const anomSummary = report.anomalies;

    return (
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded p-3 text-center">
            <p className="text-2xl font-bold text-white">{report.totalRows}</p>
            <p className="text-xs text-gray-400">Total Rows</p>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <p className="text-2xl font-bold text-white">{report.processedRows}</p>
            <p className="text-xs text-gray-400">Processed</p>
          </div>
        </div>

        {(anomSummary.errors > 0 || anomSummary.warnings > 0 || anomSummary.info > 0) && (
          <div className="bg-gray-800 rounded p-3">
            <p className="text-sm font-semibold text-white mb-2">Anomalies Detected</p>
            <div className="flex gap-3 text-sm">
              {anomSummary.errors > 0 && (
                <span className="text-red-400">{anomSummary.errors} error(s)</span>
              )}
              {anomSummary.warnings > 0 && (
                <span className="text-yellow-400">{anomSummary.warnings} warning(s)</span>
              )}
              {anomSummary.info > 0 && (
                <span className="text-blue-400">{anomSummary.info} info</span>
              )}
            </div>
          </div>
        )}

        {Object.keys(groupedAnomalies).length > 0 && (
          <div className="bg-gray-800 rounded p-3">
            <p className="text-sm font-semibold text-white mb-2">By Type</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Object.entries(groupedAnomalies)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([type, items]) => (
                  <div key={type} className="flex justify-between text-xs">
                    <span className="text-gray-300">
                      {ANOMALY_LABELS[type] || type}
                    </span>
                    <span className="text-gray-400">{items.length}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-300 bg-gray-800/50 rounded p-2">
          {report.summary}
        </div>

        {rowsRequiringAction.map((detail) => (
          <div
            key={detail.rowNumber}
            className="bg-gray-800 rounded p-3 border border-gray-700"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-gray-500 font-mono">
                Row {detail.rowNumber}
              </span>
              <span className="text-xs text-gray-500">
                {detail.rowData.description || '(no description)'} · ₹
                {detail.rowData.amount}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {detail.anomalies.map((a, i) => (
                <div key={i} className="relative group">
                  {renderAnomalyBadge(a)}
                  <div className="absolute z-10 hidden group-hover:block bg-gray-700 text-white text-xs rounded p-2 w-64 mt-1 shadow-lg">
                    {a.message}
                    {a.originalValue && (
                      <p className="text-gray-400 mt-1">
                        Original: <span className="text-white">{a.originalValue}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {detail.anomalies
              .filter((a) => !a.canAutoFix)
              .map((a, i) => (
                <div key={i} className="mt-1">
                  {renderResolutionControl(a)}
                </div>
              ))}

            {renderSplitAdjustment(detail.rowNumber, detail.rowData)}
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-gray-900 py-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasUnresolvedErrors}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasUnresolvedErrors ? 'Resolve errors to continue' : 'Confirm Import'}
          </button>
        </div>
      </div>
    );
  };

  const renderResult = () => {
    if (!report) {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-red-900/30 text-red-400 border border-red-800">
            {resultMessage || 'Import failed'}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    const { status, successfulRows, failedRows, processedRows } = report;
    const isSuccess = status === 'COMPLETED';

    return (
      <div className="space-y-4">
        <div
          className={`p-4 rounded-lg border ${
            isSuccess
              ? 'bg-green-900/30 text-green-400 border-green-800'
              : 'bg-red-900/30 text-red-400 border-red-800'
          }`}
        >
          <p className="font-semibold text-lg">
            {isSuccess ? 'Import Completed' : 'Import Failed'}
          </p>
          <p className="text-sm mt-1">{resultMessage || report.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded p-3 text-center">
            <p className="text-xl font-bold text-white">{processedRows}</p>
            <p className="text-xs text-gray-400">Processed</p>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <p className="text-xl font-bold text-green-400">{successfulRows}</p>
            <p className="text-xs text-gray-400">Successful</p>
          </div>
          <div className="bg-gray-800 rounded p-3 text-center">
            <p className="text-xl font-bold text-red-400">{failedRows}</p>
            <p className="text-xs text-gray-400">Failed</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm bg-gray-800 text-gray-200 rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 p-5 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-white text-lg font-semibold">Import Expenses</h3>
            <p className="text-gray-500 text-xs">
              {step === 'upload' && 'Select a CSV file to import'}
              {step === 'review' && 'Review detected anomalies before importing'}
              {step === 'confirming' && 'Confirming import...'}
              {step === 'result' && 'Import result'}
            </p>
          </div>
          {step !== 'confirming' && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-xl leading-none"
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2 rounded text-sm bg-red-900/30 text-red-400 border border-red-800">
            {error}
          </div>
        )}

        {step === 'upload' && renderUpload()}
        {step === 'review' && renderReview()}
        {step === 'confirming' && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
            <span className="text-gray-400 ml-3">Importing expenses...</span>
          </div>
        )}
        {step === 'result' && renderResult()}
      </div>
    </div>
  );
}
