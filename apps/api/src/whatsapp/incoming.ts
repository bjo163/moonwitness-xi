import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { AttachmentStorage } from '@moonwitness/orm-storage';

export function lockOne(query: Knex.QueryBuilder, db: Knex) {
  return db.client.config.client === 'pg' ? query.forUpdate().skipLocked() : query;
}

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

/** Accept first, materialize later: an API/worker restart cannot lose an accepted event. */
export async function processIncoming(db: Knex, storage: AttachmentStorage): Promise<boolean> {
  let mediaKey: string | null = null;
  let failedEvent: { id: number; attempts: number } | undefined;
  try {
    return await db.transaction(async (trx) => {
      const event = await lockOne(
        trx('whatsapp_events')
          .where({ status: 'pending' })
          .where('available_at', '<=', new Date().toISOString())
          .orderBy('id'),
        db
      ).first();
      if (!event) return false;
      failedEvent = event;
      const body = JSON.parse(event.payload) as Record<string, unknown>;
      const now = new Date().toISOString();
      const messageAt = typeof body.timestamp === 'string' ? body.timestamp : now;
      const existing = await trx('whatsapp_messages')
        .where({ company_id: event.company_id, external_id: event.external_id })
        .first();
      if (!existing) {
        // ON CONFLICT locks an existing conversation too, serializing concurrent unread updates.
        const [conversation] = await trx('whatsapp_conversations')
          .insert({
            company_id: event.company_id,
            account_id: event.account_id,
            jid: body.jid,
            name: body.name ?? body.jid,
            is_group: body.is_group === true,
            unread_count: 0,
          })
          .onConflict(['company_id', 'jid'])
          .merge({ name: body.name ?? body.jid })
          .returning('*');
        if (typeof body.media_base64 === 'string') {
          mediaKey = randomUUID();
          await storage.put(mediaKey, Buffer.from(body.media_base64, 'base64'));
        }
        const mime = safeMime(body.media_mime_type);
        await trx('whatsapp_messages').insert({
          company_id: event.company_id,
          account_id: event.account_id,
          conversation_id: conversation.id,
          external_id: event.external_id,
          direction: body.from_me === true ? 'outbound' : 'inbound',
          message_type: mediaKey ? mediaType(mime) : 'text',
          content: body.content ?? '',
          status: body.from_me === true ? 'sent' : 'received',
          media_key: mediaKey,
          media_mime_type: mediaKey ? mime : null,
          media_file_name: body.media_file_name ?? null,
          sender_jid: body.sender_jid ?? null,
          create_date: messageAt,
        });
        await trx('whatsapp_conversations')
          .where({ id: conversation.id })
          .update({
            ...(!conversation.last_message_at || conversation.last_message_at <= messageAt
              ? {
                  last_message: body.content || body.media_file_name || '[media]',
                  last_message_at: messageAt,
                }
              : {}),
            unread_count:
              Number(conversation.unread_count ?? 0) +
              (body.from_me === true || body.notify === false ? 0 : 1),
            write_date: now,
          });
      }
      await trx('whatsapp_events')
        .where({ id: event.id })
        .update({ status: 'done', payload: '{}', write_date: now });
      return true;
    });
  } catch (error) {
    if (mediaKey) await storage.delete(mediaKey).catch(() => undefined);
    if (failedEvent)
      await db('whatsapp_events')
        .where({ id: failedEvent.id, status: 'pending' })
        .update({
          attempts: failedEvent.attempts + 1,
          status: failedEvent.attempts >= 7 ? 'dead' : 'pending',
          available_at: new Date(
            Date.now() + Math.min((failedEvent.attempts + 1) * 5000, 300000)
          ).toISOString(),
          last_error: 'Could not materialize incoming message',
          write_date: new Date().toISOString(),
        });
    throw error;
  }
}
