import { useState, useEffect } from 'react';
import { importService, ImportReport, GroupMember, Resolution } from '../services/import.service';
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState('');
  
  // Resolutions state: key is rowNumber
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const [selectedRowNumber, setSelectedRowNumber] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'ERRORS' | 'WARNINGS' | 'PERFECT'>('ALL');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setReport(null);
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

    setIsProcessing(true);
    setError('');

    try {
      const resReport = await importService.importExpenses(groupId, file);
      setReport(resReport);
      
      // Fetch job details to get the members list and initial resolutions
      const details = await importService.getImportJob(resReport.importJobId);
      setMembers(details.members);

      // Initialize default resolutions based on anomalies
      const initialResolutions: Record<number, Resolution> = {};
      resReport.details.forEach(({ rowNumber, anomalies, rowData }) => {
        const rowRes: Resolution = {
          payerId: undefined,
          date: undefined,
          currency: rowData.currency || 'INR',
          exchangeRate: rowData.currency && rowData.currency !== 'INR' ? 83.00 : 1.0,
          isSettlement: undefined,
          payeeId: undefined,
          skip: false,
        };

        anomalies.forEach((a) => {
          if (a.anomalyType === 'DUPLICATE_EXPENSE') {
            // Default duplicate resolution: skip it to prevent double insertion
            rowRes.skip = true;
          }
          if (a.anomalyType === 'SETTLEMENT_AS_EXPENSE') {
            rowRes.isSettlement = true;
            // Guess payeeId as first participant if it matches a member
            if (rowData.participants) {
              const firstPart = rowData.participants.split(',')[0].trim().toLowerCase();
              const match = details.members.find(
                (m) => m.name.toLowerCase() === firstPart || m.email.toLowerCase() === firstPart
              );
              if (match) rowRes.payeeId = match.id;
            }
          }
          if (a.anomalyType === 'MISSING_PAYER') {
            // Must be resolved by user
          }
          if (a.anomalyType === 'CURRENCY_CONVERSION') {
            rowRes.exchangeRate = 83.00;
          }
        });

        initialResolutions[rowNumber] = rowRes;
      });

      setResolutions(initialResolutions);

      if (resReport.details.length > 0) {
        setSelectedRowNumber(resReport.details[0].rowNumber);
      }

      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Import validation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!report) return;

    setIsProcessing(true);
    setError('');

    try {
      await importService.confirmImport(report.importJobId, resolutions);
      setStep(3);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to confirm import');
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to check if a row has unconfirmed blocker errors
  const isRowBlocked = (rowNumber: number, rowAnomalies: any[], rowData: any) => {
    const res = resolutions[rowNumber];
    if (!res) return false;
    if (res.skip) return false;

    return rowAnomalies.some((a) => {
      if (a.severity === 'ERROR') {
        if (a.anomalyType === 'MISSING_PAYER' && !res.payerId) return true;
        if (a.anomalyType === 'INVALID_DATE' && !res.date) return true;
        return true;
      }
      return false;
    });
  };

  // Compute total blockers in report
  const getBlockersCount = () => {
    if (!report) return 0;
    return report.details.filter((d) => isRowBlocked(d.rowNumber, d.anomalies, d.rowData)).length;
  };

  // Filtered details
  const getFilteredDetails = () => {
    if (!report) return [];
    return report.details.filter(({ rowNumber, anomalies }) => {
      const res = resolutions[rowNumber];
      const hasErrors = anomalies.some(a => a.severity === 'ERROR');
      const hasWarnings = anomalies.some(a => a.severity === 'WARNING');
      const hasInfo = anomalies.some(a => a.severity === 'INFO');

      if (filterType === 'ERRORS') return hasErrors && (!res || !res.skip);
      if (filterType === 'WARNINGS') return hasWarnings && (!res || !res.skip);
      if (filterType === 'PERFECT') return anomalies.length === 0 && (!res || !res.skip);
      return true; // ALL
    });
  };

  const activeRowDetail = report?.details.find(d => d.rowNumber === selectedRowNumber);
  const activeRowResolution = selectedRowNumber ? resolutions[selectedRowNumber] : null;

  const updateResolution = (rowNum: number, fields: Partial<Resolution>) => {
    setResolutions(prev => ({
      ...prev,
      [rowNum]: {
        ...prev[rowNum],
        ...fields
      }
    }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gray-950 px-6 py-4 flex justify-between items-center border-b border-gray-800">
          <div>
            <h3 className="text-white text-lg font-semibold tracking-wide">Bulk CSV Import System</h3>
            <p className="text-gray-500 text-xs mt-0.5">Splitwise-like intelligent transaction parsing</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl transition-colors leading-none"
          >
            ×
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-gray-950/40 px-6 py-3 border-b border-gray-800 flex items-center justify-center gap-8 text-xs font-semibold tracking-wider">
          <div className={`flex items-center gap-2 ${step === 1 ? 'text-primary-400' : 'text-gray-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-primary-500/20 border border-primary-500' : 'bg-gray-800 border border-gray-700'}`}>1</span>
            UPLOAD CSV
          </div>
          <div className="w-12 h-px bg-gray-800" />
          <div className={`flex items-center gap-2 ${step === 2 ? 'text-primary-400' : 'text-gray-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-primary-500/20 border border-primary-500' : 'bg-gray-800 border border-gray-700'}`}>2</span>
            RESOLVE ANOMALIES
          </div>
          <div className="w-12 h-px bg-gray-800" />
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-primary-400' : 'text-gray-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-primary-500/20 border border-primary-500' : 'bg-gray-800 border border-gray-700'}`}>3</span>
            IMPORT SUCCESS
          </div>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-gray-800/40 border border-gray-800/80 rounded-xl p-5 shadow-inner">
                  <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                    <span className="text-primary-400">📋</span> CSV Import Guidelines
                  </h4>
                  <p className="text-gray-400 text-sm mb-4">
                    Our intelligent import system checks for 12 data quality issues (duplicates, ambiguous dates, currency conversions, timeline membership violations, settlements, and name aliases) and helps you resolve them before importing.
                  </p>
                  <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                    <li>Download the official template below.</li>
                    <li>Add dates, descriptions, payer email or name, total amounts, and participants.</li>
                    <li>Select splits type and participant shares if required.</li>
                    <li>Upload the CSV to scan for anomalies.</li>
                  </ol>
                </div>

                <div>
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-2 font-semibold transition-colors"
                  >
                    📥 Download Standard CSV Template
                  </button>
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-800 rounded-xl flex flex-col justify-center items-center p-8 bg-gray-950/20 hover:border-gray-700 transition-colors">
                <span className="text-4xl mb-3">📁</span>
                <label className="block text-sm text-gray-400 font-medium mb-3">Select Expense CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-file-upload"
                />
                <label
                  htmlFor="csv-file-upload"
                  className="px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-white rounded-lg cursor-pointer text-sm font-semibold transition-colors shadow-sm"
                >
                  Choose File
                </label>
                {file && (
                  <div className="mt-4 text-center">
                    <p className="text-sm text-white font-medium">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{Math.round(file.size / 1024)} KB</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-950/30 text-red-400 border border-red-900/50 rounded-xl text-sm">
                ❌ {error}
              </div>
            )}

            <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
              <Button type="button" onClick={onClose} variant="secondary">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleUpload}
                disabled={!file || isProcessing}
                variant="primary"
              >
                {isProcessing ? 'Processing CSV...' : 'Scan & Validate CSV'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review & Resolve */}
        {step === 2 && report && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Rows List */}
            <div className="w-full md:w-2/5 border-r border-gray-800 flex flex-col overflow-hidden bg-gray-950/20">
              {/* Report Summary Cards */}
              <div className="p-4 bg-gray-950/50 border-b border-gray-800 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-900 border border-gray-800 p-2 rounded-lg">
                    <p className="text-gray-500 text-[9px] font-bold uppercase tracking-wider">Total Rows</p>
                    <p className="text-white text-base font-bold mt-0.5">{report.totalRows}</p>
                  </div>
                  <div className="bg-amber-900/10 border border-amber-900/30 p-2 rounded-lg">
                    <p className="text-amber-500 text-[9px] font-bold uppercase tracking-wider">Warnings</p>
                    <p className="text-amber-400 text-base font-bold mt-0.5">{report.anomalies.warnings}</p>
                  </div>
                  <div className="bg-red-900/10 border border-red-900/30 p-2 rounded-lg">
                    <p className="text-red-500 text-[9px] font-bold uppercase tracking-wider">Blockers</p>
                    <p className="text-red-400 text-base font-bold mt-0.5">{getBlockersCount()}</p>
                  </div>
                </div>

                {/* Filter and Search */}
                <div className="flex gap-1 bg-gray-900/80 p-0.5 rounded-lg border border-gray-850">
                  {(['ALL', 'ERRORS', 'WARNINGS', 'PERFECT'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === type ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'text-gray-400 hover:text-white'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rows List scroll container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {getFilteredDetails().map(({ rowNumber, anomalies, rowData }) => {
                  const res = resolutions[rowNumber];
                  const isSelected = rowNumber === selectedRowNumber;
                  const isSkipped = res?.skip;
                  const isBlocked = isRowBlocked(rowNumber, anomalies, rowData);

                  // Compute row color status
                  let borderClass = 'border-gray-800 hover:border-gray-700 bg-gray-900/30';
                  if (isSelected) borderClass = 'border-primary-500 bg-primary-500/5';
                  else if (isSkipped) borderClass = 'border-gray-850 opacity-45 bg-gray-900/10';
                  else if (isBlocked) borderClass = 'border-red-900 bg-red-950/5';
                  else if (anomalies.some(a => a.severity === 'WARNING')) borderClass = 'border-amber-900/60 bg-amber-950/5';
                  else if (anomalies.some(a => a.severity === 'INFO')) borderClass = 'border-blue-900/60 bg-blue-950/5';

                  return (
                    <div
                      key={rowNumber}
                      onClick={() => setSelectedRowNumber(rowNumber)}
                      className={`p-3 border rounded-xl cursor-pointer transition-all ${borderClass}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-[10px] font-mono font-bold bg-gray-950/50 px-1.5 py-0.5 rounded border border-gray-850">
                            Row {rowNumber}
                          </span>
                          {isSkipped && <span className="text-[9px] font-bold uppercase bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">SKIPPED</span>}
                          {isBlocked && <span className="text-[9px] font-bold uppercase bg-red-950 text-red-400 px-1.5 py-0.5 rounded border border-red-900/30">BLOCKER</span>}
                        </div>
                        <p className={`font-semibold text-sm ${isSkipped ? 'text-gray-600 line-through' : 'text-white'}`}>
                          {res?.currency !== 'INR' ? `${res?.currency} ` : '₹'}
                          {rowData.amount}
                        </p>
                      </div>
                      <p className={`text-xs mt-1 font-medium truncate ${isSkipped ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                        {rowData.description || '(No Description)'}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2">
                        <p>Paid by: {res?.payerId ? members.find(m=>m.id===res.payerId)?.name : rowData.paidBy || 'Missing'}</p>
                        <p>{rowData.date}</p>
                      </div>
                    </div>
                  );
                })}
                {getFilteredDetails().length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No rows match this filter.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Selected Row Resolution Detail */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-between bg-gray-900/10">
              {activeRowDetail && activeRowResolution ? (
                <div className="space-y-6">
                  {/* Row general info banner */}
                  <div className="bg-gray-950 p-4 border border-gray-850 rounded-xl flex justify-between items-center">
                    <div>
                      <h4 className="text-white font-semibold text-base flex items-center gap-2">
                        Row {activeRowDetail.rowNumber}: {activeRowDetail.rowData.description}
                      </h4>
                      <p className="text-gray-400 text-xs mt-1">
                        Payer: <span className="text-gray-300 font-medium">{activeRowDetail.rowData.paidBy || 'None'}</span> · 
                        Participants: <span className="text-gray-300 font-medium">{activeRowDetail.rowData.participants || 'None'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-400 select-none">
                        <input
                          type="checkbox"
                          checked={!!activeRowResolution.skip}
                          onChange={(e) => updateResolution(activeRowDetail.rowNumber, { skip: e.target.checked })}
                          className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-gray-900"
                        />
                        Skip Row
                      </label>
                    </div>
                  </div>

                  {/* Anomalies and Resolutions forms */}
                  <div className="space-y-4">
                    {activeRowResolution.skip ? (
                      <div className="bg-gray-800/20 border border-gray-800/80 text-gray-400 p-5 rounded-xl text-sm text-center">
                        🚫 This transaction row will be skipped and will not be imported into the group.
                      </div>
                    ) : (
                      <>
                        {activeRowDetail.anomalies.map((anomaly, idx) => {
                          const type = anomaly.anomalyType;
                          
                          // Display specific resolution options based on anomalyType
                          return (
                            <div
                              key={idx}
                              className={`p-4 border rounded-xl space-y-3 ${anomaly.severity === 'ERROR' ? 'bg-red-950/10 border-red-900/50' : anomaly.severity === 'WARNING' ? 'bg-amber-950/10 border-amber-900/50' : 'bg-blue-950/10 border-blue-900/50'}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <span className="text-lg leading-none mt-0.5">
                                  {anomaly.severity === 'ERROR' ? '🚨' : anomaly.severity === 'WARNING' ? '⚠️' : 'ℹ️'}
                                </span>
                                <div>
                                  <p className="text-white text-xs font-bold uppercase tracking-wider">{type.replace(/_/g, ' ')}</p>
                                  <p className="text-gray-300 text-sm mt-1">{anomaly.message}</p>
                                </div>
                              </div>

                              {/* Interactive input components for resolution */}
                              {type === 'MISSING_PAYER' && (
                                <div className="pl-7 space-y-2">
                                  <label className="block text-xs text-gray-400 font-medium">Select Payer User *</label>
                                  <select
                                    value={activeRowResolution.payerId || ''}
                                    onChange={(e) => updateResolution(activeRowDetail.rowNumber, { payerId: e.target.value })}
                                    className="w-full max-w-xs px-3 py-2 bg-gray-950 border border-gray-800 text-white rounded-lg focus:border-primary-500 focus:outline-none text-sm"
                                  >
                                    <option value="">-- Choose Group Member --</option>
                                    {members.map(m => (
                                      <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {type === 'INCONSISTENT_NAME' && !anomaly.canAutoFix && (
                                <div className="pl-7 space-y-2">
                                  <label className="block text-xs text-gray-400 font-medium">Confirm User Casing / Alias Mapping *</label>
                                  <select
                                    value={activeRowResolution.payerId || ''}
                                    onChange={(e) => updateResolution(activeRowDetail.rowNumber, { payerId: e.target.value })}
                                    className="w-full max-w-xs px-3 py-2 bg-gray-950 border border-gray-800 text-white rounded-lg focus:border-primary-500 focus:outline-none text-sm"
                                  >
                                    <option value="">-- Choose Correct User --</option>
                                    {members.map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {type === 'INCONSISTENT_NAME' && anomaly.canAutoFix && (
                                <div className="pl-7 text-xs text-gray-400 bg-gray-950/30 p-2 rounded border border-gray-850">
                                  ✅ Casing will automatically be normalized from <span className="font-semibold text-white">"{anomaly.originalValue}"</span> to <span className="font-semibold text-white">"{anomaly.suggestedValue}"</span>.
                                </div>
                              )}

                              {type === 'DUPLICATE_EXPENSE' && (
                                <div className="pl-7 flex flex-col gap-2">
                                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-semibold select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!activeRowResolution.skip}
                                      onChange={(e) => updateResolution(activeRowDetail.rowNumber, { skip: e.target.checked })}
                                      className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-gray-900"
                                    />
                                    Skip this duplicate row (Recommended)
                                  </label>
                                </div>
                              )}

                              {type === 'SETTLEMENT_AS_EXPENSE' && (
                                <div className="pl-7 space-y-3">
                                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 font-semibold select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!activeRowResolution.isSettlement}
                                      onChange={(e) => updateResolution(activeRowDetail.rowNumber, { isSettlement: e.target.checked })}
                                      className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-primary-500"
                                    />
                                    Convert to Settlement Record
                                  </label>
                                  {activeRowResolution.isSettlement && (
                                    <div className="space-y-2 max-w-xs">
                                      <label className="block text-xs text-gray-400 font-medium">Recipient (Payee) *</label>
                                      <select
                                        value={activeRowResolution.payeeId || ''}
                                        onChange={(e) => updateResolution(activeRowDetail.rowNumber, { payeeId: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-950 border border-gray-800 text-white rounded-lg text-sm focus:outline-none"
                                      >
                                        <option value="">-- Choose Recipient --</option>
                                        {members.map(m => (
                                          <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              )}

                              {type === 'AMBIGUOUS_DATE' && (
                                <div className="pl-7 space-y-2">
                                  <label className="block text-xs text-gray-400 font-medium">Select Date Format Interpretation *</label>
                                  <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`date-format-${activeRowDetail.rowNumber}`}
                                        onChange={() => {
                                          const match = anomaly.originalValue?.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
                                          if (match) {
                                            // interpret first val as Month, second as Day
                                            const [, m, d, y] = match;
                                            updateResolution(activeRowDetail.rowNumber, { date: `${y}-${m}-${d}` });
                                          }
                                        }}
                                        className="bg-gray-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-gray-900"
                                      />
                                      Interpret as MM-DD-YYYY (Month: {anomaly.originalValue?.split(/[/-]/)[0]}, Day: {anomaly.originalValue?.split(/[/-]/)[1]})
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`date-format-${activeRowDetail.rowNumber}`}
                                        onChange={() => {
                                          const match = anomaly.originalValue?.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
                                          if (match) {
                                            // interpret first val as Day, second as Month
                                            const [, d, m, y] = match;
                                            updateResolution(activeRowDetail.rowNumber, { date: `${y}-${m}-${d}` });
                                          }
                                        }}
                                        className="bg-gray-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-gray-900"
                                      />
                                      Interpret as DD-MM-YYYY (Month: {anomaly.originalValue?.split(/[/-]/)[1]}, Day: {anomaly.originalValue?.split(/[/-]/)[0]})
                                    </label>
                                  </div>
                                </div>
                              )}

                              {type === 'CURRENCY_CONVERSION' && (
                                <div className="pl-7 space-y-3">
                                  <div className="flex gap-4">
                                    <div className="w-1/2">
                                      <label className="block text-xs text-gray-400 font-medium">Exchange Rate ({anomaly.originalValue} to INR) *</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={activeRowResolution.exchangeRate || 83.00}
                                        onChange={(e) => updateResolution(activeRowDetail.rowNumber, { exchangeRate: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 bg-gray-950 border border-gray-800 text-white rounded-lg focus:outline-none focus:border-primary-500 text-sm mt-1"
                                      />
                                    </div>
                                    <div className="w-1/2">
                                      <label className="block text-xs text-gray-500 font-medium">Converted amount</label>
                                      <p className="text-white text-base font-bold mt-2.5">
                                        ₹{(parseFloat(activeRowDetail.rowData.amount) * (activeRowResolution.exchangeRate || 83.00)).toFixed(2)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {type === 'INVALID_DATE' && (
                                <div className="pl-7 space-y-2">
                                  <label className="block text-xs text-gray-400 font-medium">Correct Date format (YYYY-MM-DD) *</label>
                                  <input
                                    type="date"
                                    value={activeRowResolution.date || ''}
                                    onChange={(e) => updateResolution(activeRowDetail.rowNumber, { date: e.target.value })}
                                    className="w-full max-w-xs px-3 py-2 bg-gray-950 border border-gray-800 text-white rounded-lg focus:outline-none focus:border-primary-500 text-sm"
                                  />
                                </div>
                              )}

                              {type === 'NEGATIVE_AMOUNT' && (
                                <div className="pl-7 text-xs text-gray-400 bg-gray-950/30 p-2 rounded border border-gray-850">
                                  ℹ️ This represents a refund. It will split negative amounts among active timeline group members, credited to the payer.
                                </div>
                              )}

                              {type === 'SPLIT_INCONSISTENCY' && (
                                <div className="pl-7 text-xs text-gray-400 bg-gray-950/30 p-2 rounded border border-gray-850">
                                  ✅ Inconsistent split details were ignored. Casing/Split type will default to <span className="font-semibold text-white">EQUAL</span> splits.
                                </div>
                              )}

                              {type === 'INVALID_MEMBER_FOR_DATE' && (
                                <div className="pl-7 text-xs text-gray-400 bg-gray-950/30 p-2 rounded border border-gray-850">
                                  ✅ Non-active timeline participants were automatically excluded. Split will be shared only among valid members.
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {activeRowDetail.anomalies.length === 0 && (
                          <div className="bg-green-950/10 border border-green-900/50 p-5 rounded-xl flex items-center gap-3 text-sm text-green-400">
                            <span>✅</span>
                            This transaction row is clean! Ready to import directly.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex justify-center items-center text-gray-500 text-sm">
                  Select a row from the list to review and resolve anomalies.
                </div>
              )}

              {/* Bottom confirmation action */}
              <div className="mt-8 pt-4 border-t border-gray-800 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  {getBlockersCount() > 0 ? (
                    <span className="text-red-400 font-semibold">⚠️ {getBlockersCount()} blocking issues must be resolved</span>
                  ) : (
                    <span className="text-green-400 font-semibold">✓ All rows resolved! Ready to import</span>
                  )}
                </p>
                <div className="flex gap-3">
                  <Button type="button" onClick={() => setStep(1)} variant="secondary">
                    Back to Upload
                  </Button>
                  <Button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={getBlockersCount() > 0 || isProcessing}
                    variant="primary"
                  >
                    {isProcessing ? 'Finalizing Import...' : 'Import Expenses & Settlements'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div className="flex-1 flex flex-col justify-center items-center p-8 space-y-5 text-center">
            <div className="w-16 h-16 bg-primary-500/20 border border-primary-500 rounded-full flex items-center justify-center text-3xl animate-bounce">
              🎉
            </div>
            <div>
              <h4 className="text-white text-xl font-semibold tracking-wide">Import Successful!</h4>
              <p className="text-gray-400 text-sm mt-2">
                All resolved transactions have been successfully written to the group expenses and settlements.
              </p>
            </div>
            <p className="text-gray-500 text-xs animate-pulse">This window will close automatically...</p>
          </div>
        )}
      </div>
    </div>
  );
}
