import video1 from '../assets/insta-video-1.mp4';
import video2 from '../assets/insta-video-2.mp4';
import video3 from '../assets/insta-video-3.mp4';
import video4 from '../assets/insta-video-4.mp4';
import poster1 from '../assets/insta-poster-1.jpg';
import poster2 from '../assets/insta-poster-2.jpg';
import poster3 from '../assets/insta-poster-3.jpg';
import poster4 from '../assets/insta-poster-4.jpg';
import './InstagramSection.css';

function InstagramIcon({ size = 24, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const INSTA_POSTS = [
  {
    id: 1,
    video: video1,
    poster: poster1,
    caption: 'Boutique fragrance unboxing & bespoke gift presentation',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 2,
    video: video2,
    poster: poster2,
    caption: 'Haute couture runway featuring our signature amber extractions',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 3,
    video: video3,
    poster: poster3,
    caption: 'Artisanal atelier compounding & rare agarwood distillation',
    handle: '@ps_perfumes_kadapa',
  },
  {
    id: 4,
    video: video4,
    poster: poster4,
    caption: 'Royal crystal coffret packaging with handcrafted gold stopper',
    handle: '@ps_perfumes_kadapa',
  },
];

const INSTAGRAM_URL = 'https://www.instagram.com/ps_perfumes_kadapa/?hl=en';

export default function InstagramSection() {
  return (
    <section className="ps-insta-section" aria-label="Follow us on Instagram">
      <div className="ps-insta-container">
        {/* Section Header */}
        <div className="ps-insta-header">
          <h2 className="ps-insta-heading">Follow us Instagram</h2>
          <p className="ps-insta-description">
            Tag{' '}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ps-insta-tag-link"
            >
              @ps_perfumes_kadapa
            </a>{' '}
            in your Instagram photos or video for a chance to be featured here.
            <br />
            Find more inspiration on{' '}
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ps-insta-bold-link"
            >
              our Instagram.
            </a>
          </p>
        </div>

        {/* 4 Media Cards */}
        <div className="ps-insta-grid">
          {INSTA_POSTS.map((post) => (
            <a
              key={post.id}
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ps-insta-card"
              aria-label={`View Instagram post: ${post.caption}`}
            >
              <div className="ps-insta-media-wrapper">
                <video
                  src={post.video}
                  poster={post.poster}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="ps-insta-video"
                  preload="metadata"
                />
                
                {/* Hover overlay with Instagram icon and handle */}
                <div className="ps-insta-overlay">
                  <div className="ps-insta-overlay-content">
                    <span className="ps-insta-icon-badge">
                      <InstagramIcon size={24} />
                    </span>
                    <span className="ps-insta-overlay-handle">@ps_perfumes_kadapa</span>
                    <span className="ps-insta-overlay-cta">View On Instagram</span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
