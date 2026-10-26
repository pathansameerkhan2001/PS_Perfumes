import React, { useState } from 'react';
import './OptimizedImage.css';

/**
 * High-performance responsive image component with:
 * - Built-in skeleton shimmer placeholder
 * - Aspect ratio enforcement (prevents CLS)
 * - Automatic loading priority (eager + fetchPriority="high" for hero, lazy for others)
 * - Smooth fade-in on load
 * - Fallback handling (fallbackSrc is tried once before the brand placeholder)
 */
export default function OptimizedImage({
  src,
  fallbackSrc,
  alt = '',
  className = '',
  wrapperClassName = '',
  aspectRatio = '3 / 4',
  width,
  height,
  priority = false,
  sizes,
  srcSet,
  onClick,
  style = {},
  imgStyle = {},
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const currentSrc = useFallback ? fallbackSrc : src;

  return (
    <div
      className={`ps-opt-img-wrapper ${isLoaded ? 'is-loaded' : ''} ${wrapperClassName}`}
      style={{
        aspectRatio,
        ...style,
      }}
      onClick={onClick}
    >
      {/* Shimmer skeleton until image decodes */}
      {!isLoaded && !hasError && <div className="ps-opt-img-shimmer" aria-hidden="true" />}

      {hasError ? (
        <div className="ps-opt-img-fallback" role="img" aria-label={alt}>
          <span>PS PERFUMES</span>
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
          sizes={sizes}
          srcSet={srcSet}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (!useFallback && fallbackSrc && fallbackSrc !== src) setUseFallback(true);
            else setHasError(true);
          }}
          className={`ps-opt-img ${isLoaded ? 'is-loaded' : ''} ${className}`}
          style={imgStyle}
        />
      )}
    </div>
  );
}
