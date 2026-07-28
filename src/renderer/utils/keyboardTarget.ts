// Shared guard for global keydown handlers (App.tsx, PreviewPlayer.tsx,
// Timeline.tsx) so shortcuts like Space/S/+/- don't fire while the user is
// actually typing - covers text inputs, the audio-ducking <select>, and any
// contentEditable element (e.g. a future rich-text field).
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}
