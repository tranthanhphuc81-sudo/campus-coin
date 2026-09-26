import { useState } from "react";

import { en } from "@/content/en";
import { useProfile, useUpdateProfile } from "@/features/profile/hooks";

export default function ProfilePage() {
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [saved, setSaved] = useState(false);

  if (profileQuery.isLoading) {
    return <p>{en.common.loadingLabel}</p>;
  }

  if (!profileQuery.data) {
    return <p role="alert">{en.profile.loadFailed}</p>;
  }

  return (
    <section className="profile-page" aria-labelledby="profile-page-title">
      <header className="page-header">
        <div>
          <h1 id="profile-page-title">{en.profile.title}</h1>
          <p>{en.profile.subtitle}</p>
        </div>
      </header>

      <div className="form-field">
        <div className="form-check form-switch">
          <input
            id="profile-ai-opt-in"
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={profileQuery.data.aiOptIn}
            disabled={updateProfile.isPending}
            aria-describedby="profile-ai-opt-in-description"
            onChange={(event) => {
              setSaved(false);
              updateProfile.mutate(
                { aiOptIn: event.target.checked },
                {
                  onSuccess: () => setSaved(true),
                },
              );
            }}
          />
          <label className="form-check-label" htmlFor="profile-ai-opt-in">
            {en.profile.aiSuggestionsLabel}
          </label>
        </div>
        <p id="profile-ai-opt-in-description">{en.profile.aiSuggestionsDescription}</p>
        {saved ? <p role="status">{en.profile.savedMessage}</p> : null}
        {updateProfile.isError ? <p role="alert">{en.profile.saveFailed}</p> : null}
      </div>
    </section>
  );
}
