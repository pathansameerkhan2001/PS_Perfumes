import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, ImagePlus, Copy, ShieldAlert, Search } from 'lucide-react';
import { getProducts } from '../../services/products';
import {
  LIVE_IMAGE_WRITES_ENABLED,
  PILOT_SLUGS,
  MIN_IMAGE_SIDE,
  ROLE_LABEL,
  NEGATIVE_PROMPT,
  buildManifest,
  entryBlocker,
  describeImage,
  matchFiles,
  buildPlan,
  checkExistingObjects,
  executePlanRow,
  manifestRows,
  rowsToCsv,
  downloadText,
} from '../images/imageWorkflow';
import './AdminProducts.css';
import './AdminProductImport.css';

const STAGES = [
  { key: 'select', label: 'Products' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'review', label: 'Review' },
  { key: 'match', label: 'Match' },
  { key: 'upload', label: 'Upload preview' },
  { key: 'assign', label: 'Assignment preview' },
  { key: 'approve', label: 'Approval' },
  { key: 'results', label: 'Results' },
];

const FILE_BADGE = {
  matched: { label: 'Matched', cls: 'is-ready' },
  manual: { label: 'Assigned', cls: 'is-ready' },
  ambiguous: { label: 'Ambiguous', cls: 'is-review' },
  conflict: { label: 'Conflict', cls: 'is-review' },
  unmatched: { label: 'Unmatched', cls: 'is-exists' },
  ignored: { label: 'Ignored', cls: 'is-exists' },
};

const CONFIRM_WORD = 'UPLOAD';
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const kb = (n) => `${Math.round((n || 0) / 1024)} KB`;

export default function AdminProductImages() {
  const [stage, setStage] = useState('select');
  const [products, setProducts] = useState([]);
  const [loadState, setLoadState] = useState({ loading: true, error: '' });
  const [pilotOnly, setPilotOnly] = useState(true);
  const [verified, setVerified] = useState({});
  const [search, setSearch] = useState('');

  const [files, setFiles] = useState([]); // describeImage() + previewUrl
  const [manual, setManual] = useState({});
  const [review, setReview] = useState({}); // fileId → 'approved' | 'rejected'
  const [source, setSource] = useState({}); // fileId → 'concept' | 'photo'
  const nextId = useRef(1);

  const [storageCheck, setStorageCheck] = useState({});
  const [checking, setChecking] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState({});
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getProducts({ allStatuses: true, throwOnError: true })
      .then((list) => {
        setProducts(list || []);
        setLoadState({ loading: false, error: '' });
      })
      .catch((err) => setLoadState({ loading: false, error: err.message || 'Could not load products.' }));
  }, []);

  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)), []);

  const allEntries = useMemo(() => buildManifest(products), [products]);
  const entries = useMemo(() => (pilotOnly ? allEntries.filter((e) => e.pilot) : allEntries), [allEntries, pilotOnly]);
  const eligible = entries.filter((e) => !entryBlocker(e, verified));
  const match = useMemo(() => matchFiles(files, entries, manual), [files, entries, manual]);
  const plan = useMemo(
    () => buildPlan({ entries, files, fileForEntry: match.fileForEntry, review, source, verified }),
    [entries, files, match, review, source, verified]
  );
  const ready = plan.filter((r) => r.blockers.length === 0);

  const stats = useMemo(() => {
    const productIds = new Set(allEntries.map((e) => e.productId));
    const scopeIds = new Set(entries.map((e) => e.productId));
    const variantCount = products.reduce((n, p) => n + (p.variants || []).length, 0);
    return {
      products: products.length,
      variants: variantCount,
      drafts: products.filter((p) => p.is_active === false).length,
      attar: products.filter((p) => allEntries.find((e) => e.productId === p.id)?.kind === 'attar').length,
      spray: products.filter((p) => allEntries.find((e) => e.productId === p.id)?.kind === 'spray').length,
      imagesNeeded: allEntries.filter((e) => !e.skipReason).length,
      withImages: new Set(allEntries.filter((e) => e.skipReason.startsWith('Already')).map((e) => e.productId)).size,
      flagged: new Set(allEntries.filter((e) => e.flag && !e.skipReason).map((e) => e.productId)).size,
      collisions: allEntries.filter((e) => e.collision).length,
      scopeProducts: scopeIds.size,
      totalProducts: productIds.size,
    };
  }, [products, allEntries, entries]);

  const pilotFound = PILOT_SLUGS.filter((s) => products.some((p) => p.slug === s));

  // -------------------------------------------------------------------------

  const addFiles = async (list) => {
    const incoming = Array.from(list || []).filter((f) => !f.name.startsWith('.'));
    const described = await Promise.all(incoming.map((f) => describeImage(f, `file-${nextId.current++}`)));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.file.lastModified}`));
      const fresh = described
        .filter((d) => !seen.has(`${d.name}|${d.size}|${d.file.lastModified}`))
        .map((d) => ({ ...d, previewUrl: d.ext ? URL.createObjectURL(d.file) : '' }));
      return [...prev, ...fresh];
    });
    setStorageCheck({});
  };

  const removeAllFiles = () => {
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    setFiles([]);
    setManual({});
    setReview({});
    setSource({});
    setStorageCheck({});
  };

  const setManualChoice = (id, value) =>
    setManual((prev) => {
      const next = { ...prev };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });

  const manifestCsv = () =>
    rowsToCsv(manifestRows({ entries, files, fileForEntry: match.fileForEntry, review, source, verified, results }));

  const downloadManifest = () =>
    downloadText(`product-image-manifest${pilotOnly ? '-pilot' : ''}-${stamp()}.csv`, manifestCsv(), 'text/csv;charset=utf-8');

  const downloadPromptPack = () => {
    const pack = {
      generated_at: new Date().toISOString(),
      scope: pilotOnly ? 'pilot' : 'all eligible products',
      format: { width: 2048, height: 2048, min_side: MIN_IMAGE_SIDE, file_type: 'webp (png/jpg accepted)' },
      concept_notice: 'Concept visuals only. They do not depict real branded products and must be reviewed before use.',
      negative_prompt: NEGATIVE_PROMPT,
      images: eligible.map((e) => ({
        file_name: `${e.stem}.webp`,
        product_id: e.productId,
        product_name: e.productName,
        slug: e.slug,
        category: e.category,
        bottle_type: e.bottle,
        sizes: e.sizes,
        role: ROLE_LABEL[e.role],
        prompt: e.prompt,
      })),
    };
    downloadText(`product-image-prompts${pilotOnly ? '-pilot' : ''}-${stamp()}.json`, JSON.stringify(pack, null, 2), 'application/json');
  };

  const copyPrompt = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Prompt copied.');
    } catch {
      setNotice('Copy failed; select the prompt text and copy it manually.');
    }
  };

  const runStorageCheck = async () => {
    setChecking(true);
    try {
      setStorageCheck(await checkExistingObjects(plan));
    } finally {
      setChecking(false);
    }
  };

  const runLive = async () => {
    if (!LIVE_IMAGE_WRITES_ENABLED) return;
    setRunning(true);
    const out = {};
    for (const row of ready) {
      try {
        const res = await executePlanRow(row);
        out[row.entry.id] = {
          upload: res.uploaded ? `uploaded to ${row.path}` : `already present at ${row.path} (same size)`,
          assignment: `assigned: ${res.fields.join(' + ')}`,
        };
      } catch (err) {
        out[row.entry.id] = { upload: 'see error', assignment: `failed: ${err.message}` };
      }
      setResults({ ...out });
    }
    setRunning(false);
    setStage('results');
  };

  // -------------------------------------------------------------------------

  const visibleEntries = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return e.productName.toLowerCase().includes(s) || e.slug.includes(s);
  });
  const entryById = new Map(entries.map((e) => [e.id, e]));

  return (
    <div className="ps-admin-products-page ps-imp-page">
      <div className="ps-admin-page-header">
        <div>
          <h1 className="ps-admin-page-title">Product Images</h1>
          <p className="ps-admin-page-subtitle">
            Plan, review and match primary images. Existing images are never replaced; product status never changes.
          </p>
        </div>
        <div className="ps-admin-header-actions">
          <Link to="/admin/products" className="ps-btn-gold-primary ps-admin-header-btn">
            <ArrowLeft size={16} />
            <span>Back to Products</span>
          </Link>
        </div>
      </div>

      {!LIVE_IMAGE_WRITES_ENABLED && (
        <div className="ps-imp-alert is-warn" role="status">
          <ShieldAlert size={14} /> Dry-run mode: this build cannot upload files or change products. Everything below is a preview.
        </div>
      )}

      <ol className="ps-imp-steps" aria-label="Image workflow stages">
        {STAGES.map((s, i) => (
          <li key={s.key} className={s.key === stage ? 'is-current' : ''}>
            <button type="button" className="ps-imgwf-stage" onClick={() => setStage(s.key)} disabled={running}>
              <span>{i + 1}</span> {s.label}
            </button>
          </li>
        ))}
      </ol>

      {loadState.loading && <div className="ps-imp-note">Loading products…</div>}
      {loadState.error && <div className="ps-imp-alert is-error" role="alert">Could not load products: {loadState.error}</div>}
      {notice && (
        <div className="ps-imp-note" role="status">
          {notice}{' '}
          <button type="button" className="ps-imp-btn" onClick={() => setNotice('')}>OK</button>
        </div>
      )}

      {/* ---------------- 1. Products ---------------- */}
      {stage === 'select' && !loadState.loading && (
        <section className="ps-imp-card">
          <h2>1. Products and image slots</h2>
          <ul className="ps-imp-confirm-list">
            <li><b>{stats.products}</b> products in the database (<b>{stats.drafts}</b> drafts) with <b>{stats.variants}</b> variants: {stats.attar} attar, {stats.spray} spray.</li>
            <li><b>{stats.imagesNeeded}</b> images needed for products without any image (spray products with Glass and PVC variants need two).</li>
            <li><b>{stats.withImages}</b> products already have images and are skipped. <b>{stats.flagged}</b> flagged products need identity confirmation.{stats.collisions > 0 && <> <b>{stats.collisions}</b> file-name collisions.</>}</li>
            <li>Pilot products found: {pilotFound.length > 0 ? pilotFound.join(', ') : 'none'}{pilotFound.length < PILOT_SLUGS.length && ` (missing: ${PILOT_SLUGS.filter((s) => !pilotFound.includes(s)).join(', ')})`}.</li>
          </ul>
          <div className="ps-imp-actions is-left">
            <label className="ps-imp-verify" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={pilotOnly} onChange={(e) => setPilotOnly(e.target.checked)} />
              Pilot only (Khamrah Attar glass, Khamrah Perfume Spray glass and PVC)
            </label>
            <div className="ps-admin-search-input-wrap">
              <Search size={15} className="ps-search-icon" />
              <input type="text" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Bottle / sizes</th>
                  <th>File name</th>
                  <th>Eligibility</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e) => {
                  const blocker = entryBlocker(e, verified);
                  return (
                    <tr key={e.id}>
                      <td>
                        <b>{e.productName}</b>
                        <div className="ps-imp-sub">{e.category} · /{e.slug}</div>
                        <div className="ps-imp-rows">{e.productId}</div>
                      </td>
                      <td>{e.productStatus === 'draft' ? 'Draft' : 'Active'}</td>
                      <td>
                        {e.bottle}
                        <div className="ps-imp-sub">{e.sizes.join(', ') || '—'}</div>
                      </td>
                      <td><code>{e.stem}.webp</code><div className="ps-imp-sub">{ROLE_LABEL[e.role]}</div></td>
                      <td>
                        <span className={`ps-imp-badge ${blocker ? (e.skipReason ? 'is-exists' : 'is-review') : 'is-ready'}`}>
                          {blocker ? (e.skipReason ? 'Skipped' : 'Blocked') : 'Eligible'}
                        </span>
                        {blocker && <div className="ps-imp-sub">{blocker}</div>}
                        {e.flag && !e.skipReason && (
                          <label className="ps-imp-verify">
                            <input
                              type="checkbox"
                              checked={Boolean(verified[e.productId])}
                              onChange={(ev) => setVerified((prev) => ({ ...prev, [e.productId]: ev.target.checked }))}
                            />
                            I confirmed this product’s identity (this session only)
                          </label>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleEntries.length === 0 && (
                  <tr><td colSpan={5} className="ps-imp-sub">No products in scope.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- 2. Concepts ---------------- */}
      {stage === 'concepts' && (
        <section className="ps-imp-card">
          <h2>2. Concept prompts</h2>
          <div className="ps-imp-alert is-warn">
            <ShieldAlert size={14} /> No image-generation service is configured in this project, so nothing is generated here.
            Use the prompt pack with an approved generator, save each result under its file name, then add the files in Review.
          </div>
          <p className="ps-imp-help">
            The prompts describe generic, unlabelled bottles in the PS Perfumes studio style. They do not name the fragrance and
            do not imitate any manufacturer’s bottle, label or packaging. Results are <b>concepts</b> until real product photographs replace them.
          </p>
          <div className="ps-imp-actions is-left">
            <button type="button" className="ps-imp-btn" onClick={downloadPromptPack} disabled={eligible.length === 0}>
              <Download size={14} /> Prompt pack (JSON, {eligible.length})
            </button>
            <button type="button" className="ps-imp-btn" onClick={downloadManifest}>
              <Download size={14} /> Manifest (CSV)
            </button>
          </div>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead>
                <tr><th>File name</th><th>Product</th><th>Prompt</th></tr>
              </thead>
              <tbody>
                {eligible.map((e) => (
                  <tr key={e.id}>
                    <td><code>{e.stem}.webp</code><div className="ps-imp-sub">{ROLE_LABEL[e.role]}</div></td>
                    <td>{e.productName}<div className="ps-imp-sub">{e.bottle}</div></td>
                    <td>
                      <div className="ps-imgwf-prompt">{e.prompt}</div>
                      <button type="button" className="ps-imp-btn" onClick={() => copyPrompt(e.prompt)}><Copy size={13} /> Copy</button>
                    </td>
                  </tr>
                ))}
                {eligible.length === 0 && <tr><td colSpan={3} className="ps-imp-sub">No eligible image slots in scope.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="ps-imp-help">Negative prompt: {NEGATIVE_PROMPT}</p>
        </section>
      )}

      {/* ---------------- 3. Review ---------------- */}
      {stage === 'review' && (
        <section className="ps-imp-card">
          <h2>3. Review images</h2>
          <p className="ps-imp-help">
            Add the generated or photographed files. Each must be WebP, PNG or JPEG, square, at least {MIN_IMAGE_SIDE} × {MIN_IMAGE_SIDE} px
            and at most 10 MB. Approve only images that show no text, logos or brand claims. Mark an image as an actual product
            photograph only if it is one.
          </p>
          <div className="ps-imp-actions is-left">
            <label className="ps-imp-btn">
              <ImagePlus size={14} /> Add images
              <input type="file" multiple accept="image/webp,image/png,image/jpeg" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            {files.length > 0 && <button type="button" className="ps-imp-btn" onClick={removeAllFiles}>Remove all</button>}
          </div>
          {files.length > 0 && (
            <div className="ps-admin-table-container ps-imp-scroll">
              <table className="ps-imp-table">
                <thead>
                  <tr><th>Preview</th><th>File</th><th>Checks</th><th>Matched slot</th><th>Decision</th></tr>
                </thead>
                <tbody>
                  {match.files.map((f) => {
                    const e = f.entryId && (f.status === 'matched' || f.status === 'manual') ? entryById.get(f.entryId) : null;
                    return (
                      <tr key={f.id}>
                        <td>{f.previewUrl ? <img src={f.previewUrl} alt="" className="ps-imgwf-thumb" /> : '—'}</td>
                        <td>{f.name}<div className="ps-imp-sub">{f.width ? `${f.width} × ${f.height}` : '?'} · {kb(f.size)}</div></td>
                        <td>
                          {f.problems.length === 0
                            ? <span className="ps-imp-badge is-ready">OK</span>
                            : f.problems.map((p) => <div key={p} className="ps-imp-sub is-warn">{p}</div>)}
                        </td>
                        <td>
                          {e ? <>{e.productName}<div className="ps-imp-sub">{ROLE_LABEL[e.role]}</div></> : <span className="ps-imp-sub">{f.reason}</span>}
                        </td>
                        <td>
                          <div className="ps-imp-assign">
                            <select
                              value={review[f.id] || ''}
                              onChange={(ev) => setReview((prev) => ({ ...prev, [f.id]: ev.target.value }))}
                              aria-label={`Review decision for ${f.name}`}
                            >
                              <option value="">Pending</option>
                              <option value="approved" disabled={f.problems.length > 0}>Approve</option>
                              <option value="rejected">Reject</option>
                            </select>
                            <select
                              value={source[f.id] || 'concept'}
                              onChange={(ev) => setSource((prev) => ({ ...prev, [f.id]: ev.target.value }))}
                              aria-label={`Image source for ${f.name}`}
                            >
                              <option value="concept">Concept (unverified)</option>
                              <option value="photo">Actual product photograph</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---------------- 4. Match ---------------- */}
      {stage === 'match' && (
        <section className="ps-imp-card">
          <h2>4. Match images to products</h2>
          <p className="ps-imp-help">
            Files are matched only by their exact manifest file name. Ambiguous, conflicting and unmatched files are never assigned
            automatically; choose a slot manually or ignore the file.
          </p>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead>
                <tr><th>Product slot</th><th>Expected file</th><th>Assigned file</th><th>Eligibility</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const f = files.find((x) => x.id === match.fileForEntry[e.id]);
                  const blocker = entryBlocker(e, verified);
                  return (
                    <tr key={e.id}>
                      <td>{e.productName}<div className="ps-imp-sub">{ROLE_LABEL[e.role]} · {e.bottle}</div></td>
                      <td><code>{e.stem}.webp</code></td>
                      <td>{f ? <>{f.name}<div className="ps-imp-sub">{review[f.id] || 'pending review'}</div></> : <span className="ps-imp-sub">Missing</span>}</td>
                      <td className="ps-imp-sub">{blocker || 'Eligible'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {match.files.some((f) => f.status !== 'matched') && (
            <>
              <h3 className="ps-imp-subhead">Files that need a decision</h3>
              <div className="ps-admin-table-container ps-imp-scroll">
                <table className="ps-imp-table">
                  <thead><tr><th>File</th><th>Status</th><th>Manual assignment</th></tr></thead>
                  <tbody>
                    {match.files.filter((f) => f.status !== 'matched').map((f) => {
                      const badge = FILE_BADGE[f.status];
                      const m = manual[f.id] || {};
                      return (
                        <tr key={f.id}>
                          <td>{f.name}</td>
                          <td><span className={`ps-imp-badge ${badge.cls}`}>{badge.label}</span><div className="ps-imp-sub">{f.reason}</div></td>
                          <td>
                            <select
                              value={m.ignore ? '__ignore' : m.entryId || ''}
                              onChange={(ev) => {
                                const v = ev.target.value;
                                setManualChoice(f.id, !v ? null : v === '__ignore' ? { ignore: true } : { entryId: v });
                              }}
                              aria-label={`Slot for ${f.name}`}
                            >
                              <option value="">Not assigned</option>
                              <option value="__ignore">Ignore this file</option>
                              {entries.map((e) => (
                                <option key={e.id} value={e.id}>{e.productName} — {ROLE_LABEL[e.role]}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- 5. Upload preview ---------------- */}
      {stage === 'upload' && (
        <section className="ps-imp-card">
          <h2>5. Upload preview</h2>
          <p className="ps-imp-help">
            Approved, matched images and where they would be stored. Concepts go to <code>products/concepts/</code>, actual photographs to{' '}
            <code>products/</code>. Paths are fixed per product, so a retry never creates a second copy, and an existing object is never overwritten.
          </p>
          <div className="ps-imp-actions is-left">
            <button type="button" className="ps-imp-btn" onClick={runStorageCheck} disabled={checking || plan.length === 0}>
              {checking ? 'Checking…' : 'Check Storage for existing objects (read-only)'}
            </button>
          </div>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead><tr><th>Bucket / path</th><th>File</th><th>Source</th><th>Existing object</th><th>Blockers</th></tr></thead>
              <tbody>
                {plan.map((r) => {
                  const c = storageCheck[r.path];
                  return (
                    <tr key={r.entry.id}>
                      <td><code>{r.bucket}/{r.path}</code></td>
                      <td>{r.file.name}<div className="ps-imp-sub">{r.file.width} × {r.file.height} · {kb(r.file.size)} · {r.file.mime}</div></td>
                      <td>{r.source === 'photo' ? 'Actual photograph' : 'Concept'}</td>
                      <td className="ps-imp-sub">
                        {!c ? 'Not checked' : c.error ? `Check failed: ${c.error}` : c.exists ? `Exists (${kb(c.size)})${c.size === r.file.size ? ' — same size, treated as already uploaded' : ' — different file, would be a conflict'}` : 'None'}
                      </td>
                      <td className="ps-imp-sub is-warn">{r.blockers.join(' ') || <span className="ps-imp-badge is-ready">Ready</span>}</td>
                    </tr>
                  );
                })}
                {plan.length === 0 && <tr><td colSpan={5} className="ps-imp-sub">No approved, matched images yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- 6. Assignment preview ---------------- */}
      {stage === 'assign' && (
        <section className="ps-imp-card">
          <h2>6. Assignment preview</h2>
          <p className="ps-imp-help">
            Only empty image fields are filled. Status, prices, stock, SKUs, descriptions, variants and other notes are not touched.
            Concept images are accepted only for draft products.
          </p>
          <div className="ps-admin-table-container ps-imp-scroll">
            <table className="ps-imp-table">
              <thead><tr><th>Product</th><th>Fields that would be set</th><th>Value</th><th>Blockers</th></tr></thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.entry.id}>
                    <td>{r.entry.productName}<div className="ps-imp-rows">{r.entry.productId}</div><div className="ps-imp-sub">{r.entry.productStatus === 'draft' ? 'Draft (stays draft)' : 'Active (stays active)'}</div></td>
                    <td className="ps-imp-sub">
                      {r.entry.fields.map((f) => (
                        <div key={f}>{f === 'main' ? 'main_image_url, main_image_path' : `fragrance_notes.${f}_image, ${f}_image_path`}</div>
                      ))}
                    </td>
                    <td className="ps-imp-sub ps-imgwf-break">{r.url}<div>{r.path}</div></td>
                    <td className="ps-imp-sub is-warn">{r.blockers.join(' ') || <span className="ps-imp-badge is-ready">Ready</span>}</td>
                  </tr>
                ))}
                {plan.length === 0 && <tr><td colSpan={4} className="ps-imp-sub">No approved, matched images yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- 7. Approval ---------------- */}
      {stage === 'approve' && (
        <section className="ps-imp-card">
          <h2>7. Approval</h2>
          <ul className="ps-imp-confirm-list">
            <li><b>{ready.length}</b> image(s) ready; <b>{plan.length - ready.length}</b> approved image(s) blocked.</li>
            <li>No product would be published, activated or otherwise changed apart from empty image fields.</li>
          </ul>
          {!LIVE_IMAGE_WRITES_ENABLED ? (
            <div className="ps-imp-alert is-warn">
              <ShieldAlert size={14} /> Uploads and assignments are disabled in this build (LIVE_IMAGE_WRITES_ENABLED = false in
              src/admin/images/imageWorkflow.js). Enabling them is a code change that needs explicit approval.
            </div>
          ) : (
            <>
              <label className="ps-imp-verify">
                <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                I reviewed every image and its product, and approve uploading and assigning them.
              </label>
              <label className="ps-imp-confirm-word">
                Type <b>{CONFIRM_WORD}</b> to confirm
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </label>
              <div className="ps-imp-actions">
                <button
                  type="button"
                  className="ps-btn-gold-primary"
                  disabled={running || !confirmChecked || confirmText.trim() !== CONFIRM_WORD || ready.length === 0}
                  onClick={runLive}
                >
                  {running ? 'Working…' : `Upload and assign ${ready.length} image(s)`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- 8. Results ---------------- */}
      {stage === 'results' && (
        <section className="ps-imp-card">
          <h2>8. Results</h2>
          <p className="ps-imp-help">
            {Object.keys(results).length === 0
              ? 'Dry run: nothing was uploaded or assigned. The manifest records the planned state of every image slot.'
              : 'Results of the last run. Download the manifest for the full record.'}
          </p>
          <ul className="ps-imp-confirm-list">
            <li>Slots in scope: <b>{entries.length}</b> · eligible: <b>{eligible.length}</b> · with an assigned file: <b>{Object.keys(match.fileForEntry).length}</b></li>
            <li>Files needing a decision (ambiguous, conflict, unmatched): <b>{match.files.filter((f) => ['ambiguous', 'conflict', 'unmatched'].includes(f.status)).length}</b></li>
            <li>Eligible slots without an image: <b>{eligible.filter((e) => !match.fileForEntry[e.id]).length}</b></li>
          </ul>
          {Object.keys(results).length > 0 && (
            <div className="ps-admin-table-container ps-imp-scroll">
              <table className="ps-imp-table">
                <thead><tr><th>Product slot</th><th>Upload</th><th>Assignment</th></tr></thead>
                <tbody>
                  {Object.entries(results).map(([id, r]) => (
                    <tr key={id}>
                      <td>{entryById.get(id)?.productName} — {ROLE_LABEL[entryById.get(id)?.role]}</td>
                      <td className="ps-imp-sub">{r.upload}</td>
                      <td className="ps-imp-sub">{r.assignment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ps-imp-actions is-left">
            <button type="button" className="ps-imp-btn" onClick={downloadManifest}>
              <Download size={14} /> Download manifest (CSV)
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
