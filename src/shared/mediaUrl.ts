// Local media files are served to the renderer through a custom `media://`
// protocol (registered in main) rather than raw `file://`, so playback works
// under the default (secure) webSecurity setting. Both processes use these
// helpers to keep the encoding consistent.

export function toMediaUrl(filePath: string): string {
  return `media://local/${encodeURIComponent(filePath)}`;
}

export function fromMediaUrl(url: string): string {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.slice(1));
}
