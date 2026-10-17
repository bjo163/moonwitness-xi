import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpenCheck, Save } from 'lucide-react';
import {
  NotFoundError,
  type StoryPageDocument,
  type StoryVersionDocument,
} from '@moonwitness/client';
import { useAuth } from '@/hooks/use-auth-context';
import { client } from '@/lib/client';
import { Button } from '@moonwitness/ui/components/button';

const storyId = 'mw:story:editorial-sample';
const initialPage: StoryPageDocument = {
  page_id: 'mw:story-page:editorial-sample-1',
  page_order: 1,
  original_text: '',
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save this story revision.';
}

export function StoryWorkbenchPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [pagesDraft, setPagesDraft] = useState<StoryPageDocument[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState(initialPage.page_id);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const storyQuery = useQuery({
    queryKey: ['story-workbench', client.getCompanyId(), storyId],
    queryFn: () => client.getStoryVersion(storyId),
    enabled:
      (user?.role === 'user' || user?.role === 'superadmin') && Boolean(client.getCompanyId()),
    retry: false,
  });
  const current = storyQuery.data;
  const storyIsMissing = storyQuery.error instanceof NotFoundError;

  if (user?.role !== 'user' && user?.role !== 'superadmin') {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-3xl">Story workbench</h1>
        <p className="mt-4">A tenant user or superadmin role is required.</p>
      </main>
    );
  }

  const pages = pagesDraft ?? current?.story.pages ?? [initialPage];
  const selectedPage = pages.find((page) => page.page_id === selectedPageId) ?? pages[0]!;
  const value = draft ?? selectedPage.original_text;
  const nextVersion = (current?.version ?? 0) + 1;

  async function saveRevision() {
    setSaving(true);
    setError('');
    setNotice('');
    const story: StoryVersionDocument = {
      schema_version: 1,
      story_id: storyId,
      version: nextVersion,
      title: current?.story.title ?? 'Editorial sample',
      visibility: 'INTERNAL',
      pages: pages.map((page, index) => ({
        ...page,
        page_order: index + 1,
        original_text: page.page_id === selectedPage.page_id ? value : page.original_text,
      })),
    };
    try {
      const saved = await client.storeStoryVersion(story);
      setDraft(null);
      setPagesDraft(null);
      setSelectedPageId(saved.story.pages[0]?.page_id ?? initialPage.page_id);
      setNotice(`Saved immutable revision ${saved.version} (${saved.digest.slice(0, 12)}…).`);
      await storyQuery.refetch();
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setSaving(false);
    }
  }

  function addPage() {
    const pageId = `mw:story-page:${crypto.randomUUID()}`;
    const nextPages = [
      ...pages,
      { page_id: pageId, page_order: pages.length + 1, original_text: '' },
    ];
    setPagesDraft(nextPages);
    setSelectedPageId(pageId);
    setDraft(null);
  }

  function removeSelectedPage() {
    if (pages.length <= 1) return;
    const nextPages = pages
      .filter((page) => page.page_id !== selectedPage.page_id)
      .map((page, index) => ({ ...page, page_order: index + 1 }));
    setPagesDraft(nextPages);
    setSelectedPageId(nextPages[0]!.page_id);
    setDraft(null);
  }

  function moveSelectedPage(direction: -1 | 1) {
    const index = pages.findIndex((page) => page.page_id === selectedPage.page_id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= pages.length) return;
    const nextPages = [...pages];
    [nextPages[index], nextPages[nextIndex]] = [nextPages[nextIndex]!, nextPages[index]!];
    setPagesDraft(nextPages.map((page, pageIndex) => ({ ...page, page_order: pageIndex + 1 })));
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-5 sm:p-8">
      <header className="ink-panel space-y-3 bg-card p-6">
        <div className="flex items-center gap-3">
          <BookOpenCheck aria-hidden="true" className="size-6 text-lime-700 dark:text-lime" />
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            K8 · Editorial
          </p>
        </div>
        <h1 className="font-display text-3xl uppercase sm:text-4xl">Story workbench</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          Edit and arrange the pages of an internal story. Saving appends an immutable revision;
          previous text remains available by version. This workbench does not publish content or
          upload media.
        </p>
      </header>
      <section
        className="ink-panel space-y-4 bg-card p-5 sm:p-6"
        aria-labelledby="story-editor-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="story-editor-title" className="font-display text-xl uppercase">
              Editorial sample
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-ink-faint">{storyId}</p>
          </div>
          <p className="font-mono text-xs uppercase text-ink-faint">
            {current ? `Current v${current.version}` : 'New story'} · next v{nextVersion}
          </p>
        </div>
        <div
          role="note"
          className="flex gap-3 border-2 border-amber-700/50 bg-amber-100/50 p-3 text-sm text-ink dark:bg-amber-950/20"
        >
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
          <p>
            INTERNAL only. Keep this example synthetic. Public rendering, story publishing, and
            media uploads are unavailable. If a no-face style is requested, record it as editorial
            guidance, not as epistemic data.
          </p>
        </div>
        {storyQuery.isLoading && <p role="status">Loading latest revision…</p>}
        {storyQuery.isError && (
          <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <p>
              {storyIsMissing
                ? 'No saved sample is available in this company yet. Saving creates its first revision.'
                : 'Could not confirm the saved story state. Your draft is kept; retry before saving.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void storyQuery.refetch()}
              disabled={storyQuery.isFetching}
            >
              {storyQuery.isFetching ? 'Retrying…' : 'Retry loading story'}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 font-mono text-xs uppercase tracking-wider text-ink-faint">
            <span className="mb-1 block">Story page</span>
            <select
              aria-label="Story page"
              value={selectedPage.page_id}
              onChange={(event) => {
                setSelectedPageId(event.currentTarget.value);
                setDraft(null);
              }}
              className="w-full border-2 border-ink/30 bg-paper p-2 text-sm text-ink"
            >
              {pages.map((page, index) => (
                <option key={page.page_id} value={page.page_id}>
                  Page {index + 1}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" onClick={addPage} disabled={pages.length >= 100}>
            Add page
          </Button>
          <Button
            type="button"
            onClick={() => moveSelectedPage(-1)}
            disabled={pages[0]?.page_id === selectedPage.page_id}
          >
            Move up
          </Button>
          <Button
            type="button"
            onClick={() => moveSelectedPage(1)}
            disabled={pages.at(-1)?.page_id === selectedPage.page_id}
          >
            Move down
          </Button>
          <Button type="button" onClick={removeSelectedPage} disabled={pages.length <= 1}>
            Remove page
          </Button>
        </div>
        <label
          htmlFor="story-page-text"
          className="block font-mono text-xs uppercase tracking-wider text-ink-faint"
        >
          Page text · exact whitespace is preserved
        </label>
        <textarea
          id="story-page-text"
          value={value}
          onChange={(event) => {
            const nextText = event.currentTarget.value;
            setDraft(nextText);
            setPagesDraft(
              pages.map((page) =>
                page.page_id === selectedPage.page_id ? { ...page, original_text: nextText } : page
              )
            );
          }}
          rows={12}
          maxLength={1000000}
          spellCheck={false}
          className="min-h-64 w-full resize-y border-2 border-ink/30 bg-paper p-4 font-mono text-sm leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          aria-describedby="story-page-help"
        />
        <p id="story-page-help" className="text-xs text-ink-faint">
          The API stores the editor value without trimming. Browsers normalize textarea line endings
          to LF; other whitespace is preserved.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void saveRevision()}
            disabled={saving || storyQuery.isLoading || (storyQuery.isError && !storyIsMissing)}
          >
            <Save aria-hidden="true" className="mr-2 size-4" />
            {saving ? 'Saving…' : `Save revision ${nextVersion}`}
          </Button>
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </section>
      {current && (
        <section className="ink-panel bg-card p-5">
          <h2 className="font-display text-lg uppercase">Latest revision integrity</h2>
          <dl className="mt-3 grid gap-2 font-mono text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-ink-faint">Version</dt>
            <dd>{current.version}</dd>
            <dt className="text-ink-faint">SHA-256</dt>
            <dd className="break-all">{current.digest}</dd>
            <dt className="text-ink-faint">Visibility</dt>
            <dd>{current.visibility}</dd>
          </dl>
        </section>
      )}
    </main>
  );
}
