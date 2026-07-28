import { useEffect, useRef, useState } from 'react';
import { AuthApi, ExtensionApi, ImportApi, ExportLinks } from '@/api/endpoints';
import type { DeviceOut, ExtensionInfo, ImportProfileResult, PairingOut } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Label } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { ThemeMenu } from '@/components/layout/ThemeMenu';
import { QRCode } from '@/components/QRCode';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { IconDownload, IconExtension, IconTrash, IconUpload } from '@/components/icons';

export function Settings() {
  return (
    <div>
      <PageHeader title="Settings" description="Manage your account, preferences, data, and the browser extension." />
      <div className="space-y-4">
        <PreferencesSection />
        <ExtensionSection />
        <DataSection />
        <SecuritySection />
      </div>
    </div>
  );
}

// ---------------- Preferences ----------------
function PreferencesSection() {
  const { user, updateSettings } = useAuth();
  const toast = useToast();
  const [maxPerHour, setMaxPerHour] = useState(String(user?.max_applications_per_hour ?? 15));
  const [howHeard, setHowHeard] = useState(user?.how_heard_default ?? '');
  const [webhook, setWebhook] = useState(user?.notify_webhook_url ?? '');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!user) return;
    setMaxPerHour(String(user.max_applications_per_hour));
    setHowHeard(user.how_heard_default);
    setWebhook(user.notify_webhook_url);
  }, [user]);

  const flash = (label: string) => {
    setSaved(label);
    window.setTimeout(() => setSaved(''), 1600);
  };

  const save = async (patch: Parameters<typeof updateSettings>[0], label: string) => {
    try {
      await updateSettings(patch);
      flash(label);
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Preferences"
        subtitle="How JobPilot behaves for you"
        action={saved && <span className="animate-fade-in text-[12.5px] font-medium text-success">{saved} saved</span>}
      />
      <CardBody className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-[12.5px] text-muted">System, light, or dark. Syncs to your account.</p>
          </div>
          <ThemeMenu />
        </div>

        <div className="h-px bg-[rgb(var(--border))]" />

        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Humanized input by default</p>
            <p className="text-[12.5px] text-muted">Type with natural timing when auto-applying.</p>
          </div>
          <Toggle
            checked={user?.humanized_input ?? true}
            onChange={(v) => void save({ humanized_input: v }, 'Preference')}
            label="Humanized input default"
          />
        </label>

        <div className="h-px bg-[rgb(var(--border))]" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max applications per hour" help="Rate-limit auto-apply (1–200).">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={200}
                value={maxPerHour}
                onChange={(e) => setMaxPerHour(e.target.value)}
                onBlur={() => {
                  const n = Math.min(200, Math.max(1, Number(maxPerHour) || 15));
                  setMaxPerHour(String(n));
                  if (n !== user?.max_applications_per_hour) void save({ max_applications_per_hour: n }, 'Rate limit');
                }}
              />
            )}
          </Field>
          <Field label={'"How did you hear" default'} help="Prefilled on applications that ask.">
            {(id) => (
              <Input
                id={id}
                placeholder="e.g. Company website"
                value={howHeard}
                onChange={(e) => setHowHeard(e.target.value)}
                onBlur={() => howHeard !== user?.how_heard_default && void save({ how_heard_default: howHeard }, 'Default')}
              />
            )}
          </Field>
        </div>

        <Field label="Notification webhook URL" help="JobPilot POSTs status updates here (optional).">
          {(id) => (
            <Input
              id={id}
              type="url"
              placeholder="https://hooks.example.com/…"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              onBlur={() => webhook !== user?.notify_webhook_url && void save({ notify_webhook_url: webhook }, 'Webhook')}
            />
          )}
        </Field>
      </CardBody>
    </Card>
  );
}

// ---------------- Extension ----------------
function ExtensionSection() {
  const toast = useToast();
  const info = useApi<ExtensionInfo>(() => ExtensionApi.info(), []);
  const devices = useApi<DeviceOut[]>(() => ExtensionApi.devices(), []);
  const [pairing, setPairing] = useState<PairingOut | null>(null);
  const [generating, setGenerating] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (!pairing) return;
    const tick = () => {
      const secs = Math.max(0, Math.round((new Date(pairing.expires_at).getTime() - Date.now()) / 1000));
      setRemaining(secs);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [pairing]);

  const generate = async () => {
    setGenerating(true);
    try {
      setPairing(await ExtensionApi.pairingCode());
    } catch (err) {
      toast.error('Could not generate code', err instanceof Error ? err.message : undefined);
    } finally {
      setGenerating(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await ExtensionApi.revokeDevice(id);
      toast.success('Device revoked');
      void devices.reload();
    } catch (err) {
      toast.error('Could not revoke', err instanceof Error ? err.message : undefined);
    } finally {
      setRevoking(null);
    }
  };

  const expired = pairing && remaining <= 0;
  const activeDevices = (devices.data ?? []).filter((d) => !d.revoked);

  return (
    <Card id="extension">
      <CardHeader
        title="Browser extension"
        subtitle="Pair a browser so JobPilot can apply on any site"
        action={info.data && <Badge tone="neutral">v{info.data.version}</Badge>}
      />
      <CardBody className="space-y-6">
        {/* Downloads */}
        <div>
          <Label>Download</Label>
          {info.loading ? (
            <Skeleton className="h-10 w-64" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <a href={info.data?.chrome_download} className={cn(!info.data?.chrome_available && 'pointer-events-none')}>
                <Button variant="secondary" disabled={!info.data?.chrome_available} leftIcon={<IconDownload className="h-4 w-4" />}>
                  Chrome
                </Button>
              </a>
              <a href={info.data?.firefox_download} className={cn(!info.data?.firefox_available && 'pointer-events-none')}>
                <Button variant="secondary" disabled={!info.data?.firefox_available} leftIcon={<IconDownload className="h-4 w-4" />}>
                  Firefox
                </Button>
              </a>
              {info.data && !info.data.chrome_available && !info.data.firefox_available && (
                <p className="text-[12.5px] text-muted">
                  Bundles aren't built yet — run <code className="rounded bg-[rgb(var(--surface-2))] px-1.5 py-0.5 text-[11.5px]">docker compose build</code> to produce them.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-[rgb(var(--border))]" />

        {/* Pairing */}
        <div className="grid gap-5 sm:grid-cols-[auto,1fr]">
          <div className="flex flex-col items-center gap-3">
            {pairing && !expired ? (
              <>
                <div className="rounded-2xl border border-[rgb(var(--border))] bg-white p-3 shadow-soft">
                  <QRCode value={pairing.pair_url} size={168} title="Pairing QR code" />
                </div>
                <div className="text-center">
                  <p className="font-mono text-3xl font-bold tracking-[0.2em] tabular-nums">{pairing.code}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                  </p>
                </div>
              </>
            ) : (
              <div className="grid h-[168px] w-[168px] place-items-center rounded-2xl border border-dashed border-[rgb(var(--border-strong))] text-center">
                <IconExtension className="h-8 w-8 text-subtle" />
              </div>
            )}
            <Button onClick={generate} loading={generating} variant={pairing ? 'secondary' : 'primary'}>
              {pairing ? 'New code' : 'Generate pairing code'}
            </Button>
          </div>

          <div className="text-sm">
            <p className="font-medium">How to pair</p>
            <ol className="mt-2 space-y-2 text-[13px] text-muted">
              <li className="flex gap-2">
                <Step n={1} /> Install the extension for Chrome or Firefox using the buttons above.
              </li>
              <li className="flex gap-2">
                <Step n={2} /> Open the JobPilot extension and choose <span className="font-medium text-[rgb(var(--text))]">Pair device</span>.
              </li>
              <li className="flex gap-2">
                <Step n={3} /> Scan the QR code, or enter the 6-digit code. Codes expire after 10 minutes.
              </li>
              <li className="flex gap-2">
                <Step n={4} /> Once linked, the sidebar dot turns green and auto-apply is ready.
              </li>
            </ol>
            {expired && <p className="mt-3 text-[12.5px] text-warning">That code expired — generate a new one.</p>}
          </div>
        </div>

        <div className="h-px bg-[rgb(var(--border))]" />

        {/* Devices */}
        <div>
          <Label>Paired devices</Label>
          {devices.loading ? (
            <Skeleton className="h-16 w-full" />
          ) : activeDevices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[rgb(var(--border-strong))] px-4 py-6 text-center text-[13px] text-muted">
              No devices paired yet.
            </p>
          ) : (
            <div className="divide-y divide-[rgb(var(--border))] rounded-xl border border-[rgb(var(--border))]">
              {activeDevices.map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-[rgb(var(--surface-2))]">
                    <IconExtension className="h-4 w-4 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name || 'Browser'}</p>
                    <p className="truncate text-[12px] text-subtle">
                      {d.browser || 'unknown'}
                      {d.last_seen ? ` · seen ${relativeTime(d.last_seen)}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={revoking === d.id} onClick={() => void revoke(d.id)} className="text-danger hover:bg-red-50 dark:hover:bg-red-950/30">
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-600 text-[11px] font-semibold text-white">
      {n}
    </span>
  );
}

// ---------------- Data ----------------
function DataSection() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportProfileResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const exportItems = [
    { label: 'Jobs (CSV)', href: ExportLinks.jobsCsv },
    { label: 'Jobs (JSON)', href: ExportLinks.jobsJson },
    { label: 'Profile (JSON)', href: ExportLinks.profileJson },
    { label: 'Applications (CSV)', href: ExportLinks.applicationsCsv },
  ];

  const onPick = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    try {
      const res = await ImportApi.profile(false, f);
      setPreview(res);
      if (res.error) toast.error('Import preview failed', res.error);
    } catch (err) {
      toast.error('Could not read file', err instanceof Error ? err.message : undefined);
    }
  };

  const applyImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await ImportApi.profile(true, file);
      if (res.applied) {
        toast.success('Profile imported', 'Your profile has been updated.');
        setFile(null);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
      } else if (res.error) {
        toast.error('Import failed', res.error);
      }
    } catch (err) {
      toast.error('Import failed', err instanceof Error ? err.message : undefined);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Your data" subtitle="Export everything or import a profile" />
      <CardBody className="space-y-5">
        <div>
          <Label>Export</Label>
          <div className="flex flex-wrap items-center gap-2">
            {exportItems.map((it) => (
              <a key={it.href} href={it.href} download>
                <Button variant="secondary" size="sm" leftIcon={<IconDownload className="h-4 w-4" />}>
                  {it.label}
                </Button>
              </a>
            ))}
            <a href={ExportLinks.allZip} download>
              <Button size="sm" leftIcon={<IconDownload className="h-4 w-4" />}>
                Everything (.zip)
              </Button>
            </a>
          </div>
        </div>

        <div className="h-px bg-[rgb(var(--border))]" />

        <div>
          <Label>Import profile</Label>
          <p className="mb-2 text-[12.5px] text-muted">Upload a profile JSON previously exported from JobPilot.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
              className="block text-[13px] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-[rgb(var(--surface-2))] file:px-3 file:py-2 file:text-[13px] file:font-medium file:text-[rgb(var(--text))] hover:file:bg-[rgb(var(--border))]"
            />
          </div>
          {preview?.preview && (
            <div className="mt-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3.5">
              <p className="text-[12.5px] font-medium">Preview</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
                {Object.entries(preview.preview).map(([k, v]) => (
                  <span key={k}>
                    {k.replace(/_/g, ' ')}: <span className="font-medium text-[rgb(var(--text))]">{v}</span>
                  </span>
                ))}
              </div>
              <Button className="mt-3" size="sm" loading={importing} onClick={applyImport} leftIcon={<IconUpload className="h-4 w-4" />}>
                Apply import
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ---------------- Security ----------------
function SecuritySection() {
  const { signout } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast.error('New password must be at least 8 characters');
    if (next !== confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await AuthApi.changePassword(current, next);
      toast.success('Password changed', 'Please sign in again.');
      await signout();
    } catch (err) {
      toast.error('Could not change password', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await AuthApi.deleteAccount();
      await signout();
    } catch (err) {
      toast.error('Could not delete account', err instanceof Error ? err.message : undefined);
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Account & security" subtitle="Change your password or delete your account" />
      <CardBody className="space-y-6">
        <form onSubmit={changePassword} className="grid gap-3 sm:max-w-md">
          <Field label="Current password">
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password">
              {(id) => (
                <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
              )}
            </Field>
            <Field label="Confirm">
              {(id) => (
                <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" loading={saving}>
              Change password
            </Button>
          </div>
        </form>

        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-500/20 dark:bg-red-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-danger">Delete account</p>
              <p className="text-[12.5px] text-muted">Permanently deletes your account and all data. This cannot be undone.</p>
            </div>
            <Button variant="danger" onClick={() => setShowDelete(true)} leftIcon={<IconTrash className="h-4 w-4" />}>
              Delete account
            </Button>
          </div>
        </div>
      </CardBody>

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={deleteAccount}
        title="Delete your account?"
        description="This permanently removes your profile, jobs, applications, and files. This action cannot be undone."
        confirmLabel="Delete everything"
        destructive
        loading={deleting}
      />
    </Card>
  );
}
