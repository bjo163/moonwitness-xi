export function isDocumentationContent(filePath) {
  return (
    filePath === 'README.md' ||
    filePath === 'ROADMAP.md' ||
    (filePath.startsWith('docs/') && filePath.toLowerCase().endsWith('.md'))
  );
}

export function classifyDocumentationFiles(files) {
  return {
    docsOnly:
      files.length > 0 &&
      files.every(({ path, previousPath }) =>
        [path, previousPath].filter(Boolean).every(isDocumentationContent)
      ),
    files,
  };
}
