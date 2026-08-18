import { useEffect, type Dispatch, type SetStateAction } from 'react';

const NOTICE_TIMEOUT_MS = 10_000;

export function useNoticeTimeout<T>(notice: T | null, setNotice: Dispatch<SetStateAction<T | null>>) {
  useEffect(() => {
    if (notice === null) return;
    const timeout = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [notice, setNotice]);
}
