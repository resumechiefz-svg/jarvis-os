/**
 * Content Style Library — wide variety of visual styles and formats
 * Agent picks what fits the topic best and hasn't been done recently
 * Nothing repeats within 8 videos. No house style. Top quality every time.
 */

export interface ContentStyle {
  id: string
  name: string
  visualDescription: string    // What to put in image prompts
  energyLevel: 'high' | 'medium' | 'chill'
  bestFor: string[]            // Topics this style works well for
  textStyle: string            // How overlays look
  exampleAngle: string         // Example of how this style approaches content
}

export const CONTENT_STYLES: ContentStyle[] = [
  {
    id: 'toy_minifigure',
    name: 'Toy Minifigure',
    visualDescription: 'plastic toy minifigure character, blocky cartoon style, smooth plastic texture, round yellow head, simple facial expression, cylindrical clamp hands, primary colors, clean white background, flat cartoon illustration, no real humans',
    energyLevel: 'high',
    bestFor: ['career advice', 'finance', 'workplace humor', 'relatable struggles'],
    textStyle: 'bold_center with green box cards',
    exampleAngle: 'Corporate pain points made funny through the toy character treating serious situations absurdly seriously',
  },
  {
    id: 'dark_luxury',
    name: 'Dark Luxury',
    visualDescription: 'ultra-dark cinematic aesthetic, deep navy and black backgrounds, subtle gold accents, dramatic side lighting, moody atmosphere, high contrast, luxury brand energy, editorial photography style, clean minimal composition',
    energyLevel: 'medium',
    bestFor: ['premium positioning', 'career elevation', 'high-value content', 'serious topics'],
    textStyle: 'thin gold text on dark, minimal',
    exampleAngle: 'Your career is a business. Treat it like one. Premium advice with premium presentation.',
  },
  {
    id: 'retro_pixel',
    name: 'Retro Pixel / 8-bit',
    visualDescription: 'retro pixel art style, 8-bit video game aesthetic, pixelated characters, bright colors, black background, arcade game UI elements, health bars and stat displays, game over screens, level up animations',
    energyLevel: 'high',
    bestFor: ['job search journey', 'skill building', 'career progression', 'younger audience'],
    textStyle: 'pixel font, game UI overlays',
    exampleAngle: 'Job hunting is a video game. Here are the cheat codes.',
  },
  {
    id: 'newspaper_editorial',
    name: 'Newspaper / Breaking News',
    visualDescription: 'old school newspaper front page design, broadsheet layout, bold headline typography, black and white with yellow highlight accents, breaking news ticker, photo columns, ink texture, urgent news energy',
    energyLevel: 'high',
    bestFor: ['myth busting', 'industry news', 'contrarian takes', 'data reveals'],
    textStyle: 'headline bold text, news ticker style',
    exampleAngle: 'BREAKING: Everything you know about resumes is wrong. Sources: actual hiring managers.',
  },
  {
    id: 'minimalist_white',
    name: 'Ultra-Minimalist',
    visualDescription: 'pure white background, single simple object or icon, massive white space, one accent color (electric blue or bright green), clean sans-serif design, Apple keynote aesthetic, nothing unnecessary in frame',
    energyLevel: 'medium',
    bestFor: ['tips and frameworks', 'clean explainers', 'premium content', 'professional topics'],
    textStyle: 'large clean type, single accent color',
    exampleAngle: 'Less is more. One idea per scene, said perfectly.',
  },
  {
    id: 'sports_broadcast',
    name: 'Sports Broadcast / Scoreboard',
    visualDescription: 'sports broadcast graphic style, team colors, scoreboard layouts, stats overlays like ESPN, stadium crowd blur in background, game analysis energy, bold sans-serif numbers, playoff graphic design',
    energyLevel: 'high',
    bestFor: ['competitive job market', 'career stats', 'performance reviews', 'goal tracking'],
    textStyle: 'sports score graphics, bracket-style',
    exampleAngle: 'The job market is a sport. Here are the stats that actually matter.',
  },
  {
    id: 'nature_documentary',
    name: 'Nature Documentary',
    visualDescription: 'David Attenborough style, lush natural environments, macro photography aesthetic, wildlife documentary lighting, animals observing office situations, Planet Earth color grading, majestic wide shots',
    energyLevel: 'chill',
    bestFor: ['workplace behavior', 'office dynamics', 'human psychology', 'funny takes'],
    textStyle: 'documentary subtitle style, white lower thirds',
    exampleAngle: 'In their natural habitat, the job seeker applies for 200 roles. Most will not survive ATS screening.',
  },
  {
    id: 'neon_cyberpunk',
    name: 'Neon Cyberpunk',
    visualDescription: 'cyberpunk city 2070, neon pink and electric blue lighting, rain-slicked streets, holographic UI elements, futuristic terminal screens, blade runner atmosphere, digital glitch effects, high tech low life',
    energyLevel: 'high',
    bestFor: ['AI tools', 'future of work', 'tech careers', 'innovation topics'],
    textStyle: 'glitch text, neon outlines, terminal font',
    exampleAngle: 'The future of hiring is already here. Most people don't know how to navigate it yet.',
  },
  {
    id: 'vintage_infographic',
    name: 'Vintage Infographic / 1950s Ad',
    visualDescription: '1950s American advertisement illustration style, retro family characters, vintage color palette (teal, coral, cream), mid-century modern design, clean optimistic illustration, saturday evening post aesthetic',
    energyLevel: 'medium',
    bestFor: ['timeless advice', 'contrast with modern reality', 'nostalgic humor', 'cultural commentary'],
    textStyle: 'retro ad copy style, serif vintage fonts',
    exampleAngle: 'Back in 1955, getting a job was simple. Here\'s what changed and what still works.',
  },
  {
    id: 'whiteboard_animation',
    name: 'Whiteboard / Sketch Style',
    visualDescription: 'white background, hand-drawn sketch illustration style, marker pen aesthetic, simple stick figure characters with expressive faces, diagrams being drawn, arrows and annotations, classroom whiteboard feel',
    energyLevel: 'medium',
    bestFor: ['explaining concepts', 'frameworks', 'tutorials', 'step-by-step content'],
    textStyle: 'marker font, hand-drawn annotations',
    exampleAngle: 'Let me draw you a picture. Because most career advice makes way more sense with a diagram.',
  },
  {
    id: 'mockumentary',
    name: 'Mockumentary / The Office Style',
    visualDescription: 'documentary style handheld camera aesthetic, fluorescent office lighting, realistic office setting, talking head interview setup, candid moment captures, awkward social dynamics, mundane details made significant',
    energyLevel: 'medium',
    bestFor: ['workplace humor', 'office culture', 'job search satire', 'employer behavior'],
    textStyle: 'documentary lower thirds, interview captions',
    exampleAngle: 'We followed 10 job seekers for 30 days. What we saw was painful. And completely avoidable.',
  },
  {
    id: 'data_visualization',
    name: 'Data Dashboard / Analytics',
    visualDescription: 'clean data dashboard aesthetic, charts and graphs on dark background, subtle grid lines, accent colors for data points, analytics platform design, executive dashboard style, numbers that tell a story',
    energyLevel: 'medium',
    bestFor: ['statistics', 'market data', 'performance metrics', 'research reveals'],
    textStyle: 'data labels, chart annotations, KPI cards',
    exampleAngle: 'The data on job searching is brutal. Here\'s what it actually tells you to do.',
  },
  {
    id: 'comic_book',
    name: 'Comic Book / Graphic Novel',
    visualDescription: 'comic book panel illustration style, bold black ink outlines, halftone dot texture, bright primary colors, speech bubble layouts, action line effects, superhero comic aesthetic, Marvel/DC visual energy',
    energyLevel: 'high',
    bestFor: ['transformation stories', 'overcoming challenges', 'career heroes', 'motivational content'],
    textStyle: 'comic caption boxes, speech bubbles, action words',
    exampleAngle: 'Every great career story has an origin. Here\'s how to write yours.',
  },
  {
    id: 'instagram_aesthetic',
    name: 'Instagram / Social Native',
    visualDescription: 'instagram-native aesthetic, warm golden hour lighting, lifestyle photography style, aspirational but authentic, millennial pink and earthy tones, clean flat lay compositions, visual content creator energy',
    energyLevel: 'chill',
    bestFor: ['personal brand', 'lifestyle content', 'aspirational topics', 'behind the scenes'],
    textStyle: 'Instagram caption style, story text overlays',
    exampleAngle: 'The version of you that gets hired looks a lot like the version of you that shows up on LinkedIn. Here\'s the gap.',
  },
  {
    id: 'abstract_motion',
    name: 'Abstract / Motion Graphics',
    visualDescription: 'abstract motion graphics aesthetic, flowing geometric shapes, gradient color transitions, morphing forms, particle systems, visual metaphors through shape and color, premium motion design studio quality',
    energyLevel: 'high',
    bestFor: ['concepts and ideas', 'premium brand feel', 'emotional topics', 'identity content'],
    textStyle: 'kinetic typography, animated text reveals',
    exampleAngle: 'Some ideas are too important for literal visuals. The feeling IS the message.',
  },
]

// Card Chiefz specific styles
export const CARD_STYLES: ContentStyle[] = [
  {
    id: 'card_show',
    name: 'Card Show Floor',
    visualDescription: 'sports card show floor photography, display cases with graded cards, neon price tags, serious collectors examining cards, hustle and energy, overhead lighting on plastic cases, real collector environment',
    energyLevel: 'high',
    bestFor: ['market updates', 'buying tips', 'collection advice', 'grading topics'],
    textStyle: 'price tag style labels, bold market data',
    exampleAngle: 'From the floor of the card show. Here\'s what\'s actually moving right now.',
  },
  {
    id: 'vault_aesthetic',
    name: 'The Vault',
    visualDescription: 'bank vault aesthetic, dramatic lighting on PSA slabs, dark moody background, single card spotlight, wealth and value energy, museum display quality, cinematic card photography',
    energyLevel: 'medium',
    bestFor: ['premium cards', 'investment angles', 'grading reveals', 'big moves'],
    textStyle: 'vault/luxury text, gold accents',
    exampleAngle: 'This card has been sitting in someone\'s closet for 20 years. Here\'s what it\'s worth now.',
  },
]

// Track recently used styles to avoid repetition
export function getStyleForVideo(
  channel: 'cardchiefz' | 'resumechiefz',
  recentStyleIds: string[],
  topic?: string
): ContentStyle {
  const pool = channel === 'cardchiefz'
    ? [...CONTENT_STYLES.filter(s => ['toy_minifigure', 'dark_luxury', 'sports_broadcast', 'data_visualization', 'newspaper_editorial', 'vintage_infographic'].includes(s.id)), ...CARD_STYLES]
    : CONTENT_STYLES

  // Filter out recently used
  const available = pool.filter(s => !recentStyleIds.slice(0, 6).includes(s.id))
  const fallback = pool.filter(s => !recentStyleIds.slice(0, 3).includes(s.id))
  const candidates = available.length > 0 ? available : fallback.length > 0 ? fallback : pool

  // Random selection from candidates (no algorithmic lock-in)
  return candidates[Math.floor(Math.random() * candidates.length)]
}
