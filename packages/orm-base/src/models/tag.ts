import { defineModel, fields } from '@moonwitness/orm';

/** Shared labels that addons can attach to arbitrary records through TagLink. */
export const Tag = defineModel('base.tag', {
  table: 'tags',
  order: 'name asc',
  fields: {
    name: fields.string({ required: true, unique: true }),
    color: fields.string({ pattern: '^#[0-9A-Fa-f]{6}$', default: '#64748B' }),
    description: fields.text(),
  },
});

/** Polymorphic link from a tag to any installed addon record. */
export const TagLink = defineModel('base.tag_link', {
  table: 'tag_links',
  order: 'id desc',
  unique: [['tag', 'resource_model', 'resource_id']],
  fields: {
    tag: fields.belongsTo(Tag, { required: true }),
    resource_model: fields.string({
      required: true,
      pattern: '^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$',
    }),
    resource_id: fields.integer({ required: true }),
  },
});
