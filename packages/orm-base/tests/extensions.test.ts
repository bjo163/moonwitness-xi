import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import knex, { type Knex } from 'knex';
import { installAddons } from '@moonwitness/orm';
import {
  Activity,
  Attachment,
  Partner,
  Sequence,
  Tag,
  TagLink,
  manifest,
  nextSequence,
} from '../src/index.js';

describe('lightweight base extensions', () => {
  let db: Knex;

  beforeEach(async () => {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    await installAddons(db, [manifest]);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('attaches tags, attachment metadata and activities to any installed model record', async () => {
    const partner = await Partner.query().findOne({ name: 'Acme Studio' }).throwIfNotFound();
    const tag = await Tag.query().insert({ name: 'Priority', color: '#123ABC' });
    const link = await TagLink.query().insert({
      tag_id: tag.id,
      resource_model: Partner.modelName,
      resource_id: partner.id,
    });
    const hydratedLink = await TagLink.query().findById(link.id).withGraphFetched('tag');
    expect(hydratedLink?.tag?.name).toBe('Priority');
    await expect(
      TagLink.query().insert({
        tag_id: tag.id,
        resource_model: Partner.modelName,
        resource_id: partner.id,
      })
    ).rejects.toThrow();

    const attachment = await Attachment.query().insert({
      name: 'proposal.pdf',
      resource_model: Partner.modelName,
      resource_id: partner.id,
      mimetype: 'application/pdf',
      size_bytes: 2048,
      storage_key: 'partners/acme/proposal.pdf',
    });
    expect(attachment.toJSON()).toMatchObject({ name: 'proposal.pdf', size_bytes: 2048 });

    const activity = await Activity.query().insert({
      summary: 'Follow up',
      activity_type: 'call',
      deadline: '2026-10-10',
      resource_model: Partner.modelName,
      resource_id: partner.id,
    });
    expect(activity.state).toBe('planned');
  });

  it('allocates padded sequence values and rejects missing or invalid sequences', async () => {
    await Sequence.query().insert({
      code: 'partner',
      prefix: 'P-',
      padding: 4,
      next_number: 1,
    });

    expect(await nextSequence('partner')).toBe('P-0001');
    expect(await nextSequence('partner')).toBe('P-0002');
    await expect(nextSequence('missing')).rejects.toThrow("Sequence 'missing' was not found");

    await Sequence.query().where({ code: 'partner' }).patch({ padding: 21 });
    await expect(nextSequence('partner')).rejects.toThrow('invalid counter settings');
  });
});
