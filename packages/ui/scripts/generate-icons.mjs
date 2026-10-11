import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { stdout } from 'node:process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assets = resolve(root, '../assets/icons');
const output = resolve(root, 'src/icons');
const files = (await readdir(assets)).filter((file) => file.endsWith('.svg')).sort();
const exports = [];
const exportLines = [];

function pascalCase(value) {
  return value.replace(/(^|-)([a-z])/gu, (_match, _separator, letter) => letter.toUpperCase());
}

function jsxChildren(svg) {
  const content = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/u)?.[1];
  if (!content) throw new Error('Icon SVG must have a root svg element.');
  const shapes = [
    ...content.matchAll(/<(circle|path|rect|line|polyline|polygon)\b([^>]*)\s*\/?\s*>/gu),
  ];
  if (shapes.length === 0) throw new Error('Icon SVG must contain supported shape elements.');

  return shapes
    .map(([, tag, rawAttributes]) => {
      const attributes = [...rawAttributes.matchAll(/([\w-]+)="([^"]*)"/gu)].map(
        ([, name, value]) => {
          const jsxName = name.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
          return `${jsxName}=${JSON.stringify(value)}`;
        }
      );
      return `<${tag} ${attributes.join(' ')} />`;
    })
    .join('\n      ');
}

await mkdir(output, { recursive: true });
for (const file of files) {
  const name = file.slice(0, -4);
  const component = `${pascalCase(name)}Icon`;
  const source = await readFile(resolve(assets, file), 'utf8');
  const children = jsxChildren(source);
  exports.push(component);
  exportLines.push(`export { ${component} } from './${name}.js';`);

  await writeFile(
    resolve(output, `${name}.tsx`),
    `import { useId, type SVGProps } from 'react';

export type ${component}Props = Omit<SVGProps<SVGSVGElement>, 'children' | 'title'> & {
  title?: string;
  size?: number | string;
};

export function ${component}({ size = 24, title, ...props }: ${component}Props) {
  const titleId = useId();
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      fill="none"
      height={size}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      ${children}
    </svg>
  );
}
`
  );
}

await writeFile(resolve(output, 'index.ts'), `${exportLines.join('\n')}\n`);
stdout.write(`Generated ${exports.length} individually importable typed React icons.\n`);
