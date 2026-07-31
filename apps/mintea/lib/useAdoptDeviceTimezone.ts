import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adoptDeviceTimezoneForNewHousehold, getDeviceTimeZone } from '@mintea/core';

import { useAuth } from './auth';

/**
 * Gives a brand-new household the device's time zone.
 *
 * Email signup sends the zone as signup metadata; an OAuth signup cannot carry
 * metadata, so the signup trigger falls back to UTC and every date in the app
 * would be keyed to a zone the user never picked.
 *
 * Runs once per app session and only acts on a household that has no accounts,
 * so a household someone deliberately set to UTC is never overwritten.
 */
export function useAdoptDeviceTimezone(): void {
  const { client, session } = useAuth();
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    // Called before the layout's auth gate so hook order stays stable, so it
    // has to wait for a session itself rather than assume one.
    if (!session || attempted.current) return;
    attempted.current = true;

    let active = true;

    adoptDeviceTimezoneForNewHousehold(client, getDeviceTimeZone())
      .then((changed) => {
        if (changed && active) queryClient.invalidateQueries();
      })
      // A failure here must not block the app; the zone stays editable in
      // Settings and every screen still renders.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [client, queryClient, session]);
}
