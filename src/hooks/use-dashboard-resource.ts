import { useCallback, useEffect, useState } from 'react';
import { ApiError, requestJson } from '@/features/gsc/api';

type Resource<T> = {
  url: string;
  revision: number;
  data: T | null;
  error: string | null;
};

/**
 * Identity includes the exact URL and refresh revision, so a previous site's
 * rows cannot appear under a new site/date heading. Cleanup aborts obsolete
 * requests; the abort flag also guards against late resolved responses.
 */
export function useDashboardResource<T>(
  url: string | null,
  onUnauthorized: () => void
) {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<Resource<T> | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!url) {
      // Release private rows on lock/navigation; this hook is not a report cache.
      setResource(null);
      return;
    }
    const controller = new AbortController();
    void requestJson<T>(url, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setResource({ url, revision, data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        else
          setResource({
            url,
            revision,
            data: null,
            error: error instanceof Error ? error.message : '无法读取数据。',
          });
      });
    return () => controller.abort();
  }, [url, revision, onUnauthorized]);
  const current =
    url && resource?.url === url && resource.revision === revision
      ? resource
      : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: Boolean(url && !current),
    refresh,
  };
}
