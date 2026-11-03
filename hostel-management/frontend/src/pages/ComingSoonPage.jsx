import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import useDocumentTitle from '../hooks/useDocumentTitle';

/** Placeholder for modules that are scheduled for a later development chunk. */
export default function ComingSoonPage({ title, chunk, icon }) {
  useDocumentTitle(title);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={title} breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: title }]} />
      <Card>
        <EmptyState
          icon={icon || Construction}
          title={`${title} module is coming soon`}
          message={`This module is scheduled for CHUNK ${chunk} of the development plan.`}
          action={
            <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              Back to dashboard
            </Link>
          }
        />
      </Card>
    </div>
  );
}
