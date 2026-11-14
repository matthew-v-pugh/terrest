import { useRef, useState } from 'react';
import { BACKGROUNDS, TABLE_PRESETS } from '@shared/presets.js';
import {
  BACKGROUND_UPLOAD, TABLE_UPLOAD, backgroundCss, fitImage, tableCss,
} from '../game.js';

// A small preview of the whole scene: the background with the table on top.
function ScenePreview({ background, table }) {
  return (
    <div className="scene-preview" style={{ background: backgroundCss(background) }}>
      <div className="scene-preview-table" style={{ background: tableCss(table) }} />
    </div>
  );
}

function UploadTile({ layer, limits, onUpload, preview }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const selected = layer?.type === 'upload';

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onUpload({ type: 'upload', dataUrl: await fitImage(file, limits) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`scene-option upload${selected ? ' selected' : ''}`} onClick={() => fileRef.current?.click()} disabled={busy}>
      {selected ? preview : <div className="scene-upload-icon">+</div>}
      <span>{busy ? 'Processing…' : error || (selected ? 'Custom · replace' : 'Upload image')}</span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
    </button>
  );
}

// Lets the storyteller pick a background and a table, each from presets or an
// uploaded image. `onChange` receives only the layer that changed.
export default function ScenePicker({ scene, onChange }) {
  const isPreset = (layer, id) => layer?.type === 'preset' && layer.id === id;

  return (
    <div className="scene-picker">
      <ScenePreview background={scene.background} table={scene.table} />

      <h4>Background</h4>
      <div className="scene-grid">
        {BACKGROUNDS.map((b) => (
          <button
            type="button"
            key={b.id}
            className={`scene-option${isPreset(scene.background, b.id) ? ' selected' : ''}`}
            onClick={() => onChange({ background: { type: 'preset', id: b.id } })}
          >
            <ScenePreview background={{ type: 'preset', id: b.id }} table={scene.table} />
            <span>{b.label}</span>
          </button>
        ))}
        <UploadTile
          layer={scene.background}
          limits={BACKGROUND_UPLOAD}
          onUpload={(background) => onChange({ background })}
          preview={<ScenePreview background={scene.background} table={scene.table} />}
        />
      </div>

      <h4>Table</h4>
      <div className="scene-grid tables">
        {TABLE_PRESETS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`scene-option${isPreset(scene.table, t.id) ? ' selected' : ''}`}
            onClick={() => onChange({ table: { type: 'preset', id: t.id } })}
          >
            <div className="table-swatch" style={{ background: tableCss({ type: 'preset', id: t.id }) }} />
            <span>{t.label}</span>
          </button>
        ))}
        <UploadTile
          layer={scene.table}
          limits={TABLE_UPLOAD}
          onUpload={(table) => onChange({ table })}
          preview={<div className="table-swatch" style={{ background: tableCss(scene.table) }} />}
        />
      </div>
    </div>
  );
}
