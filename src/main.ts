// Entry point: start the WebGPU app, or explain why it cannot run.
import { startApp } from './ui/app.ts';
import { showUnsupported } from './ui/unsupported.ts';

const root = document.getElementById('app');
if (root) {
  startApp(root).catch((e: unknown) => {
    showUnsupported(
      root,
      `The renderer failed to start: ${e instanceof Error ? e.message : String(e)}`,
    );
  });
}
