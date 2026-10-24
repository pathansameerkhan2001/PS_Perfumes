import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, FolderOpen, ImagePlus, Upload, AlertTriangle } from 'lucide-react';
import { getProducts } from '../../services/products';
import { getCategories } from '../../services/categories';
import { formatINR } from '../../utils/formatCurrency';
import { readSpreadsheet } from '../import/parseSpreadsheet';
import {
  IMPORT_FIELDS,
  DEFAULT_SUFFIXES,
  TYPE_LABEL,
  IMAGE_ROLE_LABEL,
  findHeaderRow,
  autoMapColumns,
  buildImportPlan,
  productStatus,
  describeImageFile,
  matchImages,
  importOneProduct,
  buildReportCsv,
  downloadCsv,
} from '../import/productImport';
import './AdminProducts.css';
import './AdminProductImport.css';

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'review', label: 'Review' },
  { key: 'images', label: 'Images' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'run', label: 'Import' },
];

const STATUS_BADGE = {
  ready: { label: 'Ready', cls: 'is-ready' },
  review: { label: 'Needs review', cls: 'is-review' },
  blocked: { label: 'Blocked', cls: 'is-blocked' },
  exists: { label: 'Already exists', cls: 'is-exists' },
};

const FILE_BADGE = {
  matched: { label: 'Matched', cls: 'is-ready' },
  manual: { label: 'Assigned', cls: 'is-ready' },
  ambiguous: { label: 'Ambiguous', cls: 'is-review' },
  conflict: { label: 'Conflict', cls: 'is-review' },
  unmatched: { label: 'Unmatched', cls: 'is-exists' },
  invalid: { label: 'Invalid', cls: 'is-blocked' },
  ignored: { label: 'Ignored', cls: 'is-exists' },
};

const CONFIRM_WORD = 'IMPORT';
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export default function AdminProductImport() {
  const [step, setStep] = useState('upload');

  // Reference data from the database
  const [categories, setCategories] = useState([]);
  const [existingProducts, setExistingProducts] = useState([]);
  const [refState, setRefState] = useState({ loading: true, error: '' });

  // Source file
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [encoding, setEncoding] = useState('');
  const [loadError, setLoadError] = useState('');
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({});
  const [suffixes, setSuffixes] = useState(DEFAULT_SUFFIXES);

  // Review decisions
  const [nameOverrides, setNameOverrides] = useState({});
  const [verified, setVerified] = useState({});
  const [filter, setFilter] = useState('ALL');

  // Images
  const [images, setImages] = useState([]); // { ...describeImageFile, previewUrl }
  const [manual, setManual] = useState({});
  const nextImageId = useRef(1);

  // Confirm + run
  const [publishComplete, setPublishComplete] = useState(true);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [results, setResults] = useState({});
  const [runError, setRunError] = useState('');
  const [finished, setFinished] = useState(false);
  const cancelRef = useRef(false);

  const loadReferenceData = async () => {
    const [cats, prods] = await Promise.all([
      getCategories(true),
      getProducts({ allStatuses: true, throwOnError: true }),
    ]);
    setCategories(cats || []);
    setExistingProducts(prods || []);
    return { cats: cats || [], prods: prods || [] };
  };

  useEffect(() => {
    loadReferenceData()
      .then(() => setRefState({ loading: false, error: '' }))
      .catch((err) => setRefState({ loading: false, error: err.message || 'Could not load products and categories.' }));
  }, []);

  // Release image previews when the page closes
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((img) => img.previewUrl && URL.revokeObjectURL(img.previewUrl)), []);

  // Warn before leaving while an import is running
  useEffect(() => {
    if (!running) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  const rows = sheets[sheetIndex]?.rows || [];
  const headerCells = rows[headerRow] || [];
  const columnCount = Math.max(headerCells.length, ...rows.slice(headerRow, headerRow + 20).map((r) => (r || []).length), 0);
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && !(mapping[f.key] >= 0));

  const plan = useMemo(() => {
    if (!rows.length || missingRequired.length > 0) return null;
    return buildImportPlan({ rows, headerRow, mapping, suffixes, categories, existingProducts, nameOverrides });
  }, [rows, headerRow, mapping, suffixes, categories, existingProducts, nameOverrides, missingRequired.length]);

  const importable = useMemo(() => (plan ? plan.products.filter((p) => !p.existing) : []), [plan]);
  const imageMatch = useMemo(() => matchImages(images, importable, manual), [images, importable, manual]);
  const imageById = useMemo(() => new Map(images.map((img) => [img.id, img])), [images]);

  const statuses = useMemo(() => {
    const out = {};
    for (const p of plan?.products || []) {
      out[p.key] = productStatus(p, { verified, assignments: imageMatch.assignments, publishComplete });
    }
    return out;
  }, [plan, verified, imageMatch, publishComplete]);

  const counts = useMemo(() => {
    const c = { ready: 0, publish: 0, draft: 0, review: 0, blocked: 0, exists: 0, variants: 0, images: 0 };
    for (const p of plan?.products || []) {
      const st = statuses[p.key];
      if (!st) continue;
      c[st.status] += 1;
      if (st.status === 'ready') {
        if (st.publish) c.publish += 1;
        else c.draft += 1;
        c.variants += p.variants.length;
        const a = imageMatch.assignments[p.key];
        if (a) c.images += (a.main ? 1 : 0) + (a.glass ? 1 : 0) + (a.pvc ? 1 : 0) + a.gallery.length;
      }
    }
    return c;
  }, [plan, statuses, imageMatch]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSpreadsheet = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoadError('');
    try {
      const { sheets: read, encoding: enc } = await readSpreadsheet(file);
      if (!read.some((s) => s.rows.length > 0)) throw new Error('The file has no rows.');
      const first = Math.max(0, read.findIndex((s) => s.rows.length > 0));
      const hdr = findHeaderRow(read[first].rows);
      setFileName(file.name);
      setSheets(read);
      setEncoding(enc);
      setSheetIndex(first);
      setHeaderRow(hdr);
      setMapping(autoMapColumns(read[first].rows[hdr]));
      setNameOverrides({});
      setVerified({});
      setResults({});
      setFinished(false);
      setStep('map');
    } catch (err) {
      setLoadError(err.message || 'The file could not be read.');
    }
  };

  const changeSheet = (idx) => {
    const hdr = findHeaderRow(sheets[idx].rows);
    setSheetIndex(idx);
    setHeaderRow(hdr);
    setMapping(autoMapColumns(sheets[idx].rows[hdr]));
  };

  const changeHeaderRow = (rowNumber) => {
    const idx = Math.max(0, Math.min(rows.length - 1, (Number(rowNumber) || 1) - 1));
    setHeaderRow(idx);
    setMapping(autoMapColumns(rows[idx]));
  };

  const addImages = (fileList) => {
    const added = Array.from(fileList || [])
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => {
        const info = describeImageFile(f, `img-${nextImageId.current++}`);
        return { ...info, previewUrl: info.error ? '' : URL.createObjectURL(f) };
      });
    setImages((prev) => {
      // The same file chosen twice is kept once
      const seen = new Set(prev.map((i) => `${i.path}|${i.file.size}|${i.file.lastModified}`));
      const fresh = [];
      for (const img of added) {
        const k = `${img.path}|${img.file.size}|${img.file.lastModified}`;
        if (seen.has(k)) {
          if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
        } else {
          seen.add(k);
          fresh.push(img);
        }
      }
      return [...prev, ...fresh];
    });
  };

  const clearImages = () => {
    images.forEach((img) => img.previewUrl && URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setManual({});
  };

  const setManualChoice = (id, value) => {
    setManual((prev) => {
      const next = { ...prev };
      if (!value) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const downloadReport = (withResults) => {
    if (!plan) return;
    const csv = buildReportCsv(plan, statuses, imageMatch.assignments, imageById, withResults ? results : {});
    const base = (fileName || 'products').replace(/\.[^.]+$/, '');
    downloadCsv(`${base}-${withResults ? 'import-report' : 'validation-report'}-${stamp()}.csv`, csv);
  };

  const startImport = async () => {
    setRunError('');
    setRunning(true);
    setFinished(false);
    cancelRef.current = false;
    setStep('run');

    // Re-read the database right before writing, so products created meanwhile are skipped
    let fresh;
    try {
      fresh = await loadReferenceData();
    } catch (err) {
      setRunError(`Import not started: could not re-check existing products (${err.message}).`);
      setRunning(false);
      return;
    }
    const freshPlan = buildImportPlan({
      rows, headerRow, mapping, suffixes, categories: fresh.cats, existingProducts: fresh.prods, nameOverrides,
    });
    const freshImportable = freshPlan.products.filter((p) => !p.existing);
    const freshMatch = matchImages(images, freshImportable, manual);
    const fileOf = (id) => imageById.get(id)?.file || null;

    const out = {};
    const queue = [];
    for (const p of freshPlan.products) {
      const st = productStatus(p, { verified, assignments: freshMatch.assignments, publishComplete });
      if (st.status === 'ready') {
        queue.push({ p, publish: st.publish });
      } else if (st.status === 'exists') {
        out[p.key] = { outcome: `Skipped: already exists ("${p.existing.name}")` };
      } else {
        out[p.key] = { outcome: st.status === 'review' ? 'Not imported: needs review' : 'Not imported: blocked' };
      }
    }
    setResults({ ...out });
    setProgress({ done: 0, total: queue.length, current: '' });

    let processed = 0;
    for (let i = 0; i < queue.length; i += 1) {
      const { p, publish } = queue[i];
      if (cancelRef.current) {
        for (const rest of queue.slice(i)) out[rest.p.key] = { outcome: 'Not imported: cancelled' };
        break;
      }
      setProgress({ done: processed, total: queue.length, current: p.name });
      const a = freshMatch.assignments[p.key] || { main: null, glass: null, pvc: null, gallery: [] };
      try {
        const res = await importOneProduct(
          p,
          { main: fileOf(a.main), glass: fileOf(a.glass), pvc: fileOf(a.pvc), gallery: a.gallery.map(fileOf).filter(Boolean) },
          publish
        );
        out[p.key] = {
          ok: true,
          outcome: `${publish ? 'Created and published' : 'Created as draft'} (${p.variants.length} variants, ${res.images} image${res.images === 1 ? '' : 's'})`,
        };
      } catch (err) {
        out[p.key] = err.duplicate
          ? { outcome: 'Skipped: a product with this URL slug already exists', error: err.message }
          : { outcome: 'Failed', error: err.message };
      }
      processed += 1;
      setResults({ ...out });
    }

    setProgress({ done: processed, total: queue.length, current: '' });
    setRunning(false);
    setFinished(true);
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canReview = Boolean(plan);

  const visibleProducts = (plan?.products || []).filter((p) => {
    if (filter === 'ALL') return true;
    const st = statuses[p.key];
    if (filter === 'publish') return st?.status === 'ready' && st.publish;
    if (filter === 'draft') return st?.status === 'ready' && !st.publish;
    return st?.status === filter;
  });

  const productOptions = importable.map((p) => ({ key: p.key, name: p.name, type: p.type }));

  const renderIssues = (p) =>
    p.issues.length === 0 ? null : (
      <ul className="ps-imp-issues">
        {p.issues.map((i, idx) => (
          <li key={idx} className={`is-${i.level}`}>
            <strong>{i.level === 'error' ? 'Error' : i.level === 'review' ? 'Review' : 'Note'}:</strong> {i.message}
            {i.rows.length > 0 && <span className="ps-imp-rows"> (row {i.rows.join(', ')})</span>}
          </li>
        ))}
      </ul>
    );

  const renderSummary = () => (
    <div className="ps-imp-summary">
      <button type="button" className={filter === 'ALL' ? 'is-on' : ''} onClick={() => setFilter('ALL')}>
        All <b>{plan?.products.length || 0}</b>
      </button>
      <button type="button" className={filter === 'publish' ? 'is-on' : ''} onClick={() => setFilter('publish')}>
        Will publish <b>{counts.publish}</b>
      </button>
      <button type="button" className={filter === 'draft' ? 'is-on' : ''} onClick={() => setFilter('draft')}>
        Draft <b>{counts.draft}</b>
      </button>
      <button type="button" className={filter === 'review' ? 'is-on' : ''} onClick={() => setFilter('review')}>
        Needs review <b>{counts.review}</b>
      </button>
      <button type="button" className={filter === 'blocked' ? 'is-on' : ''} onClick={() => setFilter('blocked')}>
        Blocked <b>{counts.blocked}</b>
      </button>
      <button type="button" className={filter === 'exists' ? 'is-on' : ''} onClick={() => setFilter('exists')}>
        Already exist <b>{counts.exists}</b>
      </button>
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="ps-admin-products-page ps-imp-page">
      <div className="ps-admin-page-header">
        <div>
          <h1 className="ps-admin-page-title">Bulk Product Import</h1>
          <p className="ps-admin-page-subtitle">
            Import products and prices from an Excel or CSV price list. Existing products are never changed.
          </p>
        </div>
        <div className="ps-admin-header-actions">
          <Link to="/admin/products" className="ps-btn-gold-primary ps-admin-header-btn">
            <ArrowLeft size={16} />
            <span>Back to Products</span>
          </Link>
        </div>
      </div>

      <ol className="ps-imp-steps" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i === stepIndex ? 'is-current' : i < stepIndex ? 'is-done' : ''}>
            <span>{i + 1}</span> {s.label}
          </li>
        ))}
      </ol>

      {refState.loading && <div className="ps-imp-note">Loading existing products and categories…</div>}
      {refState.error && (
        <div className="ps-imp-alert is-error" role="alert">
          Could not load existing products and categories: {refState.error}. Duplicate checks need this data, so importing is disabled. Reload the page to try again.
        </div>
      )}

      {/* ---------------- 1. Upload ---------------- */}
      {step === 'upload' && (
        <section className="ps-imp-card">
          <h2>1. Choose the price list</h2>
          <p className="ps-imp-help">
            Excel (.xlsx) or CSV, one row per product, type and size. Required columns: product name, type (Attar or Spray),
            size in ml and price. Optional: notes, category, bottle (Glass/PVC), stock and SKU. Title rows above the header are skipped.
          </p>
          <label className={`ps-imp-drop ${refState.loading || refState.error ? 'is-disabled' : ''}`}>
            <FileSpreadsheet size={28} />
            <span>Select an .xlsx or .csv file</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleSpreadsheet}
              disabled={refState.loading || Boolean(refState.error)}
            />
          </label>
          {loadError && <div className="ps-imp-alert is-error" role="alert">{loadError}</div>}
        </section>
      )}

      {/* ---------------- 2. Map columns ---------------- */}
      {step === 'map' && (
        <section className="ps-imp-card">
          <h2>2. Map columns</h2>
          <p className="ps-imp-help">
            <b>{fileName}</b> · {rows.length} rows{encoding && encoding !== 'xlsx' ? ` · text encoding ${encoding}` : ''}
          </p>

          <div className="ps-imp-grid">
            {sheets.length > 1 && (
              <label>
                Worksheet
                <select value={sheetIndex} onChange={(e) => changeSheet(Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name + i} value={i}>{s.name} ({s.rows.length} rows)</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Header row number
              <input type="number" min="1" max={rows.length} value={headerRow + 1} onChange={(e) => changeHeaderRow(e.target.value)} />
            </label>
          </div>

          <div className="ps-imp-grid">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label} {f.required && <em className="ps-imp-req">required</em>}
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                >
                  <option value={-1}>— not in file —</option>
                  {Array.from({ length: columnCount }, (_, i) => (
                    <option key={i} value={i}>
                      Column {i + 1}{headerCells[i] ? `: ${headerCells[i]}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <h3 className="ps-imp-subhead">Product names</h3>
          <p className="ps-imp-help">
            Attar and Spray rows become separate products. The suffix is added to the source name unless it already ends with it.
          </p>
          <div className="ps-imp-grid">
            <label>
              Attar suffix
              <input value={suffixes.attar} onChange={(e) => setSuffixes((s) => ({ ...s, attar: e.target.value }))} />
            </label>
            <label>
              Spray suffix
              <input value={suffixes.spray} onChange={(e) => setSuffixes((s) => ({ ...s, spray: e.target.value }))} />
            </label>
          </div>

          <h3 className="ps-imp-subhead">Preview of the first rows</h3>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {IMPORT_FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => <th key={f.key}>{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(headerRow + 1, headerRow + 9).map((r, i) => (
                  <tr key={i}>
                    <td>{headerRow + 2 + i}</td>
                    {IMPORT_FIELDS.filter((f) => mapping[f.key] >= 0).map((f) => (
                      <td key={f.key}>{(r || [])[mapping[f.key]] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {missingRequired.length > 0 && (
            <div className="ps-imp-alert is-error" role="alert">
              Map the required column(s): {missingRequired.map((f) => f.label).join(', ')}.
            </div>
          )}
          <div className="ps-imp-actions">
            <button type="button" className="ps-imp-btn" onClick={() => setStep('upload')}>Choose another file</button>
            <button type="button" className="ps-btn-gold-primary" disabled={!canReview} onClick={() => setStep('review')}>
              Continue to review
            </button>
          </div>
        </section>
      )}

      {/* ---------------- 3. Review ---------------- */}
      {step === 'review' && plan && (
        <section className="ps-imp-card">
          <h2>3. Review products</h2>
          <p className="ps-imp-help">
            {plan.dataRowCount} source rows → {plan.products.length} products. <b>Blocked</b> records need a corrected file.
            <b> Needs review</b> records are imported only after you confirm them against the source. Products with every standard
            size priced and a verified primary image can be published. All others become inactive drafts with stock 0.
          </p>
          {renderSummary()}

          {plan.rowIssues.length > 0 && (
            <div className="ps-imp-alert is-error">
              {plan.rowIssues.map((ri, i) => (
                <div key={i}>Row {ri.rows.join(', ')}: {ri.message}</div>
              ))}
            </div>
          )}

          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Product</th>
                  <th>Type / Category</th>
                  <th>Variants (source price)</th>
                  <th>Images</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((p) => {
                  const st = statuses[p.key] || {};
                  const badge = STATUS_BADGE[st.status] || STATUS_BADGE.blocked;
                  const hasReview = p.issues.some((i) => i.level === 'review');
                  const a = imageMatch.assignments[p.key];
                  return (
                    <tr key={p.key}>
                      <td>
                        <span className={`ps-imp-badge ${badge.cls}`}>{badge.label}</span>
                        {st.status === 'ready' && (
                          <div className="ps-imp-sub">{st.publish ? 'Will publish' : 'Draft'}</div>
                        )}
                        <div className="ps-imp-rows">Rows {p.rows.join(', ')}</div>
                      </td>
                      <td>
                        {p.existing ? (
                          <>
                            <b>{p.name}</b>
                            <div className="ps-imp-sub">Matches existing “{p.existing.name}”, so it is skipped</div>
                          </>
                        ) : (
                          <>
                            <input
                              className="ps-imp-name"
                              value={nameOverrides[p.key] ?? p.name}
                              onChange={(e) => setNameOverrides((prev) => ({ ...prev, [p.key]: e.target.value }))}
                              aria-label={`Product name for rows ${p.rows.join(', ')}`}
                            />
                            <div className="ps-imp-sub">/{p.slug || '—'} · source: {p.baseName}</div>
                          </>
                        )}
                        {p.notes.length > 0 && <div className="ps-imp-sub">Notes: {p.notes.join(' | ')}</div>}
                      </td>
                      <td>
                        {p.type ? TYPE_LABEL[p.type] : p.typeRaw || '—'}
                        <div className="ps-imp-sub">{p.category?.name || 'no category'}</div>
                      </td>
                      <td className="ps-imp-variants">
                        {p.variants.length === 0
                          ? '—'
                          : p.variants.map((v) => (
                              <div key={`${v.bottle_type}${v.size}`}>
                                {v.bottle_type.replace(' Bottle', '')} {v.size_ml}: {formatINR(v.price)}
                                {v.stock !== null && ` · stock ${v.stock}`}
                                {v.sku && ` · ${v.sku}`}
                              </div>
                            ))}
                        {(st.draftReasons || []).length > 0 && (
                          <div className="ps-imp-sub is-warn">Draft: {st.draftReasons.join('; ')}</div>
                        )}
                      </td>
                      <td className="ps-imp-sub">
                        {p.existing ? '—' : a ? (
                          <>
                            {a.main ? 'Primary ✓' : 'No primary'}
                            {a.glass && <div>Glass ✓</div>}
                            {a.pvc && <div>PVC ✓</div>}
                            {a.gallery.length > 0 && <div>Gallery ×{a.gallery.length}</div>}
                          </>
                        ) : 'None'}
                      </td>
                      <td>
                        {renderIssues(p)}
                        {hasReview && !p.existing && !p.issues.some((i) => i.level === 'error') && (
                          <label className="ps-imp-verify">
                            <input
                              type="checkbox"
                              checked={Boolean(verified[p.key])}
                              onChange={(e) => setVerified((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                            />
                            I checked this record (name, sizes and prices) against the source
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ps-imp-actions">
            <button type="button" className="ps-imp-btn" onClick={() => setStep('map')}>Back</button>
            <button type="button" className="ps-imp-btn" onClick={() => downloadReport(false)}>
              <Download size={14} /> Validation report (CSV)
            </button>
            <button type="button" className="ps-btn-gold-primary" onClick={() => setStep('images')}>
              Continue to images
            </button>
          </div>
        </section>
      )}

      {/* ---------------- 4. Images ---------------- */}
      {step === 'images' && plan && (
        <section className="ps-imp-card">
          <h2>4. Product images (optional)</h2>
          <p className="ps-imp-help">
            Name each file after the product’s URL slug plus a role: <code>khamrah-attar.webp</code> (primary),
            <code> khamrah-perfume-spray-glass.jpg</code>, <code>…-pvc.jpg</code>, <code>…-gallery-1.jpg</code>. Or choose a folder
            with one sub-folder per product slug containing <code>main</code>, <code>glass</code>, <code>pvc</code>, <code>gallery-1</code>…
            Names that could fit more than one product are never assigned automatically. JPEG, PNG or WebP, up to 10 MB each.
            Files are uploaded to <code>products/</code> only when the import runs.
          </p>
          <div className="ps-imp-actions is-left">
            <label className="ps-imp-btn">
              <ImagePlus size={14} /> Add image files
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
            </label>
            <label className="ps-imp-btn">
              <FolderOpen size={14} /> Add a folder
              <input type="file" multiple hidden webkitdirectory="" directory="" onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} />
            </label>
            {images.length > 0 && (
              <button type="button" className="ps-imp-btn" onClick={clearImages}>Remove all images</button>
            )}
          </div>

          {images.length > 0 && (
            <div className="ps-admin-table-container ps-imp-scroll">
              <table className="ps-imp-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>File</th>
                    <th>Status</th>
                    <th>Assigned to</th>
                    <th>Manual assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {imageMatch.files.map((f) => {
                    const badge = FILE_BADGE[f.status];
                    const target = productOptions.find((o) => o.key === f.productKey);
                    const m = manual[f.id] || {};
                    const chosenProduct = productOptions.find((o) => o.key === (m.productKey || f.suggestions?.[0]));
                    return (
                      <tr key={f.id}>
                        <td>{f.previewUrl ? <img src={f.previewUrl} alt="" className="ps-prod-table-thumb" /> : '—'}</td>
                        <td>
                          <div>{f.fileName}</div>
                          {f.path !== f.fileName && <div className="ps-imp-sub">{f.path}</div>}
                        </td>
                        <td>
                          <span className={`ps-imp-badge ${badge.cls}`}>{badge.label}</span>
                          <div className="ps-imp-sub">{f.reason}</div>
                        </td>
                        <td>{target && (f.status === 'matched' || f.status === 'manual') ? `${target.name} · ${IMAGE_ROLE_LABEL[f.role]}` : '—'}</td>
                        <td>
                          {f.status !== 'invalid' && (
                            <div className="ps-imp-assign">
                              <select
                                value={m.ignore ? '__ignore' : m.productKey || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) setManualChoice(f.id, null);
                                  else if (v === '__ignore') setManualChoice(f.id, { ignore: true });
                                  else setManualChoice(f.id, { productKey: v, role: m.role || f.suggestedRole || f.role || 'main' });
                                }}
                                aria-label={`Product for ${f.fileName}`}
                              >
                                <option value="">{f.status === 'matched' ? 'Keep automatic match' : 'Not assigned'}</option>
                                <option value="__ignore">Ignore this file</option>
                                {productOptions.map((o) => (
                                  <option key={o.key} value={o.key}>
                                    {o.name}{f.suggestions?.includes(o.key) ? ' (suggested)' : ''}
                                  </option>
                                ))}
                              </select>
                              {m.productKey && (
                                <select
                                  value={m.role || 'main'}
                                  onChange={(e) => setManualChoice(f.id, { productKey: m.productKey, role: e.target.value })}
                                  aria-label={`Image role for ${f.fileName}`}
                                >
                                  {['main', 'glass', 'pvc', 'gallery']
                                    .filter((r) => !(r === 'pvc' && chosenProduct?.type === 'attar'))
                                    .map((r) => <option key={r} value={r}>{IMAGE_ROLE_LABEL[r]}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ps-imp-actions">
            <button type="button" className="ps-imp-btn" onClick={() => setStep('review')}>Back to review</button>
            <button type="button" className="ps-btn-gold-primary" onClick={() => { setConfirmChecked(false); setConfirmText(''); setStep('confirm'); }}>
              Continue to confirmation
            </button>
          </div>
        </section>
      )}

      {/* ---------------- 5. Confirm ---------------- */}
      {step === 'confirm' && plan && (
        <section className="ps-imp-card">
          <h2>5. Confirm the import</h2>
          {renderSummary()}
          <ul className="ps-imp-confirm-list">
            <li><b>{counts.ready}</b> new product(s) will be created with <b>{counts.variants}</b> variant(s) and <b>{counts.images}</b> image upload(s).</li>
            <li><b>{counts.publish}</b> will be published; <b>{counts.draft}</b> will be inactive drafts.</li>
            <li><b>{counts.exists}</b> existing product(s) will be skipped and not changed.</li>
            <li><b>{counts.review + counts.blocked}</b> record(s) will not be imported ({counts.review} need review, {counts.blocked} blocked).</li>
            <li>Stock starts at 0 unless the file has a stock column. SKUs, descriptions and fragrance notes are left empty.</li>
          </ul>
          <label className="ps-imp-verify">
            <input type="checkbox" checked={publishComplete} onChange={(e) => setPublishComplete(e.target.checked)} />
            Publish products that have every standard size priced and a verified primary image
          </label>
          {publishComplete && counts.publish > 0 && (
            <div className="ps-imp-alert is-warn">
              <AlertTriangle size={14} /> Published products appear on the storefront immediately, but they will show as out of stock until you set stock in Inventory.
            </div>
          )}
          <label className="ps-imp-verify">
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
            I have reviewed the preview and want to write these products to the live database.
          </label>
          <label className="ps-imp-confirm-word">
            Type <b>{CONFIRM_WORD}</b> to confirm
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </label>
          <div className="ps-imp-actions">
            <button type="button" className="ps-imp-btn" onClick={() => setStep('images')}>Back</button>
            <button
              type="button"
              className="ps-btn-gold-primary"
              disabled={!confirmChecked || confirmText.trim() !== CONFIRM_WORD || counts.ready === 0 || Boolean(refState.error)}
              onClick={startImport}
            >
              <Upload size={14} /> Import {counts.ready} product(s)
            </button>
          </div>
        </section>
      )}

      {/* ---------------- 6. Run ---------------- */}
      {step === 'run' && (
        <section className="ps-imp-card">
          <h2>6. {running ? 'Importing…' : finished ? 'Import finished' : 'Import'}</h2>
          {runError && <div className="ps-imp-alert is-error" role="alert">{runError}</div>}
          {progress.total > 0 && (
            <>
              <div className="ps-imp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
              </div>
              <p className="ps-imp-help">
                {progress.done} of {progress.total} processed{progress.current ? ` · now: ${progress.current}` : ''}
              </p>
            </>
          )}
          {running && (
            <div className="ps-imp-actions is-left">
              <button type="button" className="ps-imp-btn" onClick={() => { cancelRef.current = true; }}>
                Stop after the current product
              </button>
              <span className="ps-imp-sub">Keep this page open until the import finishes.</span>
            </div>
          )}

          {Object.keys(results).length > 0 && plan && (
            <div className="ps-admin-table-container ps-imp-scroll">
              <table className="ps-imp-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Result</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.products.filter((p) => results[p.key]).map((p) => (
                    <tr key={p.key}>
                      <td>{p.name}</td>
                      <td>
                        <span className={`ps-imp-badge ${results[p.key].ok ? 'is-ready' : results[p.key].outcome === 'Failed' ? 'is-blocked' : 'is-exists'}`}>
                          {results[p.key].outcome}
                        </span>
                      </td>
                      <td className="ps-imp-sub">{results[p.key].error || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {finished && (
            <div className="ps-imp-actions">
              <button type="button" className="ps-imp-btn" onClick={() => downloadReport(true)}>
                <Download size={14} /> Download import report (CSV)
              </button>
              <Link to="/admin/products" className="ps-btn-gold-primary">Go to Products</Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
