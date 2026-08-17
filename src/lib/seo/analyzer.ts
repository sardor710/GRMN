import type {
  CMSProduct,
  CMSBlog,
  SEOCheckItem,
  SEOScoreReport,
  PageSEOAudit,
} from "@/lib/cms/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateGrade(score: number): {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'excellent' | 'good' | 'needs_work' | 'critical';
} {
  if (score >= 90) return { grade: 'A+', status: 'excellent' };
  if (score >= 80) return { grade: 'A', status: 'excellent' };
  if (score >= 70) return { grade: 'B', status: 'good' };
  if (score >= 55) return { grade: 'C', status: 'needs_work' };
  if (score >= 40) return { grade: 'D', status: 'needs_work' };
  return { grade: 'F', status: 'critical' };
}

// ---------------------------------------------------------------------------
// Product SEO Analyzer
// ---------------------------------------------------------------------------

export function analyzeProductSEO(product: Partial<CMSProduct>): SEOScoreReport {
  const checks: SEOCheckItem[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const title = (product.seoTitle || product.name || '').trim();
  const description = (product.seoDescription || product.description || '').trim();
  const keywords = product.focusKeywords || [];
  const specs = product.specs || [];
  const image = product.image || product.ogImage || '';

  // 1. Title Checks (25 pts max)
  if (!title) {
    checks.push({
      id: 'title_missing',
      label: 'Meta Title',
      status: 'fail',
      message: 'Product is missing a meta title.',
      impact: 'high',
    });
    suggestions.push('Add a descriptive SEO title containing the product model and brand name.');
    score -= 25;
  } else if (title.length < 35) {
    checks.push({
      id: 'title_length',
      label: 'Meta Title Length',
      status: 'warning',
      message: `Title is only ${title.length} characters (ideal: 45–65). Too brief for search intent.`,
      impact: 'medium',
    });
    suggestions.push('Expand title with key features or family name (e.g. "fēnix 8 AMOLED | Multisport GPS Smartwatch").');
    score -= 10;
  } else if (title.length > 70) {
    checks.push({
      id: 'title_length',
      label: 'Meta Title Length',
      status: 'warning',
      message: `Title is ${title.length} characters. It may get truncated in Google search results.`,
      impact: 'low',
    });
    suggestions.push('Shorten title to under 65 characters to prevent snippet ellipsis.');
    score -= 5;
  } else {
    checks.push({
      id: 'title_length',
      label: 'Meta Title Length',
      status: 'pass',
      message: `Optimal length (${title.length} characters). Renders cleanly in search snippets.`,
      impact: 'low',
    });
  }

  // Brand in Title
  if (title && !title.toLowerCase().includes('garmin')) {
    checks.push({
      id: 'title_brand',
      label: 'Brand Presence',
      status: 'warning',
      message: 'Title does not include "Garmin" brand keyword.',
      impact: 'medium',
    });
    suggestions.push('Append "| Garmin" or "Garmin" to capture high-authority branded searches.');
    score -= 8;
  } else if (title) {
    checks.push({
      id: 'title_brand',
      label: 'Brand Presence',
      status: 'pass',
      message: 'Includes official Garmin brand anchor.',
      impact: 'low',
    });
  }

  // 2. Meta Description Checks (25 pts max)
  if (!description) {
    checks.push({
      id: 'desc_missing',
      label: 'Meta Description',
      status: 'fail',
      message: 'No meta description found. Search engines will generate an arbitrary snippet.',
      impact: 'high',
    });
    suggestions.push('Write an engaging meta description highlighting top specs and key buying benefits.');
    score -= 25;
  } else if (description.length < 80) {
    checks.push({
      id: 'desc_length',
      label: 'Description Length',
      status: 'warning',
      message: `Description is ${description.length} characters (ideal: 120–160). Too short for rich previews.`,
      impact: 'medium',
    });
    suggestions.push('Include more battery life or GPS display details to reach ~140 characters.');
    score -= 10;
  } else if (description.length > 175) {
    checks.push({
      id: 'desc_length',
      label: 'Description Length',
      status: 'warning',
      message: `Description is ${description.length} characters and will truncate on mobile search results.`,
      impact: 'low',
    });
    suggestions.push('Trim description to under 160 characters.');
    score -= 5;
  } else {
    checks.push({
      id: 'desc_length',
      label: 'Description Length',
      status: 'pass',
      message: `Optimal length (${description.length} characters). Fits full snippet length.`,
      impact: 'low',
    });
  }

  // 3. Keyword Density Checks (20 pts max)
  if (keywords.length === 0) {
    checks.push({
      id: 'keywords_missing',
      label: 'Focus Keywords',
      status: 'warning',
      message: 'No target focus keywords assigned to this product.',
      impact: 'medium',
    });
    suggestions.push('Add 3-5 focus keywords (e.g. "multisport GPS watch", "Garmin fenix 8 review").');
    score -= 15;
  } else {
    let matched = 0;
    const lowerText = `${title} ${description}`.toLowerCase();
    keywords.forEach((kw) => {
      if (lowerText.includes(kw.toLowerCase().trim())) matched++;
    });

    if (matched === 0) {
      checks.push({
        id: 'keywords_match',
        label: 'Keyword Optimization',
        status: 'warning',
        message: 'None of the target focus keywords appear in the title or description.',
        impact: 'medium',
      });
      suggestions.push('Naturally insert primary focus keywords into the meta title or first sentence.');
      score -= 10;
    } else {
      checks.push({
        id: 'keywords_match',
        label: 'Keyword Optimization',
        status: 'pass',
        message: `${matched}/${keywords.length} target keywords aligned across meta headers.`,
        impact: 'low',
      });
    }
  }

  // 4. Structured Data & Rich Snippet Readiness (15 pts max)
  if (specs.length >= 3 && product.price && image) {
    checks.push({
      id: 'schema_readiness',
      label: 'Google Rich Snippet Schema',
      status: 'pass',
      message: 'Product has complete price, specs, and image for Google Product JSON-LD.',
      impact: 'low',
    });
  } else {
    checks.push({
      id: 'schema_readiness',
      label: 'Google Rich Snippet Schema',
      status: 'warning',
      message: 'Missing complete specifications or pricing for maximal Google rich result badges.',
      impact: 'medium',
    });
    score -= 10;
  }

  // 5. Visual / Social OpenGraph (15 pts max)
  if (image) {
    checks.push({
      id: 'og_image',
      label: 'Social Share & OpenGraph Media',
      status: 'pass',
      message: 'High-resolution product image available for Facebook/Twitter share cards.',
      impact: 'low',
    });
  } else {
    checks.push({
      id: 'og_image',
      label: 'Social Share & OpenGraph Media',
      status: 'fail',
      message: 'No featured preview image. Social shares will display blank placeholders.',
      impact: 'high',
    });
    score -= 15;
  }

  // Normalization
  score = Math.max(10, Math.min(100, score));
  const { grade, status } = calculateGrade(score);

  return {
    score,
    grade,
    status,
    checks,
    suggestions: suggestions.length > 0 ? suggestions : ['Product SEO is fully optimized for top Google search visibility!'],
  };
}

// ---------------------------------------------------------------------------
// Blog SEO Analyzer
// ---------------------------------------------------------------------------

export function analyzeBlogSEO(blog: Partial<CMSBlog>): SEOScoreReport {
  const checks: SEOCheckItem[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const title = (blog.seoTitle || blog.title || '').trim();
  const description = (blog.seoDescription || blog.excerpt || '').trim();
  const keywords = blog.focusKeywords || [];
  const content = blog.content || '';
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const image = blog.coverImage || blog.ogImage || '';

  // 1. Title Checks
  if (!title) {
    checks.push({
      id: 'blog_title_missing',
      label: 'Meta Title',
      status: 'fail',
      message: 'Article is missing an SEO title.',
      impact: 'high',
    });
    score -= 25;
  } else if (title.length < 30) {
    checks.push({
      id: 'blog_title_length',
      label: 'Meta Title Length',
      status: 'warning',
      message: `Title is ${title.length} characters (ideal: 45–65). Too short for article search queries.`,
      impact: 'medium',
    });
    score -= 10;
  } else if (title.length > 70) {
    checks.push({
      id: 'blog_title_length',
      label: 'Meta Title Length',
      status: 'warning',
      message: `Title is ${title.length} characters. Will truncate on Google search snippets.`,
      impact: 'low',
    });
    score -= 5;
  } else {
    checks.push({
      id: 'blog_title_length',
      label: 'Meta Title Length',
      status: 'pass',
      message: `Ideal title length (${title.length} characters).`,
      impact: 'low',
    });
  }

  // 2. Meta Description Checks
  if (!description) {
    checks.push({
      id: 'blog_desc_missing',
      label: 'Meta Description',
      status: 'fail',
      message: 'No meta description or article excerpt defined.',
      impact: 'high',
    });
    score -= 25;
  } else if (description.length < 80) {
    checks.push({
      id: 'blog_desc_length',
      label: 'Description Length',
      status: 'warning',
      message: `Description is ${description.length} chars (ideal: 120–160).`,
      impact: 'medium',
    });
    score -= 10;
  } else {
    checks.push({
      id: 'blog_desc_length',
      label: 'Description Length',
      status: 'pass',
      message: `Optimal article summary (${description.length} characters).`,
      impact: 'low',
    });
  }

  // 3. Article Content Depth (E-E-A-T)
  if (wordCount < 150) {
    checks.push({
      id: 'blog_word_count',
      label: 'Content Depth',
      status: 'warning',
      message: `Thin content detected (${wordCount} words). High-ranking articles typically exceed 400+ words.`,
      impact: 'high',
    });
    suggestions.push('Add in-depth training tips, device walkthroughs, or athlete insights.');
    score -= 15;
  } else {
    checks.push({
      id: 'blog_word_count',
      label: 'Content Depth',
      status: 'pass',
      message: `Substantial content depth (${wordCount} words).`,
      impact: 'low',
    });
  }

  // 4. Focus Keywords Check
  if (keywords.length === 0) {
    checks.push({
      id: 'blog_keywords_missing',
      label: 'Focus Keywords',
      status: 'warning',
      message: 'No focus search keywords assigned to this article.',
      impact: 'medium',
    });
    score -= 10;
  } else {
    checks.push({
      id: 'blog_keywords_match',
      label: 'Focus Keywords',
      status: 'pass',
      message: `${keywords.length} target search keywords configured for article indexing.`,
      impact: 'low',
    });
  }

  // 4. Author & Trustworthiness
  if (blog.author && blog.author.trim() !== '') {
    checks.push({
      id: 'blog_author',
      label: 'E-E-A-T Author Signal',
      status: 'pass',
      message: `Attributed to author "${blog.author}".`,
      impact: 'low',
    });
  } else {
    checks.push({
      id: 'blog_author',
      label: 'E-E-A-T Author Signal',
      status: 'warning',
      message: 'Missing named author for Google editorial trust score.',
      impact: 'low',
    });
    score -= 8;
  }

  // 5. Featured Image & Social Cards
  if (image) {
    checks.push({
      id: 'blog_image',
      label: 'Cover & Social Media Media',
      status: 'pass',
      message: 'Cover image ready for OpenGraph and Article rich snippets.',
      impact: 'low',
    });
  } else {
    checks.push({
      id: 'blog_image',
      label: 'Cover & Social Media Media',
      status: 'fail',
      message: 'No cover image assigned to blog post.',
      impact: 'high',
    });
    score -= 15;
  }

  score = Math.max(10, Math.min(100, score));
  const { grade, status } = calculateGrade(score);

  return {
    score,
    grade,
    status,
    checks,
    suggestions: suggestions.length > 0 ? suggestions : ['Blog article SEO is in excellent standing.'],
  };
}

// ---------------------------------------------------------------------------
// 1-Click Smart SEO Meta Generators
// ---------------------------------------------------------------------------

export function generateProductSEOMeta(product: Partial<CMSProduct>): {
  seoTitle: string;
  seoDescription: string;
  focusKeywords: string[];
} {
  const name = product.name || 'Garmin Smartwatch';
  const family = product.family || 'Multisport';
  const category = product.category || 'Smartwatches & Wearables';

  // Extract key features from specs
  const topSpecs = (product.specs || [])
    .slice(0, 2)
    .map((s) => `${s.label}: ${s.value}`)
    .join(', ');

  const title = `${name} | Official Garmin ${family} GPS Smartwatch`;

  let description = `${product.description || `Discover the ${name} with high-precision GPS, advanced performance tracking, and rugged durability.`}`;
  if (topSpecs && description.length < 110) {
    description += ` Featuring ${topSpecs}.`;
  }
  if (!description.toLowerCase().includes('garmin')) {
    description = `Explore the Garmin ${description}`;
  }
  if (description.length < 130) {
    description += ' Buy now with free shipping and official warranty.';
  }
  if (description.length > 160) {
    description = description.slice(0, 155).trim() + '...';
  }

  const cleanKeywords = Array.from(
    new Set([
      `Garmin ${name}`,
      `${name} GPS watch`,
      `${name} specs`,
      `buy ${name}`,
      `Garmin ${family}`,
      category.toLowerCase(),
    ])
  ).slice(0, 5);

  return {
    seoTitle: title.slice(0, 65),
    seoDescription: description,
    focusKeywords: cleanKeywords,
  };
}

export function generateBlogSEOMeta(blog: Partial<CMSBlog>): {
  seoTitle: string;
  seoDescription: string;
  focusKeywords: string[];
} {
  const title = `${blog.title || 'Garmin Story'} | Garmin Fitness & Tech Blog`;
  let description = (blog.excerpt || blog.content || 'Read our in-depth fitness, smartwatch, and adventure guides.')
    .replace(/[#*`]/g, '')
    .trim();

  if (description.length < 110) {
    description += ' Learn expert tips, athlete workouts, and smartwatch features from Garmin.';
  }
  if (description.length > 160) {
    description = description.slice(0, 155).trim() + '...';
  }

  const focusKeywords = [
    blog.category || 'Garmin Fitness',
    `${(blog.title || '').split(' ').slice(0, 3).join(' ')} guide`,
    'Garmin smartwatch tips',
    'fitness tracking',
  ];

  return {
    seoTitle: title.slice(0, 65),
    seoDescription: description,
    focusKeywords,
  };
}

// ---------------------------------------------------------------------------
// Site-Wide SEO Audit Aggregator
// ---------------------------------------------------------------------------

export function getSiteSEOAudit(
  products: CMSProduct[],
  blogs: CMSBlog[]
): {
  overallScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  stats: {
    totalPages: number;
    excellent: number;
    good: number;
    needsWork: number;
    critical: number;
    missingDescriptions: number;
    missingKeywords: number;
  };
  pages: PageSEOAudit[];
} {
  const pages: PageSEOAudit[] = [];
  let totalScore = 0;
  let missingDescriptions = 0;
  let missingKeywords = 0;

  // Audit Products
  products.forEach((p) => {
    const report = analyzeProductSEO(p);
    totalScore += report.score;
    if (!p.seoDescription && !p.description) missingDescriptions++;
    if (!p.focusKeywords || p.focusKeywords.length === 0) missingKeywords++;

    pages.push({
      id: p.id,
      title: p.name,
      type: 'product',
      url: `/p/${p.id}`,
      seoTitle: p.seoTitle || `${p.name} | Garmin`,
      seoDescription: p.seoDescription || p.description,
      score: report.score,
      status: report.status,
      issuesCount: report.checks.filter((c) => c.status !== 'pass').length,
      lastUpdated: p.createdAt,
    });
  });

  // Audit Blogs
  blogs.forEach((b) => {
    const report = analyzeBlogSEO(b);
    totalScore += report.score;
    if (!b.seoDescription && !b.excerpt) missingDescriptions++;
    if (!b.focusKeywords || b.focusKeywords.length === 0) missingKeywords++;

    pages.push({
      id: b.id,
      title: b.title,
      type: 'blog',
      url: `/blog/${b.slug}`,
      seoTitle: b.seoTitle || `${b.title} | Garmin Blog`,
      seoDescription: b.seoDescription || b.excerpt,
      score: report.score,
      status: report.status,
      issuesCount: report.checks.filter((c) => c.status !== 'pass').length,
      lastUpdated: b.publishedAt || b.createdAt,
    });
  });

  const totalPages = pages.length || 1;
  const overallScore = Math.round(totalScore / totalPages);
  const { grade } = calculateGrade(overallScore);

  const stats = {
    totalPages: pages.length,
    excellent: pages.filter((p) => p.status === 'excellent').length,
    good: pages.filter((p) => p.status === 'good').length,
    needsWork: pages.filter((p) => p.status === 'needs_work').length,
    critical: pages.filter((p) => p.status === 'critical').length,
    missingDescriptions,
    missingKeywords,
  };

  return {
    overallScore,
    grade,
    stats,
    pages,
  };
}
