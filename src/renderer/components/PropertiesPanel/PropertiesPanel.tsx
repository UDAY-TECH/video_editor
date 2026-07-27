import { useTimelineStore, findClip } from '../../state/timelineStore';
import { useMediaBinStore } from '../../state/mediaBinStore';
import { interpolateKeyframes } from '../../engine/keyframes';
import type { Keyframe, TextClipContent } from '@shared/types';

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
];

interface PropertyConfig {
  key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
  label: string;
  step: number;
  min?: number;
  max?: number;
}

const PROPERTIES: PropertyConfig[] = [
  { key: 'x', label: 'Position X', step: 1 },
  { key: 'y', label: 'Position Y', step: 1 },
  { key: 'scale', label: 'Scale', step: 0.01, min: 0 },
  { key: 'rotation', label: 'Rotation', step: 1 },
  { key: 'opacity', label: 'Opacity', step: 0.01, min: 0, max: 1 },
];

const MINI_TIMELINE_WIDTH = 180;

export function PropertiesPanel(): JSX.Element {
  const tracks = useTimelineStore((s) => s.tracks);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const updateClipTransform = useTimelineStore((s) => s.updateClipTransform);
  const setKeyframe = useTimelineStore((s) => s.setKeyframe);
  const removeKeyframe = useTimelineStore((s) => s.removeKeyframe);
  const clearKeyframesForProperty = useTimelineStore((s) => s.clearKeyframesForProperty);
  const updateClipVolume = useTimelineStore((s) => s.updateClipVolume);
  const clearVolumeKeyframes = useTimelineStore((s) => s.clearVolumeKeyframes);
  const updateTextContent = useTimelineStore((s) => s.updateTextContent);
  const assets = useMediaBinStore((s) => s.assets);

  const found = selectedClipId ? findClip(tracks, selectedClipId) : null;

  if (!found) {
    return (
      <div className="flex h-full flex-col bg-neutral-900 border-l border-neutral-800">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-800">
          Properties
        </div>
        <div className="flex-1 p-3 text-sm text-neutral-500">No clip selected.</div>
      </div>
    );
  }

  const { clip, track } = found;
  const localTime = Math.max(0, Math.min(playheadTime - clip.startTime, clip.duration));
  const asset = clip.mediaAssetId ? assets.find((a) => a.id === clip.mediaAssetId) : undefined;
  const hasAudio = !clip.text && (!asset || asset.type !== 'image');

  return (
    <div className="flex h-full flex-col bg-neutral-900 border-l border-neutral-800">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-800">
        Properties
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {track.locked && (
          <div className="text-xs text-yellow-500">Track is locked - properties are read-only.</div>
        )}
        {clip.text && (
          <TextContentSection
            text={clip.text}
            disabled={track.locked}
            onChange={(patch) => updateTextContent(clip.id, patch)}
          />
        )}
        {PROPERTIES.map((prop) => (
          <KeyframeablePropertyRow
            key={prop.key}
            label={prop.label}
            step={prop.step}
            min={prop.min}
            max={prop.max}
            baseValue={clip.transform[prop.key]}
            keyframes={clip.keyframes[prop.key] ?? []}
            localTime={localTime}
            clipDuration={clip.duration}
            disabled={track.locked}
            onChange={(value) => {
              const keyframes = clip.keyframes[prop.key];
              if (keyframes && keyframes.length > 0) {
                setKeyframe(clip.id, prop.key, localTime, value);
              } else {
                updateClipTransform(clip.id, { [prop.key]: value });
              }
            }}
            onToggleKeyframing={(currentValue) => {
              const keyframes = clip.keyframes[prop.key];
              if (keyframes && keyframes.length > 0) {
                clearKeyframesForProperty(clip.id, prop.key, currentValue);
              } else {
                setKeyframe(clip.id, prop.key, localTime, currentValue);
              }
            }}
            onRemoveKeyframe={(time) => removeKeyframe(clip.id, prop.key, time)}
          />
        ))}
        {hasAudio && (
          <KeyframeablePropertyRow
            label="Volume"
            step={0.01}
            min={0}
            max={1}
            baseValue={clip.volume}
            keyframes={clip.keyframes.volume ?? []}
            localTime={localTime}
            clipDuration={clip.duration}
            disabled={track.locked}
            onChange={(value) => {
              const keyframes = clip.keyframes.volume;
              if (keyframes && keyframes.length > 0) {
                setKeyframe(clip.id, 'volume', localTime, value);
              } else {
                updateClipVolume(clip.id, value);
              }
            }}
            onToggleKeyframing={(currentValue) => {
              const keyframes = clip.keyframes.volume;
              if (keyframes && keyframes.length > 0) {
                clearVolumeKeyframes(clip.id, currentValue);
              } else {
                setKeyframe(clip.id, 'volume', localTime, currentValue);
              }
            }}
            onRemoveKeyframe={(time) => removeKeyframe(clip.id, 'volume', time)}
          />
        )}
      </div>
    </div>
  );
}

function KeyframeablePropertyRow({
  label,
  step,
  min,
  max,
  baseValue,
  keyframes,
  localTime,
  clipDuration,
  disabled,
  onChange,
  onToggleKeyframing,
  onRemoveKeyframe,
}: {
  label: string;
  step: number;
  min?: number;
  max?: number;
  baseValue: number;
  keyframes: Keyframe[];
  localTime: number;
  clipDuration: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onToggleKeyframing: (currentValue: number) => void;
  onRemoveKeyframe: (time: number) => void;
}): JSX.Element {
  const hasKeyframes = keyframes.length > 0;
  const displayValue = hasKeyframes ? interpolateKeyframes(keyframes, localTime, baseValue) : baseValue;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-neutral-400 flex-1">{label}</span>
        <input
          type="number"
          className="w-20 bg-neutral-800 rounded px-1.5 py-0.5 text-xs text-right disabled:opacity-50"
          step={step}
          min={min}
          max={max}
          value={Math.round(displayValue * 1000) / 1000}
          disabled={disabled}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (Number.isFinite(value)) onChange(value);
          }}
        />
        <button
          className={`px-1.5 py-0.5 rounded text-xs ${
            hasKeyframes ? 'bg-blue-700 text-blue-100' : 'hover:bg-neutral-800 text-neutral-500'
          }`}
          disabled={disabled}
          onClick={() => onToggleKeyframing(displayValue)}
          title={
            hasKeyframes ? 'Remove all keyframes for this property' : 'Enable keyframing for this property'
          }
        >
          ◆
        </button>
      </div>
      {hasKeyframes && (
        <div className="relative h-4 bg-neutral-950 rounded" style={{ width: MINI_TIMELINE_WIDTH }}>
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: `${(localTime / (clipDuration || 1)) * 100}%` }}
          />
          {keyframes.map((kf) => (
            <button
              key={kf.time}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-blue-400 hover:bg-red-400"
              style={{ left: `${(kf.time / (clipDuration || 1)) * 100}%` }}
              title={`t=${kf.time.toFixed(2)}s, value=${kf.value.toFixed(2)} - click to remove`}
              onClick={() => onRemoveKeyframe(kf.time)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TextContentSection({
  text,
  disabled,
  onChange,
}: {
  text: TextClipContent;
  disabled: boolean;
  onChange: (patch: Partial<TextClipContent>) => void;
}): JSX.Element {
  const animationOptions: TextClipContent['entranceAnimation'][] = ['none', 'fade', 'slide'];

  return (
    <div className="space-y-2 pb-3 border-b border-neutral-800">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Text</span>

      <textarea
        className="w-full bg-neutral-800 rounded px-2 py-1 text-xs disabled:opacity-50 resize-none"
        rows={2}
        value={text.content}
        disabled={disabled}
        onChange={(e) => onChange({ content: e.target.value })}
      />

      <div className="flex items-center gap-2">
        <select
          className="flex-1 bg-neutral-800 rounded px-1.5 py-1 text-xs disabled:opacity-50"
          value={text.fontFamily}
          disabled={disabled}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="w-16 bg-neutral-800 rounded px-1.5 py-1 text-xs text-right disabled:opacity-50"
          value={text.fontSize}
          min={1}
          disabled={disabled}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (Number.isFinite(value)) onChange({ fontSize: value });
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          className="w-8 h-6 bg-neutral-800 rounded disabled:opacity-50"
          value={text.color}
          disabled={disabled}
          onChange={(e) => onChange({ color: e.target.value })}
        />
        <div className="flex-1 flex rounded overflow-hidden border border-neutral-700">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              className={`flex-1 py-1 text-xs ${
                text.align === align ? 'bg-neutral-700' : 'hover:bg-neutral-800'
              }`}
              disabled={disabled}
              onClick={() => onChange({ align })}
            >
              {align === 'left' ? '⯇' : align === 'center' ? '≡' : '⯈'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <label className="flex-1 flex items-center gap-1">
          Entrance
          <select
            className="flex-1 bg-neutral-800 rounded px-1.5 py-1 text-xs disabled:opacity-50"
            value={text.entranceAnimation}
            disabled={disabled}
            onChange={(e) =>
              onChange({ entranceAnimation: e.target.value as TextClipContent['entranceAnimation'] })
            }
          >
            {animationOptions.map((anim) => (
              <option key={anim} value={anim}>
                {anim}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 flex items-center gap-1">
          Exit
          <select
            className="flex-1 bg-neutral-800 rounded px-1.5 py-1 text-xs disabled:opacity-50"
            value={text.exitAnimation}
            disabled={disabled}
            onChange={(e) => onChange({ exitAnimation: e.target.value as TextClipContent['exitAnimation'] })}
          >
            {animationOptions.map((anim) => (
              <option key={anim} value={anim}>
                {anim}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
