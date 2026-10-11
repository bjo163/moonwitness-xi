import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import ReactMarkdown from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

export type SearchPage = {
  title: string;
  kind: string;
  path: string;
  markdown: string;
  route: string;
  searchText: string;
};

export function MarkdownContent({
  page,
  resolveHref,
}: {
  page: SearchPage;
  resolveHref: (href: string | undefined) => string;
}) {
  return (
    <article className="document-content">
      <div className="document-meta">
        <span>{page.kind.replaceAll('-', ' ')}</span>
        <span aria-hidden="true">/</span>
        <code>{page.path}</code>
      </div>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ href, children, ...props }: ComponentProps<'a'>) => {
            const destination = resolveHref(href);
            if (destination.startsWith(`${import.meta.env.BASE_URL}guide/`)) {
              return <Link to={destination}>{children}</Link>;
            }
            return (
              <a href={destination} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h1 className="document-title">{children}</h1>,
          pre: ({ children }) => <pre className="code-block">{children}</pre>,
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {page.markdown}
      </ReactMarkdown>
    </article>
  );
}
