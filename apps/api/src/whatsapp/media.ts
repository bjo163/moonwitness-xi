export function safeMime(value: unknown): string {
  if (typeof value !== 'string') return 'application/octet-stream';
  const mime = value.toLowerCase().split(';')[0]?.trim() ?? '';
  return /^(?:image\/(?:jpeg|png|gif|webp)|video\/(?:mp4|quicktime|webm)|audio\/(?:mpeg|mp4|ogg|wav|webm)|application\/(?:pdf|octet-stream|msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.[a-z0-9.-]+))$/u.test(
    mime
  )
    ? mime
    : 'application/octet-stream';
}

export function mediaType(mime: string): 'image' | 'video' | 'audio' | 'document' | 'sticker' {
  if (mime.startsWith('image/')) return mime === 'image/webp' ? 'sticker' : 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
