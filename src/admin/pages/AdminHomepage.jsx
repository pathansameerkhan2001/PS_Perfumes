import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Save,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  LayoutTemplate,
  Info,
} from 'lucide-react';
import {
  getHomepageSections,
  saveHomepageLayout,
  restoreMissingDefaultSections,
  isSupportedSectionKey,
} from '../../services/homepage';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

// Sections whose subtitle is shown on the storefront (others ignore it)
const SUBTITLE_SECTIONS = new Set([
  'fragrance_categories',
  'new_arrivals',
  'featured_products',
  'bestsellers',
  'combos',
  'combo_pack',
  'instagram_reels',
  'reviews',
]);

// Readable names for the section keys
const SECTION_NAMES = {
  hero: 'Hero film',
  trust_strip: 'Announcement & benefits',
  fragrance_categories: 'Shop by Category',
  new_arrivals: 'New Arrivals',
  featured_products: 'Featured Products',
  bestsellers: 'Best Sellers',
  combos: 'Combo Packs',
  combo_pack: 'Combo Packs',
  instagram_reels: 'Instagram Reels',
  reviews: 'Customer Reviews',
};

const snapshot = (list) => JSON.stringify(list.map((s) => [s.id, s.title || '', s.subtitle || '', Boolean(s.is_active)]));
const byOrder = (list) => [...list].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

/*
 * Admin → Homepage: visibility, titles, subtitles and order of the homepage sections
 * (homepage_sections). Every edit stays a draft until "Save All Layouts"; "Reset" discards it.
 * While the table is empty the built-in layout is shown, and the first save creates the rows
 * from the edited draft (no separate step). The saved layout is read back from the database.
 */
export default function AdminHomepage() {
  const [saved, setSaved] = useState([]); // as stored (or the built-in layout)
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success' | 'error', text }

  const isBuiltIn = saved.length > 0 && saved.every((s) => s._default);
  const isDirty = useMemo(() => snapshot(draft) !== snapshot(saved), [draft, saved]);
  useUnsavedChangesGuard(isDirty, 'Your homepage changes are not saved yet. Leave without saving?');

  const applyLoaded = (list) => {
    const ordered = byOrder(list);
    setSaved(ordered);
    setDraft(ordered.map((s) => ({ ...s })));
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      applyLoaded(await getHomepageSections());
    } catch (err) {
      // Never show the built-in layout as if it were stored when the database could not answer
      setLoadError(err.message || 'The homepage layout could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (id, patch) => setDraft((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || !isDirty) return;
    setSaving(true);
    setNotice(null);
    try {
      // Stored values as they are, so a gap or tie in the stored order is also normalised to 1…n
      const savedById = Object.fromEntries(saved.map((s) => [s.id, s]));
      const fresh = await saveHomepageLayout(draft, savedById);
      applyLoaded(fresh);
      setNotice({
        type: 'success',
        text: isBuiltIn
          ? 'Homepage layout saved to the database. From now on every change here is kept.'
          : 'Homepage layout saved. The storefront shows it on the next page load.',
      });
    } catch (err) {
      // The draft stays as it is, so nothing typed is lost
      setNotice({ type: 'error', text: `Changes were not saved: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!isDirty) return;
    if (!window.confirm('Discard all unsaved changes and return to the last saved layout?')) return;
    setDraft(saved.map((s) => ({ ...s })));
    setNotice({ type: 'success', text: 'Unsaved changes discarded.' });
  };

  const handleReload = () => {
    if (isDirty && !window.confirm('Reloading discards your unsaved changes. Continue?')) return;
    setNotice(null);
    load();
  };

  // Adds built-in sections that are missing from the database; existing rows are untouched
  const handleRestoreMissing = async () => {
    if (isDirty) {
      setNotice({ type: 'error', text: 'Save or reset your changes first, then restore missing sections.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const added = await restoreMissingDefaultSections();
      if (added.length === 0) {
        setNotice({ type: 'success', text: 'All default sections are already present. Nothing was changed.' });
      } else {
        applyLoaded(await getHomepageSections());
        setNotice({
          type: 'success',
          text: `Added ${added.length} missing section${added.length > 1 ? 's' : ''}: ${added
            .map((s) => s.title || s.section_key)
            .join(', ')}. They were placed at the end; reorder them as needed.`,
        });
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const visibleCount = draft.filter((s) => s.is_active).length;

  return (
    <div className="ps-lx-page">
      <header className="ps-lx-header">
        <div>
          <span className="ps-lx-eyebrow">Storefront</span>
          <h1 className="ps-lx-title">Homepage Layout</h1>
          <p className="ps-lx-subtitle">
            Show or hide sections, rename them and set their order. Changes stay here until you save.
          </p>
        </div>
        <div className="ps-lx-actions">
          <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={handleReload} disabled={loading || saving}>
            <RefreshCw size={15} aria-hidden="true" />
            <span>Reload</span>
          </button>
          {!isBuiltIn && !loadError && (
            <button
              type="button"
              className="ps-lx-btn ps-lx-btn--secondary"
              onClick={handleRestoreMissing}
              disabled={loading || saving}
              title="Adds built-in sections that are missing, without changing existing ones"
            >
              <LayoutTemplate size={15} aria-hidden="true" />
              <span>Restore missing sections</span>
            </button>
          )}
          <button type="button" className="ps-lx-btn ps-lx-btn--secondary" onClick={handleReset} disabled={!isDirty || saving}>
            <RotateCcw size={15} aria-hidden="true" />
            <span>Reset</span>
          </button>
          <button type="button" className="ps-lx-btn" onClick={handleSave} disabled={!isDirty || saving || loading} aria-busy={saving}>
            {saving ? <RefreshCw size={15} className="ps-lx-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
            <span>{saving ? 'Saving…' : 'Save All Layouts'}</span>
          </button>
        </div>
      </header>

      {notice && (
        <div className={`ps-lx-alert ps-lx-alert--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}
          <div>{notice.text}</div>
        </div>
      )}

      {isBuiltIn && !loadError && (
        <div className="ps-lx-alert ps-lx-alert--info" role="status">
          <Info size={17} />
          <div>
            <strong>Built-in layout.</strong> No sections are stored in the database yet, so the homepage uses its
            default layout. Edit anything below and press <strong>Save All Layouts</strong>: the layout is then stored
            and every later change is kept.
          </div>
        </div>
      )}

      {loading ? (
        <div className="ps-lx-list" aria-busy="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="ps-lx-skeleton" />
          ))}
        </div>
      ) : loadError ? (
        <div className="ps-lx-card">
          <div className="ps-lx-empty" role="alert">
            <AlertCircle size={30} aria-hidden="true" />
            <h3>The homepage layout could not be loaded</h3>
            <p>{loadError}</p>
            <button type="button" className="ps-lx-btn" onClick={load}>
              <RefreshCw size={15} aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="ps-lx-muted" style={{ margin: 0 }}>
            {visibleCount} of {draft.length} sections visible · top to bottom as on the homepage
          </p>
          <ol className="ps-lx-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {draft.map((section, idx) => {
              const name = SECTION_NAMES[section.section_key] || String(section.section_key || '').replace(/_/g, ' ');
              return (
                <li key={section.id} className={`ps-lx-card ps-lx-row${section.is_active ? '' : ' is-muted'}`}>
                  <span className="ps-lx-order" aria-label={`Position ${idx + 1}`}>
                    {idx + 1}
                  </span>

                  <div className="ps-lx-row-main">
                    <div className="ps-lx-tags" style={{ marginTop: 0, marginBottom: 8 }}>
                      <span className="ps-lx-eyebrow" style={{ letterSpacing: '0.14em' }}>{name}</span>
                      <span className={`ps-lx-badge ps-lx-badge--${section.is_active ? 'active' : 'hidden'}`}>
                        {section.is_active ? 'Visible' : 'Hidden'}
                      </span>
                      {!isSupportedSectionKey(section.section_key) && (
                        <span className="ps-lx-badge ps-lx-badge--warn" title="This section has no storefront implementation; its content is kept but not displayed.">
                          Not shown on storefront
                        </span>
                      )}
                    </div>
                    <div className="ps-lx-grid-2">
                      <label className="ps-lx-field">
                        <span className="ps-lx-label">
                          Title {section.section_key === 'hero' && <small>(admin label only: the hero is a film)</small>}
                        </span>
                        <input
                          type="text"
                          className="ps-lx-input ps-lx-input--serif"
                          value={section.title || ''}
                          maxLength={120}
                          onChange={(e) => update(section.id, { title: e.target.value })}
                        />
                      </label>
                      {SUBTITLE_SECTIONS.has(section.section_key) && (
                        <label className="ps-lx-field">
                          <span className="ps-lx-label">
                            Subtitle <small>(optional)</small>
                          </span>
                          <input
                            type="text"
                            className="ps-lx-input"
                            value={section.subtitle || ''}
                            maxLength={200}
                            placeholder="Shown under the title"
                            onChange={(e) => update(section.id, { subtitle: e.target.value })}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="ps-lx-row-actions">
                    <label className="ps-lx-switch" title={section.is_active ? 'Hide this section' : 'Show this section'}>
                      <input
                        type="checkbox"
                        checked={Boolean(section.is_active)}
                        onChange={(e) => update(section.id, { is_active: e.target.checked })}
                        aria-label={`Show ${name} on the homepage`}
                      />
                      <span>{section.is_active ? 'On' : 'Off'}</span>
                    </label>
                    <button
                      type="button"
                      className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--icon"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0 || saving}
                      aria-label={`Move ${name} up`}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--icon"
                      onClick={() => move(idx, 1)}
                      disabled={idx === draft.length - 1 || saving}
                      aria-label={`Move ${name} down`}
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          {isDirty && (
            <div className="ps-lx-savebar" role="status">
              <span>You have unsaved changes.</span>
              <div className="ps-lx-actions" style={{ width: 'auto' }}>
                <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={handleReset} disabled={saving}>
                  Reset
                </button>
                <button type="button" className="ps-lx-btn" onClick={handleSave} disabled={saving} aria-busy={saving}>
                  {saving ? <RefreshCw size={15} className="ps-lx-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                  <span>{saving ? 'Saving…' : 'Save All Layouts'}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
