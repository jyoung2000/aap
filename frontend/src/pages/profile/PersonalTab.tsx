import type { ProfileOut, ProfileUpdate } from '@/api/types';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TextRow } from './fields';

export function PersonalTab({
  profile,
  onChange,
}: {
  profile: ProfileOut;
  onChange: (patch: ProfileUpdate) => void;
}) {
  const set = (key: keyof ProfileOut) => (v: string) => onChange({ [key]: v } as ProfileUpdate);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Contact" subtitle="Your name and how employers reach you" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextRow label="First name" value={profile.first_name} onChange={set('first_name')} placeholder="Jane" />
          <TextRow label="Last name" value={profile.last_name} onChange={set('last_name')} placeholder="Doe" />
          <TextRow label="Email" type="email" value={profile.email} onChange={set('email')} placeholder="jane@example.com" />
          <TextRow label="Phone" type="tel" value={profile.phone} onChange={set('phone')} placeholder="+1 555 000 1234" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Location" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextRow label="Address" value={profile.address} onChange={set('address')} placeholder="123 Market St" className="sm:col-span-2" />
          <TextRow label="City" value={profile.city} onChange={set('city')} />
          <TextRow label="State / Region" value={profile.state} onChange={set('state')} />
          <TextRow label="Postal code" value={profile.postal_code} onChange={set('postal_code')} />
          <TextRow label="Country" value={profile.country} onChange={set('country')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Links" subtitle="Profiles employers commonly ask for" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextRow label="LinkedIn" type="url" value={profile.linkedin_url} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/…" />
          <TextRow label="GitHub" type="url" value={profile.github_url} onChange={set('github_url')} placeholder="https://github.com/…" />
          <TextRow label="Portfolio" type="url" value={profile.portfolio_url} onChange={set('portfolio_url')} placeholder="https://…" />
          <TextRow label="Website" type="url" value={profile.website_url} onChange={set('website_url')} placeholder="https://…" />
        </CardBody>
      </Card>
    </div>
  );
}
