import { useEffect, useState } from 'react';
import api from '../../services/api';
import { getInitials } from '../../utils/formatters';

/**
 * Shows a protected image (e.g. resident photo) fetched with the auth token.
 * Falls back to initials.
 */
export default function AuthImage({ src, name = '', className = 'h-16 w-16', reloadKey }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setUrl(null);
    if (src) {
      api
        .get(src, { responseType: 'blob' })
        .then((res) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(res.data);
          setUrl(objectUrl);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, reloadKey]);

  if (url) return <img src={url} alt={name} className={`${className} rounded-full object-cover`} />;
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-800`}>
      {getInitials(name) || '?'}
    </span>
  );
}
