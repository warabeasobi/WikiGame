import { useRef, useState } from 'react';
import { downloadProfile, parseProfileFile, profileSummary } from '../lib/profile';
import { useProfile } from '../state/profile';

export function ProfilePanel() {
  const { profile, setProfile } = useProfile();
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  return (
    <div className="wr-profile">
      <div className="wr-profile__who">
        <b id="wr-p-name">{profile.name}</b>
        <span id="wr-p-meta">{profileSummary(profile)}</span>
      </div>
      <div className="btn-row">
        <button className="btn btn--secondary btn--sm" id="wr-export" type="button" onClick={() => downloadProfile(profile)}>
          Ekspor .json
        </button>
        <label className="btn btn--secondary btn--sm wr-load" htmlFor="wr-load">
          Muat .json
        </label>
        <input
          id="wr-load"
          type="file"
          accept="application/json,.json"
          hidden
          ref={fileInput}
          onChange={async event => {
            const file = event.target.files?.[0];
            setError(null);
            if (!file) return;
            try {
              setProfile(parseProfileFile(await file.text()));
            } catch (problem) {
              setError(problem instanceof Error ? problem.message : 'File itu tidak bisa dibaca.');
            }
            event.target.value = '';
          }}
        />
      </div>
      <p className="wr-err" id="wr-load-err" role="alert" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
