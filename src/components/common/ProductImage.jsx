import React, { useCallback, useEffect, useRef, useState } from 'react';
import './ProductImage.css';

// How far an image's proportions may differ from its frame before it is shown whole instead of
// filling the frame: taller than 90% of the frame's ratio would lose the cap or the label badge
// at the bottom; wider than 190% would lose most of the bottle's surroundings and edges.
const TALLER_LIMIT = 0.9;
const WIDER_LIMIT = 1.9;

/**
 * A product photo that fills its frame (the parent sets the frame's size and aspect ratio).
 *
 * Product photos come in different shapes (from 0.64 to 1.25 width:height in the catalogue), so
 * each one is handled once it has loaded:
 * - close to the frame's shape, or wider: it fills the frame (object-fit: cover, centred), so
 *   only the sides of the scene are trimmed and the bottle, cap and label stay whole;
 * - much taller or much wider than the frame: it is shown whole (contain), and the rest of the
 *   frame is filled with a soft, blurred copy of the same photo instead of empty borders. The
 *   copy uses the same file, so nothing extra is downloaded.
 * The stored images are never changed.
 */
export default function ProductImage({
  src,
  alt,
  className = '',
  priority = false,
  width = 400,
  height = 500,
  onError,
}) {
  const [fit, setFit] = useState('cover');
  // The photo fades in once loaded (and once its fit is known, so it never jumps from filling
  // the frame to being shown whole)
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  const measure = useCallback((img) => {
    setLoaded(true);
    const frame = img.parentElement;
    if (!img.naturalWidth || !img.naturalHeight || !frame?.clientHeight) return;
    const imageRatio = img.naturalWidth / img.naturalHeight;
    const frameRatio = frame.clientWidth / frame.clientHeight;
    const relative = imageRatio / frameRatio;
    setFit(relative < TALLER_LIMIT || relative > WIDER_LIMIT ? 'contain' : 'cover');
  }, []);

  const handleLoad = useCallback((e) => measure(e.currentTarget), [measure]);

  // A photo already in the browser cache may finish before React listens for "load"
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth) measure(img);
    else setLoaded(false);
  }, [src, measure]);

  return (
    <>
      {fit === 'contain' && (
        <img className="ps-pimg-backdrop" src={src} alt="" aria-hidden="true" decoding="async" loading="lazy" />
      )}
      <img
        src={src}
        alt={alt}
        ref={imgRef}
        className={`ps-pimg is-${fit}${priority ? ' is-priority' : loaded ? ' is-loaded' : ''} ${className}`}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={onError}
      />
    </>
  );
}
