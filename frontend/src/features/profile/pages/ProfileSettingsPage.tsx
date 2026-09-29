/**
 * ProfileSettingsPage.tsx
 * Student profile & settings page (`/app/profile`): 4 tabs (Profile, Security, Appearance,
 * Privacy) built directly on top of the already-authenticated `useAuth().user` — no separate
 * `GET /me` query, since the auth-bootstrapped user is already the source of truth.
 * Exports: default (ProfileSettingsPage)
 * Spec: docs/spec/05a §5.2 (user profile) · docs/spec/07 §7.3.1 (`/me` endpoints)
 */
import { useState } from 'react';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import { PageHeader } from '../../../components/PageHeader';
import { en } from '../../../i18n/en';
import { AppearanceTab } from '../components/AppearanceTab';
import { PrivacyTab } from '../components/PrivacyTab';
import { ProfileTab } from '../components/ProfileTab';
import { SecurityTab } from '../components/SecurityTab';

/** Profile & settings page: profile fields, security, appearance and privacy tabs. */
export default function ProfileSettingsPage() {
  const [activeKey, setActiveKey] = useState('profile');

  return (
    <>
      <PageHeader title={en.nav.profile} />
      <Tabs
        activeKey={activeKey}
        onSelect={(key) => {
          if (key) setActiveKey(key);
        }}
        id="profile-settings-tabs"
        className="mb-3"
      >
        <Tab eventKey="profile" title={en.profileSettings.tabs.profile}>
          <ProfileTab />
        </Tab>
        <Tab eventKey="security" title={en.profileSettings.tabs.security}>
          <SecurityTab />
        </Tab>
        <Tab eventKey="appearance" title={en.profileSettings.tabs.appearance}>
          <AppearanceTab />
        </Tab>
        <Tab eventKey="privacy" title={en.profileSettings.tabs.privacy}>
          <PrivacyTab />
        </Tab>
      </Tabs>
    </>
  );
}
