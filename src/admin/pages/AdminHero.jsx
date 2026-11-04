import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  X,
  Film,
  Image as ImageIcon,
  Music,
  Smartphone,
  UploadCloud,
  Link2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
  Save,
} from 'lucide-react';
import {
  getHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  pickHeroFilm,
  isMp4Reference,
  isMp3Reference,
  isImageReference,
  heroMediaColumnsAvailable,
} from '../../services/hero';
import { uploadImage, deleteStorageFiles, cardImageUrl } from '../../lib/storage';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

/*
 * Admin → Hero Sections: the homepage's cinematic hero (a film, no text on the site).
 * The homepage plays the ACTIVE record with the LOWEST display order that has an MP4 film; with
 * none, the built-in film plays. Columns (services/hero.js):
 *   desktop film → image_url / image_path       poster → mobile_image_url / mobile_image_path
 *   label → title (admin only)                   subtitle → subtitle (admin note)
 *   mobile film → mobile_video_url / _path       music → audio_url / _path
 * The mobile film and music columns arrive with proposed migration 13; until then those fields
 * are shown as unavailable and are never sent.
 * Files go to the existing bucket's hero/ folder (lib/storage.js); nothing new is created.
 */

// One definition per media field: what it accepts and how it is stored in the form
const MEDIA_FIELDS = {
  film: {
    label: 'Desktop film',
    hint: 'MP4 (H.264), 16:9, up to 50 MB. Plays muted and looping.',
    icon: Film,
    accept: 'video/mp4',
    mimes: ['video/mp4'],
    urlKey: 'desktop_image',
    pathKey: 'desktop_image_path',
    slug: 'hero-film',
    check: isMp4Reference,
    typeLabel: 'an MP4 video',
    required: true,
  },
  mobileFilm: {
    label: 'Mobile film',
    hint: 'Optional lighter MP4 for phones (e.g. 720p portrait or 9:16), up to 50 MB.',
    icon: Smartphone,
    accept: 'video/mp4',
    mimes: ['video/mp4'],
    urlKey: 'mobile_video_url',
    pathKey: 'mobile_video_path',
    slug: 'hero-film-mobile',
    check: isMp4Reference,
    typeLabel: 'an MP4 video',
    needsMigration: true,
  },
  poster: {
    label: 'Poster image',
    hint: 'JPEG, PNG or WebP, ideally a still from the film. Shown while the film loads or if it cannot play.',
    icon: ImageIcon,
    accept: 'image/jpeg,image/png,image/webp',
    mimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    urlKey: 'mobile_image',
    pathKey: 'mobile_image_path',
    slug: 'hero-poster',
    check: isImageReference,
    typeLabel: 'a JPEG, PNG or WebP image',
  },
  music: {
    label: 'Background music',
    hint: 'Optional MP3, up to 15 MB. Visitors start it themselves with the gold music button.',
    icon: Music,
    accept: 'audio/mpeg,.mp3',
    mimes: ['audio/mpeg', 'audio/mp3'],
    urlKey: 'audio_url',
    pathKey: 'audio_path',
    slug: 'hero-music',
    check: isMp3Reference,
    typeLabel: 'an MP3 file',
    needsMigration: true,
  },
};

const EMPTY_FORM = {
  heading: '',
  subtitle: '',
  display_order: 1,
  is_active: true,
  desktop_image: '',
  desktop_image_path: '',
  mobile_image: '',
  mobile_image_path: '',
  mobile_video_url: '',
  mobile_video_path: '',
  audio_url: '',
  audio_path: '',
};

// Files this admin uploaded (timestamped names in hero/). Only these are ever deleted from
// Storage; the built-in film and files added by URL are never touched.
const ADMIN_UPLOAD = /^hero\/[^/]+-\d{13}(\.opt)?\.(mp4|mp3|webp|jpe?g|png)$/i;

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const fileNameOf = (ref) => decodeURIComponent(String(ref || '').split(/[?#]/)[0].split('/').pop() || '');

const allPaths = (record) =>
  Object.values(MEDIA_FIELDS)
    .map((f) => record?.[f.pathKey])
    .filter(Boolean);

/** One media field: preview, upload (click or drop) with progress, public URL, replace, remove. */
function MediaField({ field, value, path, fileInfo, upload, error, disabled, disabledReason, onFile, onUrl, onRemove }) {
  const def = MEDIA_FIELDS[field];
  const Icon = def.icon;
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const busy = upload?.state === 'uploading';

  const pickFile = (file) => {
    if (file && !disabled && !busy) onFile(field, file);
  };

  return (
    <div className={`ps-lx-upload${disabled ? ' is-disabled' : ''}`}>
      <div className="ps-lx-upload-head">
        <span className="ps-lx-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon size={15} color="var(--lux-gold-deep)" aria-hidden="true" />
          {def.label}
          {def.required ? ' *' : <small> (optional)</small>}
        </span>
        {value && !busy && !disabled && (
          <div className="ps-lx-actions" style={{ width: 'auto' }}>
            <label className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm" style={{ position: 'relative', overflow: 'hidden' }}>
              <RefreshCw size={13} aria-hidden="true" />
              <span>Replace</span>
              <input
                type="file"
                accept={def.accept}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
                aria-label={`Replace ${def.label}`}
              />
            </label>
            <button type="button" className="ps-lx-btn ps-lx-btn--danger ps-lx-btn--sm" onClick={() => onRemove(field)}>
              <Trash2 size={13} aria-hidden="true" />
              <span>Remove</span>
            </button>
          </div>
        )}
      </div>

      {disabled ? (
        <p className="ps-lx-hint" style={{ margin: 0 }}>{disabledReason}</p>
      ) : value ? (
        <>
          <div className="ps-lx-preview">
            {field === 'poster' ? (
              <img src={cardImageUrl(value)} alt="Poster preview" loading="lazy" decoding="async" />
            ) : field === 'music' ? (
              <audio src={value} controls preload="none" />
            ) : (
              <video src={value} controls muted playsInline preload="metadata" />
            )}
          </div>
          <div className="ps-lx-file-meta">
            <span className="ps-lx-file-name" title={value}>{fileInfo?.name || fileNameOf(path || value)}</span>
            <span>{fileInfo?.size ? formatBytes(fileInfo.size) : path ? 'Stored in hero/' : 'Public URL'}</span>
          </div>
        </>
      ) : (
        <div
          className={`ps-lx-upload-drop${dragging ? ' is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud size={22} aria-hidden="true" />
          <strong>{busy ? 'Uploading…' : 'Drop a file here or click to choose'}</strong>
          <span className="ps-lx-hint">{def.hint}</span>
          {!busy && (
            <input
              type="file"
              accept={def.accept}
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
              aria-label={`Upload ${def.label}`}
            />
          )}
        </div>
      )}

      {busy && (
        <div>
          <div className="ps-lx-file-meta" style={{ marginBottom: 6 }}>
            <span className="ps-lx-file-name">{upload.name}</span>
            <span>
              {upload.progress != null ? `${Math.round(upload.progress * 100)}% of ` : 'Optimising · '}
              {formatBytes(upload.size)}
            </span>
          </div>
          <div className="ps-lx-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.progress != null ? Math.round(upload.progress * 100) : undefined}>
            <span style={{ width: `${upload.progress != null ? Math.max(4, upload.progress * 100) : 35}%` }} />
          </div>
        </div>
      )}

      {!disabled && !busy && (
        urlOpen ? (
          <div className="ps-lx-url-row">
            <input
              type="url"
              className="ps-lx-input"
              placeholder="https://…"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              aria-label={`${def.label} public URL`}
            />
            <button
              type="button"
              className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm"
              onClick={() => {
                if (onUrl(field, urlDraft.trim())) {
                  setUrlOpen(false);
                  setUrlDraft('');
                }
              }}
            >
              Use URL
            </button>
            <button type="button" className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm" onClick={() => setUrlOpen(false)} aria-label="Cancel URL">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button type="button" className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setUrlOpen(true)}>
            <Link2 size={13} aria-hidden="true" />
            <span>{value ? 'Use a public URL instead' : 'Or enter a public URL'}</span>
          </button>
        )
      )}

      {error && <span className="ps-lx-field-error" role="alert">{error}</span>}
    </div>
  );
}

export default function AdminHero() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mediaColumns, setMediaColumns] = useState(true);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Editor
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null); // the record being edited, or null for a new one
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [uploads, setUploads] = useState({}); // field → { state, progress, name, size }
  const [fileInfo, setFileInfo] = useState({}); // field → { name, size } of files chosen now
  const [saving, setSaving] = useState(false);
  // Files uploaded while the editor is open (removed from Storage if the edit is cancelled)
  const sessionUploads = useRef(new Set());

  const isUploading = Object.values(uploads).some((u) => u.state === 'uploading');
  const isDirty = isOpen && JSON.stringify(form) !== JSON.stringify(initialForm);
  useUnsavedChangesGuard(isDirty || isUploading, 'This hero film is not saved yet. Leave without saving?');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [data, columns] = await Promise.all([getHeroSlides(false), heroMediaColumnsAvailable().catch(() => true)]);
      setSlides(data);
      setMediaColumns(columns);
    } catch (err) {
      setLoadError(err.message || 'Hero records could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const liveFilm = pickHeroFilm(slides);
  const sorted = useMemo(
    () => [...slides].sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    [slides]
  );

  // Escape closes the editor (with the same unsaved-changes question)
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeEditor();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const openEditor = (slide) => {
    const next = slide
      ? {
          heading: slide.heading || slide.title || '',
          subtitle: slide.subtitle || slide.eyebrow || '',
          display_order: slide.display_order || 1,
          is_active: slide.is_active !== false,
          desktop_image: slide.desktop_image || slide.image_url || '',
          desktop_image_path: slide.desktop_image_path || slide.image_path || '',
          mobile_image: slide.mobile_image || slide.mobile_image_url || '',
          mobile_image_path: slide.mobile_image_path || '',
          mobile_video_url: slide.mobile_video_url || '',
          mobile_video_path: slide.mobile_video_path || '',
          audio_url: slide.audio_url || '',
          audio_path: slide.audio_path || '',
        }
      : { ...EMPTY_FORM, display_order: slides.length + 1 };
    setEditing(slide || null);
    setForm(next);
    setInitialForm(next);
    setFieldErrors({});
    setFormError('');
    setUploads({});
    setFileInfo({});
    sessionUploads.current = new Set();
    setIsOpen(true);
  };

  // Uploaded files that end up unused are removed (best effort, admin uploads only)
  const removeUnused = async (paths, keepRecords) => {
    const inUse = new Set(keepRecords.flatMap(allPaths));
    const doomed = [...new Set(paths)].filter((p) => p && ADMIN_UPLOAD.test(p) && !inUse.has(p));
    if (doomed.length === 0) return;
    const res = await deleteStorageFiles(doomed);
    if (res.error) console.warn('Some unused hero files were not removed from Storage:', res.failed);
  };

  const closeEditor = (force = false) => {
    if (saving) return;
    if (!force && isUploading) {
      window.alert('Wait for the upload to finish.');
      return;
    }
    if (!force && isDirty && !window.confirm('Discard the changes to this hero film?')) return;
    // Files uploaded in this session and not saved are deleted again
    removeUnused([...sessionUploads.current], slides);
    sessionUploads.current = new Set();
    setIsOpen(false);
  };

  const setFieldError = (field, message) => setFieldErrors((prev) => ({ ...prev, [field]: message }));

  const handleFile = async (field, file) => {
    const def = MEDIA_FIELDS[field];
    const type = (file.type || '').toLowerCase();
    const extOk = def.check(file.name);
    setFieldError(field, '');
    if (!def.mimes.includes(type) && !(type === '' && extOk)) {
      setFieldError(field, `"${file.name}" is not ${def.typeLabel}.`);
      return;
    }
    setUploads((prev) => ({ ...prev, [field]: { state: 'uploading', progress: field === 'poster' ? null : 0, name: file.name, size: file.size } }));
    try {
      const { url, path, error } = await uploadImage(file, 'hero', def.slug, {
        onProgress: (p) => setUploads((prev) => ({ ...prev, [field]: { ...prev[field], progress: p } })),
      });
      if (error || !url) {
        setFieldError(field, `Upload failed: ${error || 'Storage did not return the uploaded file.'}`);
        return;
      }
      sessionUploads.current.add(path);
      setForm((prev) => ({ ...prev, [def.urlKey]: url, [def.pathKey]: path }));
      setFileInfo((prev) => ({ ...prev, [field]: { name: file.name, size: file.size } }));
    } catch (err) {
      setFieldError(field, `Upload failed: ${err.message || 'Storage error'}`);
    } finally {
      setUploads((prev) => ({ ...prev, [field]: { state: 'done' } }));
    }
  };

  const handleUrl = (field, url) => {
    const def = MEDIA_FIELDS[field];
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      setFieldError(field, 'Enter a full public https:// address.');
      return false;
    }
    if (!def.check(url)) {
      setFieldError(field, `The address must point to ${def.typeLabel} (ending in ${field === 'poster' ? '.jpg, .png or .webp' : field === 'music' ? '.mp3' : '.mp4'}).`);
      return false;
    }
    setFieldError(field, '');
    setForm((prev) => ({ ...prev, [def.urlKey]: url, [def.pathKey]: '' }));
    setFileInfo((prev) => ({ ...prev, [field]: null }));
    return true;
  };

  const handleRemove = (field) => {
    const def = MEDIA_FIELDS[field];
    setForm((prev) => ({ ...prev, [def.urlKey]: '', [def.pathKey]: '' }));
    setFileInfo((prev) => ({ ...prev, [field]: null }));
    setFieldError(field, '');
  };

  const validate = () => {
    const errors = {};
    if (!form.heading.trim()) errors.heading = 'Give this hero a label (for you; it is not shown on the site).';
    const order = Number(form.display_order);
    if (!Number.isInteger(order) || order < 1) errors.display_order = 'Use a whole number of 1 or more.';
    for (const [field, def] of Object.entries(MEDIA_FIELDS)) {
      const ref = form[def.pathKey] || form[def.urlKey];
      if (def.required && !ref) errors[field] = `${def.label} is required.`;
      else if (ref && !def.check(ref)) errors[field] = `${def.label} must be ${def.typeLabel}.`;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving || isUploading) return;
    setFormError('');
    if (!validate()) {
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        heading: form.heading.trim(),
        subtitle: form.subtitle.trim(),
        display_order: Number(form.display_order),
        is_active: form.is_active,
        desktop_image: form.desktop_image,
        desktop_image_path: form.desktop_image_path || null,
        mobile_image: form.mobile_image || null,
        mobile_image_path: form.mobile_image_path || null,
      };
      if (mediaColumns) {
        payload.mobile_video_url = form.mobile_video_url || null;
        payload.mobile_video_path = form.mobile_video_path || null;
        payload.audio_url = form.audio_url || null;
        payload.audio_path = form.audio_path || null;
      }
      const savedRecord = editing ? await updateHeroSlide(editing.id, payload) : await createHeroSlide(payload);
      const nextSlides = editing ? slides.map((s) => (s.id === editing.id ? savedRecord : s)) : [...slides, savedRecord];

      // Replaced or removed files of this record, and session uploads not kept, are deleted
      const kept = new Set(allPaths(form));
      const leftovers = [...allPaths(editing), ...sessionUploads.current].filter((p) => !kept.has(p));
      sessionUploads.current = new Set();
      await removeUnused(leftovers, nextSlides);

      setIsOpen(false);
      setNotice({ type: 'success', text: editing ? `"${payload.heading}" saved.` : `"${payload.heading}" added.` });
      await load();
    } catch (err) {
      setFormError(`Not saved: ${err.message || 'database error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slide) => {
    const label = slide.heading || slide.title || 'this hero film';
    if (!window.confirm(`Delete "${label}"? Its uploaded film, poster and music files are removed from Storage too, unless another hero uses them.`)) return;
    setBusyId(slide.id);
    setNotice(null);
    try {
      await deleteHeroSlide(slide.id);
      const remaining = slides.filter((s) => s.id !== slide.id);
      await removeUnused(allPaths(slide), remaining);
      setNotice({ type: 'success', text: `"${label}" deleted.` });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: `Not deleted: ${err.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle = async (slide) => {
    setBusyId(slide.id);
    setNotice(null);
    try {
      await updateHeroSlide(slide.id, { is_active: !slide.is_active });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: `Status not changed: ${err.message}` });
    } finally {
      setBusyId(null);
    }
  };

  // Swap positions; records sharing a display order are renumbered by their list position
  const handleMove = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[target];
    const same = Number(a.display_order) === Number(b.display_order);
    setBusyId(a.id);
    try {
      await updateHeroSlide(a.id, { display_order: same ? target + 1 : b.display_order });
      await updateHeroSlide(b.id, { display_order: same ? index + 1 : a.display_order });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: `Order not changed: ${err.message}` });
    } finally {
      setBusyId(null);
    }
  };

  const migrationNote = 'Available after database step 13 (proposed, not applied yet), which adds the mobile film and music columns.';

  return (
    <div className="ps-lx-page">
      <header className="ps-lx-header">
        <div>
          <span className="ps-lx-eyebrow">Homepage hero</span>
          <h1 className="ps-lx-title">Hero Sections</h1>
          <p className="ps-lx-subtitle">
            The cinematic film at the top of the homepage: it plays muted on its own, with the poster shown while it
            loads. Optional music starts only when a visitor presses the gold music button.
          </p>
        </div>
        <div className="ps-lx-actions">
          <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'ps-lx-spin' : ''} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button type="button" className="ps-lx-btn" onClick={() => openEditor(null)} disabled={loading || Boolean(loadError)}>
            <Plus size={15} aria-hidden="true" />
            <span>Add hero film</span>
          </button>
        </div>
      </header>

      {notice && (
        <div className={`ps-lx-alert ps-lx-alert--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}
          <div>{notice.text}</div>
        </div>
      )}

      {!loading && !loadError && (
        <div className="ps-lx-alert ps-lx-alert--info" role="status">
          <Info size={17} />
          <div>
            {liveFilm ? (
              <>
                <strong>Live on the homepage:</strong>{' '}
                {slides.find((s) => s.id === liveFilm.id)?.heading || 'untitled hero'} (the active hero with the lowest display order).
              </>
            ) : (
              <>
                <strong>The built-in film is playing.</strong> Add an active hero with an MP4 film to replace it.
              </>
            )}
            {!mediaColumns && <> Mobile film and music fields: {migrationNote}</>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="ps-lx-list" aria-busy="true">
          {[1, 2].map((n) => (
            <div key={n} className="ps-lx-skeleton" />
          ))}
        </div>
      ) : loadError ? (
        <div className="ps-lx-card">
          <div className="ps-lx-empty" role="alert">
            <AlertCircle size={30} aria-hidden="true" />
            <h3>Hero records could not be loaded</h3>
            <p>{loadError}</p>
            <button type="button" className="ps-lx-btn" onClick={load}>
              <RefreshCw size={15} aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="ps-lx-card">
          <div className="ps-lx-empty">
            <Film size={32} aria-hidden="true" />
            <h3>No hero films yet</h3>
            <p>The homepage plays its built-in film until you add one.</p>
            <button type="button" className="ps-lx-btn" onClick={() => openEditor(null)}>
              <Plus size={15} aria-hidden="true" />
              <span>Add hero film</span>
            </button>
          </div>
        </div>
      ) : (
        <ul className="ps-lx-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sorted.map((s, idx) => {
            const poster = s.mobile_image || s.mobile_image_url;
            const isLive = liveFilm?.id === s.id;
            return (
              <li key={s.id} className={`ps-lx-card ps-lx-row${s.is_active ? '' : ' is-muted'}`}>
                <span className="ps-lx-order">{s.display_order}</span>
                <div className="ps-lx-thumb">
                  {poster && isImageReference(s.mobile_image_path || poster) ? (
                    <img src={cardImageUrl(poster)} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <Film size={22} aria-hidden="true" />
                  )}
                </div>
                <div className="ps-lx-row-main">
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>{s.heading || s.title || 'Untitled hero'}</div>
                  {s.subtitle && <div className="ps-lx-muted">{s.subtitle}</div>}
                  <div className="ps-lx-tags">
                    {isLive && <span className="ps-lx-badge ps-lx-badge--live">Live</span>}
                    <span className={`ps-lx-badge ps-lx-badge--${s.is_active ? 'active' : 'hidden'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                    {!isMp4Reference(s.image_path || s.image_url) && <span className="ps-lx-badge ps-lx-badge--warn">No MP4 film</span>}
                    {s.mobile_video_url && <span className="ps-lx-badge ps-lx-badge--read">Mobile film</span>}
                    {s.audio_url && <span className="ps-lx-badge ps-lx-badge--read">Music</span>}
                  </div>
                </div>
                <div className="ps-lx-row-actions">
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--icon" onClick={() => handleMove(idx, -1)} disabled={idx === 0 || busyId !== null} aria-label="Move up">
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--icon" onClick={() => handleMove(idx, 1)} disabled={idx === sorted.length - 1 || busyId !== null} aria-label="Move down">
                    <ArrowDown size={15} />
                  </button>
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--icon" onClick={() => handleToggle(s)} disabled={busyId !== null} aria-label={s.is_active ? 'Deactivate' : 'Activate'} title={s.is_active ? 'Deactivate' : 'Activate'}>
                    {s.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm" onClick={() => openEditor(s)} disabled={busyId !== null}>
                    <Edit3 size={14} aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                  <button type="button" className="ps-lx-btn ps-lx-btn--danger ps-lx-btn--icon" onClick={() => handleDelete(s)} disabled={busyId !== null} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && (
        <div className="ps-lx-overlay" onClick={() => closeEditor()}>
          <form
            className="ps-lx-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-hero-editor-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSave}
            noValidate
          >
            <div className="ps-lx-modal-head">
              <div>
                <span className="ps-lx-eyebrow">{editing ? 'Edit hero' : 'New hero'}</span>
                <h2 id="ps-hero-editor-title" className="ps-lx-card-title" style={{ marginTop: 6 }}>
                  {editing ? form.heading || 'Hero film' : 'Add a hero film'}
                </h2>
              </div>
              <button type="button" className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--icon" onClick={() => closeEditor()} aria-label="Close" disabled={saving}>
                <X size={18} />
              </button>
            </div>

            <div className="ps-lx-modal-body">
              {formError && (
                <div className="ps-lx-alert ps-lx-alert--error" role="alert">
                  <AlertCircle size={17} />
                  <div>{formError}</div>
                </div>
              )}

              <div className="ps-lx-grid-2">
                <label className="ps-lx-field">
                  <span className="ps-lx-label">
                    Hero title <small>(admin label, not shown on the site)</small>
                  </span>
                  <input
                    type="text"
                    className={`ps-lx-input ps-lx-input--serif${fieldErrors.heading ? ' is-invalid' : ''}`}
                    value={form.heading}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, heading: e.target.value })}
                    placeholder="e.g. Ramadan collection film"
                  />
                  {fieldErrors.heading && <span className="ps-lx-field-error">{fieldErrors.heading}</span>}
                </label>
                <label className="ps-lx-field">
                  <span className="ps-lx-label">
                    Subtitle <small>(admin note)</small>
                  </span>
                  <input
                    type="text"
                    className="ps-lx-input"
                    value={form.subtitle}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                    placeholder="e.g. Shot in Kadapa, October"
                  />
                </label>
                <label className="ps-lx-field">
                  <span className="ps-lx-label">Display order</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className={`ps-lx-input${fieldErrors.display_order ? ' is-invalid' : ''}`}
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                  />
                  {fieldErrors.display_order ? (
                    <span className="ps-lx-field-error">{fieldErrors.display_order}</span>
                  ) : (
                    <span className="ps-lx-hint">The active hero with the lowest number plays.</span>
                  )}
                </label>
                <div className="ps-lx-field" style={{ justifyContent: 'center' }}>
                  <span className="ps-lx-label">Status</span>
                  <label className="ps-lx-switch">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    <span>{form.is_active ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
              </div>

              <div className="ps-lx-grid-2">
                {['film', 'mobileFilm', 'poster', 'music'].map((field) => {
                  const def = MEDIA_FIELDS[field];
                  return (
                    <MediaField
                      key={field}
                      field={field}
                      value={form[def.urlKey]}
                      path={form[def.pathKey]}
                      fileInfo={fileInfo[field]}
                      upload={uploads[field]}
                      error={fieldErrors[field]}
                      disabled={def.needsMigration && !mediaColumns}
                      disabledReason={migrationNote}
                      onFile={handleFile}
                      onUrl={handleUrl}
                      onRemove={handleRemove}
                    />
                  );
                })}
              </div>
            </div>

            <div className="ps-lx-modal-foot">
              <span className="ps-lx-muted">Files are stored in the media bucket, folder hero/.</span>
              <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={() => closeEditor()} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="ps-lx-btn" disabled={saving || isUploading} aria-busy={saving}>
                {saving ? <RefreshCw size={15} className="ps-lx-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                <span>{saving ? 'Saving…' : isUploading ? 'Uploading…' : editing ? 'Save changes' : 'Add hero film'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
