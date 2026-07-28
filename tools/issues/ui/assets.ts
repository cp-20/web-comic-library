import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type UiAssets = Readonly<{
  script: string;
  styles: string;
}>;

let cachedAssets: Promise<UiAssets> | null = null;

const buildAssets = async (): Promise<UiAssets> => {
  const entrypoint = join(import.meta.dir, 'app.ts');
  const [styles, build] = await Promise.all([
    readFile(join(import.meta.dir, 'styles.css'), 'utf8'),
    Bun.build({
      entrypoints: [entrypoint],
      format: 'esm',
      minify: false,
      sourcemap: 'none',
      target: 'browser',
    }),
  ]);
  if (!build.success) {
    throw new Error(
      `failed to build issue browser UI: ${build.logs.map((log) => log.message).join('; ')}`,
    );
  }
  const output = build.outputs[0];
  if (!output) throw new Error('issue browser UI build produced no output');
  return { script: await output.text(), styles };
};

export const loadUiAssets = (): Promise<UiAssets> => {
  cachedAssets ??= buildAssets();
  return cachedAssets;
};
