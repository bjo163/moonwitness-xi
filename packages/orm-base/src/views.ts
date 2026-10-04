import { defineView } from '@moonwitness/orm';
import { Company } from './models/company.js';
import { Partner, PartnerAddress, PartnerCategory, PartnerCategoryLink } from './models/partner.js';
import { CountryState } from './models/country-state.js';
import { Bank, PartnerBank } from './models/bank.js';
import { User } from './models/user.js';
import { Country } from './models/country.js';
import { Currency } from './models/currency.js';
import { Language } from './models/language.js';
import { Tag, TagLink } from './models/tag.js';
import { Attachment } from './models/attachment.js';
import { Activity } from './models/activity.js';
import { Sequence } from './models/sequence.js';
import { AccessGroup, GroupMembership, ModelAccess } from './models/access-group.js';
import { CompanyMembership } from './models/company-membership.js';

/** Domains use API column names (`company_id`); view field lists use model field keys. */
export const views = [
  defineView(Company, {
    title: 'Companies',
    list: {
      columns: [
        'name',
        'country',
        'currency',
        'language',
        'timezone',
        'street',
        'city',
        'postal_code',
      ],
      order: 'name asc',
    },
    form: {
      sections: [
        { title: 'Company', fields: ['name', 'website', 'country'] },
        { title: 'Address', fields: ['street', 'city', 'postal_code'] },
        { title: 'Localization', fields: ['currency', 'language', 'timezone'] },
        { title: 'Contact', fields: ['email', 'phone'] },
      ],
    },
    search: { fields: ['name', 'email', 'website'] },
  }),
  defineView(Partner, {
    title: 'Partners',
    list: {
      columns: ['name', 'is_company', 'parent', 'job_title', 'email', 'phone', 'city', 'country'],
      order: 'name asc',
    },
    form: {
      sections: [
        {
          title: 'Identity',
          fields: ['name', 'is_company', 'parent', 'job_title', 'vat', 'company'],
        },
        { title: 'Contact Details', fields: ['email', 'phone', 'mobile', 'website'] },
        { title: 'Address', fields: ['street', 'city', 'state', 'postal_code', 'country'] },
        { title: 'Classification', fields: ['is_customer', 'is_supplier'] },
        { title: 'Internal Notes', fields: ['notes'] },
      ],
    },
    search: {
      fields: ['name', 'email', 'vat', 'phone', 'mobile'],
      filters: [
        { label: 'Companies', domain: [['is_company', '=', true]] },
        { label: 'Individuals', domain: [['is_company', '=', false]] },
        { label: 'Customers', domain: [['is_customer', '=', true]] },
        { label: 'Vendors / Suppliers', domain: [['is_supplier', '=', true]] },
      ],
    },
  }),
  defineView(PartnerCategory, {
    title: 'Partner Categories',
    list: { columns: ['name', 'code', 'color', 'active'], order: 'name asc' },
    form: {
      sections: [{ title: 'Category', fields: ['name', 'code', 'color', 'description'] }],
    },
    search: { fields: ['name', 'code', 'description'] },
  }),
  defineView(PartnerCategoryLink, {
    title: 'Partner Category Assignments',
    list: { columns: ['partner', 'category'], order: 'id asc' },
    form: { sections: [{ title: 'Assignment', fields: ['partner', 'category'] }] },
    search: {},
  }),
  defineView(PartnerAddress, {
    title: 'Partner Addresses',
    list: {
      columns: ['partner', 'label', 'address_type', 'city', 'country', 'is_primary'],
      order: 'is_primary desc, id asc',
    },
    form: {
      sections: [
        { title: 'Address', fields: ['partner', 'label', 'address_type', 'is_primary'] },
        {
          title: 'Location',
          fields: ['street', 'street2', 'city', 'state', 'postal_code', 'country'],
        },
      ],
    },
    search: { fields: ['label', 'city', 'postal_code'] },
  }),
  defineView(Country, {
    title: 'Countries',
    list: {
      columns: ['code', 'name', 'code_alpha3', 'phone_code', 'vat_label'],
      order: 'name asc',
    },
    form: {
      sections: [
        {
          title: 'Country Information',
          fields: ['name', 'code', 'code_alpha3', 'phone_code', 'vat_label'],
        },
      ],
    },
    search: { fields: ['code', 'name', 'code_alpha3'] },
  }),
  defineView(CountryState, {
    title: 'Provinces & States',
    list: { columns: ['code', 'name', 'country', 'type'], order: 'name asc' },
    form: {
      sections: [{ title: 'Subdivision Details', fields: ['name', 'code', 'country', 'type'] }],
    },
    search: { fields: ['code', 'name'] },
  }),
  defineView(Bank, {
    title: 'Banks',
    list: { columns: ['name', 'bic', 'code', 'country', 'active'], order: 'name asc' },
    form: {
      sections: [
        { title: 'Bank Information', fields: ['name', 'bic', 'code', 'country', 'active'] },
        { title: 'Contact', fields: ['phone', 'website'] },
      ],
    },
    search: { fields: ['name', 'bic', 'code'] },
  }),
  defineView(PartnerBank, {
    title: 'Bank Accounts',
    list: {
      columns: ['partner', 'acc_number', 'bank', 'currency', 'is_primary'],
      order: 'is_primary desc, id desc',
    },
    form: {
      sections: [
        {
          title: 'Account Information',
          fields: [
            'partner',
            'bank',
            'acc_number',
            'acc_holder_name',
            'currency',
            'company',
            'is_primary',
          ],
        },
        { title: 'Security & Verification', fields: ['sanitized_acc_number'] },
      ],
    },
    search: { fields: ['acc_number', 'acc_holder_name'] },
  }),
  defineView(Currency, {
    title: 'Currencies',
    list: { columns: ['code', 'name', 'symbol'], order: 'code asc' },
    form: { sections: [{ title: 'Currency', fields: ['code', 'name', 'symbol'] }] },
    search: { fields: ['code', 'name'] },
  }),
  defineView(Language, {
    title: 'Languages',
    list: { columns: ['code', 'name'], order: 'code asc' },
    form: { sections: [{ title: 'Language', fields: ['code', 'name'] }] },
    search: { fields: ['code', 'name'] },
  }),
  defineView(User, {
    title: 'Users',
    list: {
      columns: ['login', 'partner', 'role', 'language', 'timezone', 'active'],
      order: 'login asc',
    },
    form: {
      sections: [
        { title: 'Account', fields: ['login', 'role', 'partner'] },
        { title: 'Preferences', fields: ['language', 'timezone'] },
        { title: 'Security', fields: ['password'] },
      ],
    },
    search: {
      fields: ['login'],
      filters: [
        { label: 'Administrators', domain: [['role', 'in', ['system', 'superadmin']]] },
        { label: 'Regular users', domain: [['role', '=', 'user']] },
      ],
    },
  }),
  defineView(Tag, {
    title: 'Tags',
    list: { columns: ['name', 'color', 'active'], order: 'name asc' },
    form: { sections: [{ title: 'Tag', fields: ['name', 'color', 'description'] }] },
    search: { fields: ['name', 'description'] },
  }),
  defineView(TagLink, {
    title: 'Tag Links',
    list: { columns: ['tag', 'resource_model', 'resource_id'], order: 'id desc' },
    form: {
      sections: [{ title: 'Assignment', fields: ['tag', 'resource_model', 'resource_id'] }],
    },
    search: { fields: ['resource_model'] },
  }),
  defineView(Attachment, {
    title: 'Attachments',
    list: {
      columns: ['name', 'resource_model', 'resource_id', 'mimetype', 'size_bytes'],
      order: 'id desc',
    },
    form: {
      sections: [
        { title: 'File metadata', fields: ['name', 'mimetype', 'size_bytes', 'checksum'] },
        { title: 'Related record', fields: ['resource_model', 'resource_id'] },
      ],
    },
    search: { fields: ['name', 'mimetype', 'resource_model'] },
  }),
  defineView(Activity, {
    title: 'Activities',
    list: {
      columns: ['summary', 'activity_type', 'deadline', 'assigned_to', 'state'],
      order: 'deadline asc',
    },
    form: {
      sections: [
        { title: 'Activity', fields: ['summary', 'activity_type', 'state', 'deadline', 'note'] },
        { title: 'Assignment', fields: ['assigned_to'] },
        { title: 'Related record', fields: ['resource_model', 'resource_id'] },
      ],
    },
    search: { fields: ['summary', 'resource_model'] },
  }),
  defineView(Sequence, {
    title: 'Sequences',
    list: { columns: ['code', 'prefix', 'padding', 'next_number'], order: 'code asc' },
    form: {
      sections: [{ title: 'Sequence', fields: ['code', 'prefix', 'padding', 'next_number'] }],
    },
    search: { fields: ['code'] },
  }),
  defineView(AccessGroup, {
    title: 'Access Groups',
    list: { columns: ['code', 'name', 'active'], order: 'name asc' },
    form: {
      sections: [{ title: 'Group', fields: ['code', 'name', 'description'] }],
    },
    search: { fields: ['code', 'name'] },
  }),
  defineView(GroupMembership, {
    title: 'Group Memberships',
    list: { columns: ['user', 'group'], order: 'id asc' },
    form: { sections: [{ title: 'Membership', fields: ['user', 'group'] }] },
    search: {},
  }),
  defineView(ModelAccess, {
    title: 'Model Access',
    list: {
      columns: ['group', 'model_name', 'read', 'create', 'write', 'unlink'],
      order: 'model_name asc',
    },
    form: {
      sections: [
        { title: 'Grant', fields: ['group', 'model_name'] },
        { title: 'Operations', fields: ['read', 'create', 'write', 'unlink'] },
      ],
    },
    search: { fields: ['model_name'] },
  }),
  defineView(CompanyMembership, {
    title: 'Company Memberships',
    list: { columns: ['user', 'company', 'is_default'], order: 'user_id asc, is_default desc' },
    form: {
      sections: [{ title: 'Access', fields: ['user', 'company', 'is_default'] }],
    },
    search: {},
  }),
];
