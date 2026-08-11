import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardPaste,
  Database,
  FileSpreadsheet,
  Loader2,
  SkipForward,
  Upload,
  X,
  FileUp,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageHeader } from '@/components/ui/EmptyState';
import { PinkPixelSpinner } from '@/components/PinkPixel';
import { type PageKey } from '@/components/DashboardLayout';
import {
  commitImport,
  detectDuplicates,
  fetchCandidates,
  parseExcelFile,
  parseImportData,
} from '@/lib/api';
import { type ImportPreview } from '@/types';

export function ImportPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [rawText, setRawText] = useState('');
  const [previews, setPreviews] = useState<ImportPreview[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsedInfo, setParsedInfo] = useState<{ count: number; mapping: Record<number, string>; headers: string[]; skipped: { rowNumber: number; reason: string; rawValues: string[] }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { rows, skipped, mapping, headers, warnings: w } = parseImportData(rawText);
      setWarnings(w);
      setParsedInfo({ count: rows.length, skipped, mapping, headers });
      if (rows.length > 0) {
        const existing = await fetchCandidates();
        const p = await detectDuplicates(rows, existing);
        setPreviews(p);
      } else {
        setPreviews([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setParsingFile(true);
    try {
      const text = await parseExcelFile(file);
      setRawText(text);
    } catch (err) {
      console.error('File parse error:', err);
      setWarnings(['Failed to parse file. Make sure it is a valid .xlsx, .xls, or .csv file.']);
    } finally {
      setParsingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const setResolution = (index: number, resolution: ImportPreview['resolution']) => {
    setPreviews((prev) => prev?.map((p, i) => (i === index ? { ...p, resolution } : p)) ?? null);
  };

  const setAllResolution = (resolution: ImportPreview['resolution']) => {
    setPreviews((prev) => prev?.map((p) => (p.isDuplicate ? { ...p, resolution } : p)) ?? null);
  };

  const handleSave = async () => {
    if (!previews) return;
    setSaving(true);
    try {
      const r = await commitImport(previews);
      setResult(r);
      setPreviews(null);
      setRawText('');
      setParsedInfo(null);
    } catch (err) {
      console.error('Import commit failed:', err);
      setWarnings(['Import failed. Check the browser console for detailed error information.']);
    } finally {
      setSaving(false);
    }
  };

  const dupCount = previews?.filter((p) => p.isDuplicate).length ?? 0;
  const pendingCount = previews?.filter((p) => p.isDuplicate && p.resolution === 'pending').length ?? 0;

  return (
    <div className="animate-fade-in">
      
<PageHeader
  title="Smart Importer"
  subtitle="Upload Excel/CSV files or paste raw data — we'll auto-detect columns and handle duplicates."
/>

{parsingFile && (
  <div className="fixed inset-0 z-[95] flex items-center justify-center bg-pink-950/20 backdrop-blur-sm pointer-events-auto">
    <div className="rounded-3xl bg-white p-8 shadow-2xl flex flex-col items-center gap-4 pointer-events-none">
      <img
        src="/excel-upload-loader.gif"
        alt="Reading Excel file"
        className="h-44 w-44 object-contain"
      />
      <p className="text-center text-sm font-semibold text-pink-900">Reading your Excel file...</p>
    </div>
  </div>
)}

{saving && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-pink-950/20 backdrop-blur-sm">
    <div className="flex min-w-72 flex-col items-center rounded-3xl bg-white px-10 py-8 shadow-2xl">
      <img
        src="/excel-upload-loader.gif"
        alt="Saving records"
        className="h-44 w-44 object-contain"
      />

      <h3 className="mt-4 text-lg font-bold text-pink-900">
        Saving records...
      </h3>

      <p className="mt-2 text-center text-sm text-pink-500">
        Please wait while your candidates are imported.
      </p>
    </div>
  </div>
)}
      {!previews && !result && (
        <>
          {/* Drag-and-drop zone */}
          <Card
            className={`mb-4 border-2 transition-all-soft ${dragOver ? 'border-pink-400 bg-pink-50' : 'border-pink-100'}`}
          >
            <CardBody className="pt-6 pb-6">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-8 cursor-pointer"
              >
                {parsingFile ? (
                  <PinkPixelSpinner className="mb-3" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-pink-100 text-pink-500 flex items-center justify-center mb-3">
                    <FileUp size={28} />
                  </div>
                )}
                <p className="text-sm font-semibold text-pink-800">
                  {parsingFile ? 'Parsing file...' : 'Drag & drop Excel/CSV here'}
                </p>
                <p className="text-xs text-pink-400 mt-1">
                  Supports .xlsx, .xls, .csv \u2014 or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>
            </CardBody>
          </Card>

          {/* Paste area */}
          <Card>
            <CardHeader>
              <CardTitle>Paste Your Data</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="relative">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Paste rows directly from Excel, CSV, or TSV here...\n\nExample:\nName\tEmail\tPhone\tJob Role\tStatus\tDBS Expiry\tPassport Expiry\nJane Smith\tjane@email.com\t07123456789\tRegistered Nurse\tActive\t15/03/2025\t20/06/2025`}
                  className="w-full h-48 rounded-xl border border-pink-200 bg-white/70 px-4 py-3 text-sm text-pink-900 placeholder:text-pink-300 transition-all-soft focus:outline-none focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 font-mono resize-y"
                />
              </div>

              {warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl bg-warning-50 border border-warning-500/20 px-4 py-3 text-sm text-warning-600">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-pink-400">
                  {rawText.trim().split(/\r?\n/).filter((l) => l.trim()).length} lines detected
                </p>
                <Button onClick={handleParse} loading={loading} disabled={!rawText.trim()}>
                  <ClipboardPaste size={16} /> Parse & Preview
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {previews && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Preview ({previews.length} rows)</CardTitle>
              {dupCount > 0 && (
                <p className="text-xs text-pink-500 mt-1">
                  {dupCount} duplicate{dupCount !== 1 ? 's' : ''} detected \u2014 choose: Update Expiry Dates Only, Skip, or Cancel
                </p>
              )}
            </div>
            {dupCount > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAllResolution('update')}>
                  Update All
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAllResolution('skip')}>
                  Skip All
                </Button>
              </div>
            )}
          </CardHeader>
          <CardBody>
            {parsedInfo && (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {Object.entries(parsedInfo.mapping).map(([col, field]) => (
                    <span key={col} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-100 text-pink-700 text-xs font-medium">
                      <Database size={12} />
                      Col {Number(col) + 1} → {field.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {parsedInfo.skipped.length > 0 && (
                  <div className="mb-4 rounded-2xl bg-warning-50 border border-warning-400/40 p-4 text-sm text-warning-700">
                    <div className="font-semibold">Skipped rows detected</div>
                    <p className="mt-1 text-xs text-warning-600">
                      {parsedInfo.skipped.length} row{parsedInfo.skipped.length !== 1 ? 's' : ''} were skipped because they were missing a required Name field.
                    </p>
                    <ul className="mt-2 list-disc pl-5 space-y-1">
                      {parsedInfo.skipped.slice(0, 5).map((skip) => (
                        <li key={skip.rowNumber}>
                          Row {skip.rowNumber}: {skip.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {previews.map((p, i) => (
                <div
                  key={i}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border transition-all-soft ${
                    p.isDuplicate
                      ? p.resolution === 'pending'
                        ? 'border-warning-500/30 bg-warning-50/50'
                        : p.resolution === 'skip'
                          ? 'border-pink-100 bg-pink-50/30 opacity-60'
                          : 'border-success-500/20 bg-success-50/30'
                      : 'border-pink-100 bg-white'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-pink-900 truncate">{p.row.full_name}</p>
                      {p.row.job_title && (
                        <span className="text-xs font-medium text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                          {p.row.job_title}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-pink-400 mt-0.5">
                      {p.row.email && <span>{p.row.email}</span>}
                      {p.row.phone && <span>{p.row.phone}</span>}
                      <span className="capitalize">{p.row.status}</span>
                    </div>
                    {p.isDuplicate && p.existing && (
                      <p className="text-xs text-warning-600 mt-1">
                        Matches existing: {p.existing.full_name} ({p.existing.email ?? p.existing.phone}) \u2014 email/phone will NOT be overwritten
                      </p>
                    )}
                  </div>

                  {p.isDuplicate ? (
                    <div className="flex gap-2 shrink-0">
                      {p.resolution === 'pending' ? (
                        <>
                          <Button size="sm" variant="primary" onClick={() => setResolution(i, 'update')}>
                            Update Expiry Only
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setResolution(i, 'skip')}>
                            <SkipForward size={14} /> Skip
                          </Button>
                        </>
                      ) : (
                        <Badge tone={p.resolution === 'skip' ? 'neutral' : 'active'}>
                          {p.resolution === 'skip' ? 'Skipped' : 'Will Update'}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <Badge tone="active">New</Badge>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button variant="ghost" onClick={() => { setPreviews(null); setParsedInfo(null); }}>
                <X size={16} /> Cancel
              </Button>
              <Button onClick={handleSave} loading={saving} disabled={pendingCount > 0}>
                <Upload size={16} /> Save {previews.filter((p) => p.resolution !== 'skip').length} Records
              </Button>
            </div>
            {pendingCount > 0 && (
              <p className="text-xs text-warning-600 mt-2 text-right">
                {pendingCount} duplicate{pendingCount !== 1 ? 's' : ''} still need a decision
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {result && (
        <Card className="animate-fade-in-up">
          <CardBody className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-success-100 text-success-600 flex items-center justify-center mx-auto mb-4">
              <Check size={32} />
            </div>
            <h2 className="text-xl font-bold text-pink-900">Import Complete!</h2>
            <p className="text-sm text-pink-500 mt-1">
              Imported {result.created + result.updated} of {result.created + result.updated + result.skipped} candidates successfully.
            </p>
            <p className="text-sm text-pink-500 mt-1">
              {result.created} created, {result.updated} updated, {result.skipped} skipped.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => { setResult(null); }}>
                Import More
              </Button>
              <Button onClick={() => onNavigate('candidates')}>
                View Candidates <ArrowRight size={16} />
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {!rawText && !previews && !result && (
        <div className="mt-6">
          <EmptyState
            icon={<FileSpreadsheet size={28} />}
            title="How it works"
            description="Upload an Excel file or paste rows above. We'll detect column headers automatically \u2014 including Job Role, Position, or any custom columns. No template needed."
          />
        </div>
      )}
    </div>
  );
}
