import { useEffect } from 'react';
import { APP_SHORT_NAME } from '../utils/constants';

/** Sets the browser tab title: "<title> | HostelMS". */
export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_SHORT_NAME}` : APP_SHORT_NAME;
  }, [title]);
}
