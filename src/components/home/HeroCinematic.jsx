import React, { useEffect, useRef } from 'react';
import { getStoragePublicUrl } from '../../lib/storage';
import posterFallback from '../../assets/hero-desktop.webp';
import './HeroCinematic.css';

const HERO_VIDEO_PATH = 'hero/ps-perfumes-hero-desktop.mp4';
const HERO_VIDEO_FALLBACK =
  'https://jnrmmhzhhmjxefapkemv.supabase.co/storage/v1/object/public/ps-perfumes/hero/ps-perfumes-hero-desktop.mp4';

/**
 * PS PERFUMES — Luxury Cinematic Hero Video
 * Autoplaying, muted, looping video with zero button/text overlays.
 * Uses official Supabase Storage asset: bucket 'ps-perfumes', path 'hero/ps-perfumes-hero-desktop.mp4'
 */
export default function HeroCinematic() {
  const videoRef = useRef(null);

  const videoUrl = getStoragePublicUrl(HERO_VIDEO_PATH) || HERO_VIDEO_FALLBACK;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Strict browser muted autoplay compliance across Chrome, Safari, Edge, and Firefox
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const playVideo = () => {
      const promise = video.play();
      if (promise !== undefined) {
        promise.catch((err) => {
          console.info('Hero video autoplay deferred by browser policy:', err?.message || err);
        });
      }
    };

    if (video.readyState >= 2) {
      playVideo();
    } else {
      video.addEventListener('canplay', playVideo, { once: true });
      video.addEventListener('loadeddata', playVideo, { once: true });
      playVideo();
    }

    return () => {
      video.removeEventListener('canplay', playVideo);
      video.removeEventListener('loadeddata', playVideo);
    };
  }, [videoUrl]);

  return (
    <section className="ps-hero-cinematic" aria-label="PS PERFUMES Campaign Video">
      <div className="ps-hero-media-wrapper">
        <video
          ref={videoRef}
          className="ps-hero-cinematic-video"
          src={videoUrl}
          poster={posterFallback}
          autoPlay
          muted
          loop
          playsInline
          webkit-playsinline="true"
          preload="auto"
          disablePictureInPicture
          controls={false}
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-label="PS PERFUMES Haute Parfumerie Video"
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      </div>
    </section>
  );
}
