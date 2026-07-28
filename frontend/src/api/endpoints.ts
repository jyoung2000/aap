import { api, qs, request } from './client';
import type {
  ApplicationCreate,
  ApplicationOut,
  CustomField,
  CustomFieldIn,
  DashboardOut,
  DeviceOut,
  Education,
  EducationIn,
  ExtensionInfo,
  FunnelOut,
  FunnelStatus,
  ImportJobsResult,
  ImportProfileResult,
  InterventionAnswer,
  InterventionOut,
  JobOut,
  JobListItem,
  JobQuery,
  PairingOut,
  ParseResult,
  ProfileFileOut,
  ProfileOut,
  ProfileUpdate,
  Recommendation,
  RecommendationIn,
  SavedAnswer,
  SavedAnswerIn,
  SearchCreate,
  SearchOut,
  UserOut,
  UserSettingsUpdate,
  WorkExperience,
  WorkExperienceIn,
} from './types';

// ---------------- Auth ----------------
export const AuthApi = {
  signup: (email: string, password: string) =>
    api.post<UserOut>('/api/auth/signup', { email, password }),
  signin: (email: string, password: string) =>
    api.post<UserOut>('/api/auth/signin', { email, password }),
  signout: () => api.post<null>('/api/auth/signout'),
  // The initial probe must not hard-redirect on 401 — RequireAuth routes instead.
  me: () => request<UserOut>('/api/auth/me', { method: 'GET', skipAuthRedirect: true }),
  updateSettings: (patch: UserSettingsUpdate) => api.patch<UserOut>('/api/auth/me', patch),
  changePassword: (current_password: string, new_password: string) =>
    api.post<null>('/api/auth/change-password', { current_password, new_password }),
  deleteAccount: () => api.del<null>('/api/auth/me'),
};

// ---------------- Profile ----------------
export const ProfileApi = {
  get: () => api.get<ProfileOut>('/api/profile'),
  update: (patch: ProfileUpdate) => api.patch<ProfileOut>('/api/profile', patch),

  listExperience: () => api.get<WorkExperience[]>('/api/profile/experience'),
  addExperience: (body: WorkExperienceIn) =>
    api.post<WorkExperience>('/api/profile/experience', body),
  updateExperience: (id: string, body: WorkExperienceIn) =>
    api.put<WorkExperience>(`/api/profile/experience/${id}`, body),
  deleteExperience: (id: string) => api.del<null>(`/api/profile/experience/${id}`),
  reorderExperience: (ordered_ids: string[]) =>
    api.post<null>('/api/profile/experience/reorder', { ordered_ids }),

  listEducation: () => api.get<Education[]>('/api/profile/education'),
  addEducation: (body: EducationIn) => api.post<Education>('/api/profile/education', body),
  updateEducation: (id: string, body: EducationIn) =>
    api.put<Education>(`/api/profile/education/${id}`, body),
  deleteEducation: (id: string) => api.del<null>(`/api/profile/education/${id}`),

  listRecommendations: () => api.get<Recommendation[]>('/api/profile/recommendations'),
  addRecommendation: (body: RecommendationIn) =>
    api.post<Recommendation>('/api/profile/recommendations', body),
  updateRecommendation: (id: string, body: RecommendationIn) =>
    api.put<Recommendation>(`/api/profile/recommendations/${id}`, body),
  deleteRecommendation: (id: string) => api.del<null>(`/api/profile/recommendations/${id}`),

  listCustomFields: () => api.get<CustomField[]>('/api/profile/custom-fields'),
  addCustomField: (body: CustomFieldIn) => api.post<CustomField>('/api/profile/custom-fields', body),
  updateCustomField: (id: string, body: CustomFieldIn) =>
    api.put<CustomField>(`/api/profile/custom-fields/${id}`, body),
  deleteCustomField: (id: string) => api.del<null>(`/api/profile/custom-fields/${id}`),

  listSavedAnswers: (q = '') => api.get<SavedAnswer[]>(`/api/profile/saved-answers${qs({ q })}`),
  addSavedAnswer: (body: SavedAnswerIn) => api.post<SavedAnswer>('/api/profile/saved-answers', body),
  updateSavedAnswer: (id: string, body: SavedAnswerIn) =>
    api.put<SavedAnswer>(`/api/profile/saved-answers/${id}`, body),
  deleteSavedAnswer: (id: string) => api.del<null>(`/api/profile/saved-answers/${id}`),

  listFiles: () => api.get<ProfileFileOut[]>('/api/profile/files'),
  uploadFile: (kind: string, is_default: boolean, file: File) => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('is_default', String(is_default));
    form.set('file', file);
    return api.upload<ProfileFileOut>('/api/profile/files', form);
  },
  setDefaultFile: (id: string) => api.post<ProfileFileOut>(`/api/profile/files/${id}/default`),
  parseFile: (id: string) => api.post<ParseResult>(`/api/profile/files/${id}/parse`),
  applyParsed: () => api.post<ProfileOut>('/api/profile/parsed/apply'),
  deleteFile: (id: string) => api.del<null>(`/api/profile/files/${id}`),
};

// ---------------- Search / Jobs ----------------
export const SearchApi = {
  create: (body: SearchCreate) => api.post<SearchOut>('/api/search', body),
  list: () => api.get<SearchOut[]>('/api/search'),
  get: (id: string) => api.get<SearchOut>(`/api/search/${id}`),
};

export const JobsApi = {
  list: (query: JobQuery = {}) => api.get<JobListItem[]>(`/api/jobs${qs({ ...query })}`),
  get: (id: string) => api.get<JobOut>(`/api/jobs/${id}`),
  remove: (id: string) => api.del<null>(`/api/jobs/${id}`),
};

// ---------------- Applications ----------------
export const ApplicationsApi = {
  create: (body: ApplicationCreate) => api.post<ApplicationOut[]>('/api/applications', body),
  list: (params: { status?: string; funnel?: string } = {}) =>
    api.get<ApplicationOut[]>(`/api/applications${qs({ ...params })}`),
  get: (id: string) => api.get<ApplicationOut>(`/api/applications/${id}`),
  retry: (id: string) => api.post<ApplicationOut>(`/api/applications/${id}/retry`),
  skip: (id: string) => api.post<ApplicationOut>(`/api/applications/${id}/skip`),
  setFunnel: (id: string, funnel_status: FunnelStatus) =>
    api.patch<ApplicationOut>(`/api/applications/${id}/funnel`, { funnel_status }),
};

export const QueueApi = {
  list: () => api.get<InterventionOut[]>('/api/queue'),
  answer: (id: string, body: InterventionAnswer) =>
    api.post<InterventionOut>(`/api/interventions/${id}/answer`, body),
};

// ---------------- Extension ----------------
export const ExtensionApi = {
  pairingCode: () => api.post<PairingOut>('/api/extension/pairing-code'),
  devices: () => api.get<DeviceOut[]>('/api/extension/devices'),
  revokeDevice: (id: string) => api.del<null>(`/api/extension/devices/${id}`),
  info: () => api.get<ExtensionInfo>('/api/extension/info'),
};

// ---------------- Analytics ----------------
export const AnalyticsApi = {
  dashboard: () => api.get<DashboardOut>('/api/analytics/dashboard'),
  funnel: () => api.get<FunnelOut>('/api/analytics/funnel'),
};

// ---------------- Import ----------------
export const ImportApi = {
  profile: (apply: boolean, file: File) => {
    const form = new FormData();
    form.set('apply', String(apply));
    form.set('file', file);
    return api.upload<ImportProfileResult>('/api/import/profile', form);
  },
  jobs: (mapping: Record<string, string>, file: File) => {
    const form = new FormData();
    form.set('mapping', JSON.stringify(mapping));
    form.set('file', file);
    return api.upload<ImportJobsResult>('/api/import/jobs', form);
  },
};

// Export links (direct download hrefs).
export const ExportLinks = {
  jobsCsv: '/api/export/jobs.csv',
  jobsJson: '/api/export/jobs.json',
  profileJson: '/api/export/profile.json',
  applicationsCsv: '/api/export/applications.csv',
  allZip: '/api/export/all.zip',
};
