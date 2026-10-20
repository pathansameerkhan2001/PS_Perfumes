import attarArt from '../../assets/categories/fragrance-attar.png';
import perfumeArt from '../../assets/categories/fragrance-perfume.png';
import bakhoorArt from '../../assets/categories/fragrance-bakhoor.png';
import muskyArt from '../../assets/categories/fragrance-musky.png';
import oudArt from '../../assets/categories/fragrance-oud.png';
import floralArt from '../../assets/categories/fragrance-floral.png';
import woodyArt from '../../assets/categories/fragrance-woody.png';

// heroImage: built-in artwork for each fragrance family. An image set on the category in
// Admin → Categories (categories.image_url) takes precedence (see CollectionPage.jsx).
// Master category configuration for all 7 fragrance categories
export const CATEGORY_CONFIG = {
  attar: {
    slug: 'attar',
    name: 'Attar',
    title: 'Attar',
    fallbackDescription:
      '100% pure concentrated fragrance oils, non-alcoholic and artisanal distilled.',
    heroImage: attarArt,
    metaTitle: 'PS PERFUMES | Attar',
    metaDescription:
      'Discover pure non-alcoholic artisanal attars distilled from rare florals, aged agarwood, and Mysore sandalwood.',
  },
  perfume: {
    slug: 'perfume',
    name: 'Perfume',
    title: 'Perfume',
    fallbackDescription:
      'Haute Parfumerie & Extrait de Parfum crafted for enduring sillage.',
    heroImage: perfumeArt,
    metaTitle: 'PS PERFUMES | Perfume',
    metaDescription:
      'Explore master perfumes and extraits de parfum, hand-crafted with rare essences for exceptional longevity.',
  },
  bakhoor: {
    slug: 'bakhoor',
    name: 'Bakhoor',
    title: 'Bakhoor',
    fallbackDescription:
      'Exquisite aromatic wood chips soaked in perfumed essential oils for traditional incense rituals.',
    heroImage: bakhoorArt,
    metaTitle: 'PS PERFUMES | Bakhoor',
    metaDescription:
      'Authentic royal bakhoor and slow-burning scented agarwood chips steeped in Taif rose, amber, and musk.',
  },
  musky: {
    slug: 'musky',
    name: 'Musky',
    title: 'Musky',
    fallbackDescription:
      'Sensual white musk, royal deer musk accords, and intimate velvet undertones.',
    heroImage: muskyArt,
    metaTitle: 'PS PERFUMES | Musky',
    metaDescription:
      'Sensual, clean velvet musk creations that melt into the skin for a magnetic second-skin sillage.',
  },
  oud: {
    slug: 'oud',
    name: 'Oud',
    title: 'Oud',
    fallbackDescription:
      'Precious aged Cambodi, Hindi, and Assam agarwood essences of royal lineage.',
    heroImage: oudArt,
    metaTitle: 'PS PERFUMES | Oud',
    metaDescription:
      'The pinnacle of oriental perfumery: aged pure agarwood distillations, dark resins, and smoky royal ouds.',
  },
  floral: {
    slug: 'floral',
    name: 'Floral',
    title: 'Floral',
    fallbackDescription:
      'Enchanting Bulgarian rose damascena, jasmine sambac, and ethereal blossoms.',
    heroImage: floralArt,
    metaTitle: 'PS PERFUMES | Floral',
    metaDescription:
      'Captivating floral fragrances featuring hand-picked dawn roses, white jasmine blossoms, and lush botanicals.',
  },
  woody: {
    slug: 'woody',
    name: 'Woody',
    title: 'Woody',
    fallbackDescription:
      'Smoked cedar, Mysore sandalwood, vetiver, and midnight birch accords.',
    heroImage: woodyArt,
    metaTitle: 'PS PERFUMES | Woody',
    metaDescription:
      'Rich architectural woods, smoked cedar, pure Mysore sandalwood, and damp vetiver extractions.',
  },
};
