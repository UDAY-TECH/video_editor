import { useTimelineStore, findClip } from '../../state/timelineStore';
import { interpolateKeyframes } from '../../engine/keyframes';
import type { Clip } from '@shared/types';

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

  return (
    <div className="flex h-full flex-col bg-neutral-900 border-l border-neutral-800">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-800">
        Properties
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {track.locked && (
          <div className="text-xs text-yellow-500">Track is locked - properties are read-only.</div>
        )}
        {PROPERTIES.map((prop) => (
          <TransformPropertyRow
            key={prop.key}
            config={prop}
            clip={clip}
            localTime={localTime}
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
      </div>
    </div>
  );
}

function TransformPropertyRow({
  config,
  clip,
  localTime,
  disabled,
  onChange,
  onToggleKeyframing,
  onRemoveKeyframe,
}: {
  config: PropertyConfig;
  clip: Clip;
  localTime: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onToggleKeyframing: (currentValue: number) => void;
  onRemoveKeyframe: (time: number) => void;
}): JSX.Element {
  const keyframes = clip.keyframes[config.key] ?? [];
  const hasKeyframes = keyframes.length > 0;
  const baseValue = clip.transform[config.key];
  const displayValue = hasKeyframes ? interpolateKeyframes(keyframes, localTime, baseValue) : baseValue;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-neutral-400 flex-1">{config.label}</span>
        <input
          type="number"
          className="w-20 bg-neutral-800 rounded px-1.5 py-0.5 text-xs text-right disabled:opacity-50"
          step={config.step}
          min={config.min}
          max={config.max}
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
            style={{ left: `${(localTime / (clip.duration || 1)) * 100}%` }}
          />
          {keyframes.map((kf) => (
            <button
              key={kf.time}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-blue-400 hover:bg-red-400"
              style={{ left: `${(kf.time / (clip.duration || 1)) * 100}%` }}
              title={`t=${kf.time.toFixed(2)}s, value=${kf.value.toFixed(2)} - click to remove`}
              onClick={() => onRemoveKeyframe(kf.time)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
