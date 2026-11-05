// Composer page for the README gallery: exposes the page's own saved-image composer (composeImage
// in src/ui/screenshot.ts) as window.compose, so tests/gallery/readme.spec.ts can draw the labels
// of a CPU render into its pixels exactly as Save image draws them on the page.
import { composeImage, type SaveScene } from '../../src/ui/screenshot.ts';

/** The fields of a SaveScene, with the RGBA pixels as base64. */
export type ComposeRequest = Omit<SaveScene, 'rgba'> & { readonly rgba: string };

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

/** The composed image as PNG bytes, base64. */
async function compose(request: ComposeRequest): Promise<string> {
  const rgba = fromBase64(request.rgba);
  if (rgba.length !== request.width * request.height * 4) {
    throw new Error(
      `expected ${request.width * request.height * 4} RGBA bytes, got ${rgba.length}`,
    );
  }
  const blob = await composeImage({ ...request, rgba });
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

window.compose = compose;

declare global {
  interface Window {
    compose?: (request: ComposeRequest) => Promise<string>;
  }
}
