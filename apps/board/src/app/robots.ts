import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/login', '/register', '/board'] },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173'}/sitemap.xml`,
  };
}
