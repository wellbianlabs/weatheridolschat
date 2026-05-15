/**
 * Soft pastel summer K-pop palette — inspired by Weather Idols official artwork.
 *
 * - Cream paper background that fades to sky blue (gradient)
 * - Pink → lavender → purple wordmark gradient
 * - Deep plum ink for premium contrast
 * - Character accents softened to pastel territory
 */
export const colorTokens = {
  brand: {
    primary: '#241B3E', // deep plum ink
    secondary: '#6A5F8A',
    accent: '#F49ABE', // signature soft pink (CTA)
    paper: '#FFFAF3', // cream
    paperWarm: '#FFF1E4', // peach cream
    paperSky: '#E6F0FB', // sky tint
    paperLilac: '#F0E8FB', // lilac mist
    ink: '#241B3E',
    inkSoft: '#5E5478',
    chrome: '#E7DDF0',
  },

  /** Gradient stops — soft & atmospheric, never neon. */
  holo: {
    wordmark: ['#F49ABE', '#C9A4E5', '#9A8FE0'],
    paperSky: ['#FFFAF3', '#E6F0FB'],
    paperWarm: ['#FFF1E4', '#F0E8FB'],
    sunset: ['#FFC9A4', '#F49ABE', '#C9A4E5'],
    deep: ['#241B3E', '#5E5478'],
  },

  character: {
    sunny: {
      primary: '#E48F5A', // warm amber-peach
      soft: '#FFE5D2',
      ink: '#5A2A0F',
      accent: '#F3C9A2',
    },
    rain: {
      primary: '#7AA5CF', // soft sky
      soft: '#DCEAF6',
      ink: '#1A3759',
      accent: '#B2CCE3',
    },
    cloudy: {
      primary: '#B79ECC', // dusty lilac
      soft: '#EADCF3',
      ink: '#3D2A56',
      accent: '#CFBADD',
    },
    thunder: {
      primary: '#7A6BB5', // muted electric purple
      soft: '#D9CFEC',
      ink: '#241B3E',
      accent: '#A398CB',
    },
  },

  weather: {
    clear: ['#FFFAF3', '#FFE3D0', '#FFC9A4'],
    clouds: ['#F4EFE6', '#E0D7C7', '#C7BBAA'],
    rain: ['#E6F0FB', '#B8D0E7', '#7AA5CF'],
    drizzle: ['#EEF3FA', '#C9DAE9', '#9CB5CE'],
    thunder: ['#E5D8F5', '#A89BCF', '#5E4F8A'],
    snow: ['#FCFAF7', '#EDE6DC', '#D9CFC1'],
    mist: ['#F0EAE2', '#D8CDBE', '#B5A99A'],
  },

  semantic: {
    success: '#7AAC8E',
    warning: '#E4A86B',
    danger: '#D67B7B',
    info: '#7AA5CF',

    bg: {
      default: '#FFFAF3',
      subtle: '#F4ECE0',
      overlay: 'rgba(36,27,62,0.45)',
    },
    surface: {
      card: '#FFFFFF',
      cardElev: '#FFFFFF',
      muted: '#FBF3E8',
    },
    text: {
      primary: '#241B3E',
      secondary: '#5E5478',
      muted: '#9890AC',
      inverse: '#FFFAF3',
    },
    border: {
      default: '#EBDDE5',
      strong: '#D5BFD4',
      focus: '#F49ABE',
    },
  },
} as const;
