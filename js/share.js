import { serializeFreighter, deserializeFreighter } from './data.js';

/**
 * Share by link: the whole layout packed into the URL's #hash, so a link
 * opens it on any computer without a server (works on GitHub Pages too).
 *
 * The link holds the normal save format (serializeFreighter), deflated and
 * base64url-encoded. Opening one goes through deserializeFreighter, so the
 * same version check, migrations and safety checks as an imported file apply.
 */
const LINK_PREFIX = '#layout=';

// A full 14-floor layout is ~0.3 MB of JSON; anything far bigger isn't a layout
// (and a tiny link must not unpack into something huge)
const MAX_LAYOUT_BYTES = 2_000_000;

// The #hash part of a link that opens `freighter`
export async function layoutToHash(freighter) {
  const json = new TextEncoder().encode(serializeFreighter(freighter));
  return LINK_PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/**
 * The layout in a link's #hash, or null when the hash isn't a shared layout
 * @returns {Promise<{ freighter: object, skipped: number } | null>}
 * @throws {Error} with a user-facing message if the link is damaged or not usable
 */
export async function layoutFromHash(hash) {
  if (!hash.startsWith(LINK_PREFIX)) return null;

  let json;
  try {
    const bytes = fromBase64Url(hash.slice(LINK_PREFIX.length));
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_LAYOUT_BYTES));
  } catch {
    throw new Error('The link is incomplete or damaged (was it cut off when it was copied?).');
  }
  return deserializeFreighter(json);
}

// Runs bytes through a (de)compression stream; stops past `maxBytes` of output
async function pipe(bytes, stream, maxBytes = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Too large');
    }
    chunks.push(value);
  }
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
}

// Base64 with URL-safe characters (- and _ instead of + and /) and no padding
function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
