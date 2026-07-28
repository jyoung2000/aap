import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProfileApi } from '@/api/endpoints';
import type { ProfileOut, ProfileUpdate } from '@/api/types';
import { useApi } from '@/hooks/useApi';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { SaveBadge, useAutosave } from './profile/shared';
import { PersonalTab } from './profile/PersonalTab';
import { StandardTab } from './profile/StandardTab';
import { ExperienceTab } from './profile/ExperienceTab';
import { EducationTab } from './profile/EducationTab';
import { RecommendationsTab } from './profile/RecommendationsTab';
import { FilesTab } from './profile/FilesTab';
import { CustomFieldsTab } from './profile/CustomFieldsTab';
import { SavedAnswersTab } from './profile/SavedAnswersTab';

const TABS = [
  { id: 'personal', label: 'Personal' },
  { id: 'standard', label: 'Standard fields' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'files', label: 'Files' },
  { id: 'custom', label: 'Custom fields' },
  { id: 'answers', label: 'Saved answers' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function Profile() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'personal';
  const tab: TabId = (TABS.find((t) => t.id === rawTab)?.id ?? 'personal') as TabId;

  const state = useApi<ProfileOut>(() => ProfileApi.get(), []);
  const [form, setForm] = useState<ProfileOut | null>(null);
  useEffect(() => {
    if (state.data) setForm(state.data);
  }, [state.data]);

  const { status, queue } = useAutosave<ProfileUpdate>((patch) => ProfileApi.update(patch));
  const update = useMemo(
    () => (patch: ProfileUpdate) => {
      setForm((f) => (f ? { ...f, ...patch } : f));
      queue(patch);
    },
    [queue],
  );

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next, { replace: true });
  };

  const usesAutosaveHeader = tab === 'personal' || tab === 'standard';

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Everything JobPilot uses to fill applications. Changes save automatically."
        actions={usesAutosaveHeader ? <SaveBadge status={status} /> : undefined}
      />

      {/* Tabs */}
      <div className="mb-5 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                tab === t.id
                  ? 'bg-accent-600 text-white shadow-soft'
                  : 'text-muted hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {state.loading || !form ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="animate-fade-in">
          {tab === 'personal' && <PersonalTab profile={form} onChange={update} />}
          {tab === 'standard' && <StandardTab profile={form} onChange={update} />}
          {tab === 'experience' && <ExperienceTab />}
          {tab === 'education' && <EducationTab />}
          {tab === 'recommendations' && <RecommendationsTab />}
          {tab === 'files' && <FilesTab onProfileChanged={() => state.reload()} />}
          {tab === 'custom' && <CustomFieldsTab />}
          {tab === 'answers' && <SavedAnswersTab />}
        </div>
      )}
    </div>
  );
}
