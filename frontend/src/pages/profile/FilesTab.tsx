import { useRef, useState } from 'react';
import { ProfileApi } from '@/api/endpoints';
import type { ProfileFileOut } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FILE_KINDS } from '@/lib/constants';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { IconFile } from '@/components/icons';
import { SectionTitle } from './shared';

const SCALAR_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'github_url', label: 'GitHub' },
  { key: 'portfolio_url', label: 'Portfolio' },
  { key: 'years_experience', label: 'Years experience' },
];

export function FilesTab({ onProfileChanged }: { onProfileChanged: () => void }) {
  const toast = useToast();
  const { data, loading, setData, reload } = useApi<ProfileFileOut[]>(() => ProfileApi.listFiles(), []);
  const [kind, setKind] = useState('resume');
  const [isDefault, setIsDefault] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const files = data ?? [];

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const created = await ProfileApi.uploadFile(kind, kind === 'resume' && isDefault, file);
      setData((rows) => [...(rows ?? []), created]);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Uploaded', file.name);
      void reload();
    } catch (err) {
      toast.error('Upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const setDefault = async (id: string) => {
    setBusy(id);
    try {
      await ProfileApi.setDefaultFile(id);
      void reload();
    } catch (err) {
      toast.error('Could not set default', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    const prev = files;
    setData((rows) => (rows ?? []).filter((r) => r.id !== id));
    try {
      await ProfileApi.deleteFile(id);
    } catch (err) {
      setData(prev);
      toast.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  const parse = async (id: string) => {
    setBusy(id);
    try {
      const res = await ProfileApi.parseFile(id);
      setParsed(res.parsed || {});
      toast.success('Resume parsed', 'Review the details, then apply.');
    } catch (err) {
      toast.error('Could not parse', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const applyParsed = async () => {
    if (!parsed) return;
    setApplying(true);
    try {
      // Persist any edits to parsed_resume, then merge into the structured profile.
      await ProfileApi.update({ parsed_resume: parsed });
      await ProfileApi.applyParsed();
      toast.success('Applied to profile', 'Your profile fields were updated.');
      setParsed(null);
      onProfileChanged();
    } catch (err) {
      toast.error('Could not apply', err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  const setScalar = (key: string, value: string) => setParsed((p) => ({ ...(p ?? {}), [key]: value }));

  const workExp = Array.isArray(parsed?.work_experience) ? (parsed?.work_experience as Record<string, unknown>[]) : [];
  const education = Array.isArray(parsed?.education) ? (parsed?.education as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-4">
      {/* Upload */}
      <Card>
        <CardHeader title="Upload a document" subtitle="Resume, cover letter, certificate, or portfolio (max 15MB)" />
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label>Type</Label>
              <Select options={FILE_KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />
            </div>
            {kind === 'resume' && (
              <label className="flex h-10 items-center gap-2 text-[13px]">
                <Toggle checked={isDefault} onChange={setIsDefault} label="Set as default resume" />
                <span className="font-medium">Default resume</span>
              </label>
            )}
            <div className="flex-1">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.rtf,.odt"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
                className="block w-full text-[13px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-600 file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-white hover:file:bg-accent-700"
              />
            </div>
            {uploading && <Badge tone="accent">Uploading…</Badge>}
          </div>
        </CardBody>
      </Card>

      {/* Files list */}
      <div>
        <SectionTitle description="Your uploaded documents.">Documents</SectionTitle>
        <div className="mt-3">
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<IconFile className="h-6 w-6" />}
              title="No files yet"
              description="Upload your resume to unlock parsing and auto-fill."
            />
          ) : (
            <Card className="divide-y divide-[rgb(var(--border))]">
              {files.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-3 p-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--surface-2))]">
                    <IconFile className="h-5 w-5 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{f.filename}</p>
                      {f.is_default && <Badge tone="success">Default</Badge>}
                    </div>
                    <p className="text-[12px] text-subtle">
                      <span className="capitalize">{f.kind}</span> · {formatBytes(f.size_bytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {f.kind === 'resume' && (
                      <>
                        <Button variant="ghost" size="sm" disabled={busy === f.id} onClick={() => void parse(f.id)}>
                          Parse
                        </Button>
                        {!f.is_default && (
                          <Button variant="ghost" size="sm" disabled={busy === f.id} onClick={() => void setDefault(f.id)}>
                            Set default
                          </Button>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => void remove(f.id)}
                      className="rounded-lg p-2 text-subtle transition-colors hover:bg-red-50 hover:text-danger dark:hover:bg-red-950/30"
                      aria-label="Delete file"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                        <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* Parsed review panel */}
      {parsed && (
        <Card className="animate-fade-in-up border-accent-200 dark:border-accent-500/30">
          <CardHeader
            title="Review parsed resume"
            subtitle="Edit anything that looks off, then apply to your profile"
            action={
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setParsed(null)} disabled={applying}>
                  Discard
                </Button>
                <Button size="sm" loading={applying} onClick={applyParsed}>
                  Apply to profile
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SCALAR_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input value={String(parsed[f.key] ?? '')} onChange={(e) => setScalar(f.key, e.target.value)} />
                </div>
              ))}
            </div>

            {(workExp.length > 0 || education.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {workExp.length > 0 && (
                  <div className="rounded-xl border border-[rgb(var(--border))] p-3">
                    <p className="text-[12.5px] font-semibold">Work experience · {workExp.length}</p>
                    <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
                      {workExp.slice(0, 5).map((w, i) => (
                        <li key={i} className="truncate">
                          {String(w.title || 'Role')} — {String(w.company || '')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {education.length > 0 && (
                  <div className="rounded-xl border border-[rgb(var(--border))] p-3">
                    <p className="text-[12.5px] font-semibold">Education · {education.length}</p>
                    <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
                      {education.slice(0, 5).map((e, i) => (
                        <li key={i} className="truncate">
                          {String(e.degree || 'Degree')} — {String(e.school || '')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <details className="rounded-xl border border-[rgb(var(--border))]">
              <summary className="cursor-pointer px-3.5 py-2.5 text-[12.5px] font-medium text-muted">Raw parsed JSON</summary>
              <RawJsonEditor value={parsed} onChange={setParsed} />
            </details>
            <p className="text-[12px] text-subtle">
              Applying will fill your Personal fields and append parsed roles and education to your profile.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function RawJsonEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState('');
  return (
    <div className="p-3 pt-0">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError('');
          } catch {
            setError('Invalid JSON — reverted to last valid value.');
            setText(JSON.stringify(value, null, 2));
          }
        }}
        spellCheck={false}
        rows={10}
        className={cn(
          'w-full rounded-xl border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface))] p-3 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/25',
        )}
      />
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
