import { useNavigate, useParams } from 'react-router';
import { useViews } from '@/hooks/use-model';
import { Skeleton } from '@/components/ui/skeleton';
import { Doodle } from '@/components/manga/effects';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { ListView } from '@/components/views/list-view';
import { FormView } from '@/components/views/form-view';

export function ModelPage() {
  const { model = '', id } = useParams<{ model: string; id?: string }>();
  const navigate = useNavigate();
  const { data: views, isLoading, error } = useViews(model);

  const isCreate = id === 'new';
  const isEdit = !isCreate && Boolean(id);
  const recordId = isEdit && id ? parseInt(id, 10) : undefined;

  const breadcrumbs = views
    ? [
        {
          label: views.title,
          to: id ? `/m/${model}` : undefined,
        },
        ...(isCreate ? [{ label: 'New Record' }] : []),
        ...(isEdit ? [{ label: `#${id}` }] : []),
      ]
    : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48 bg-ink/10" />
        <Skeleton className="h-14 w-72 bg-ink/10" />
        <Skeleton className="h-96 w-full bg-ink/10" />
      </div>
    );
  }

  if (error || !views) {
    return (
      <div className="ink-panel p-12 text-center bg-card">
        <Doodle kind="star" className="mx-auto size-10 text-pink mb-4" />
        <h2 className="font-display text-2xl uppercase">Failed to load model views</h2>
        <p className="mt-2 text-ink-soft">
          Model &apos;{model}&apos; might not exist or you do not have permission to view it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={breadcrumbs} />

      {isCreate ? (
        <FormView
          model={model}
          views={views}
          onBack={() => navigate(`/m/${model}`)}
          onSaved={(newId) => navigate(`/m/${model}/${newId}`, { replace: true })}
        />
      ) : isEdit && recordId !== undefined && !Number.isNaN(recordId) ? (
        <FormView
          model={model}
          views={views}
          recordId={recordId}
          onBack={() => navigate(`/m/${model}`)}
        />
      ) : (
        <ListView
          model={model}
          views={views}
          onOpenRecord={(recId) => navigate(`/m/${model}/${recId}`)}
          onCreateRecord={() => navigate(`/m/${model}/new`)}
        />
      )}
    </div>
  );
}
