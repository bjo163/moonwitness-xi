import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173'}/`,
      lastModified: new Date(),
    },
  ];
}
