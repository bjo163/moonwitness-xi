import { defineAddon } from '@moonwitness/orm';
import { Partner, PartnerAddress, PartnerCategory, PartnerCategoryLink } from './models/partner.js';
import { Company } from './models/company.js';
import { User } from './models/user.js';
import { AuditLog } from './models/audit-log.js';
import { Country } from './models/country.js';
import { CountryState } from './models/country-state.js';
import { Bank, PartnerBank } from './models/bank.js';
import { Currency } from './models/currency.js';
import { Language } from './models/language.js';
import { Tag, TagLink } from './models/tag.js';
import { Attachment } from './models/attachment.js';
import { Activity } from './models/activity.js';
import { Sequence } from './models/sequence.js';
import { AccessGroup, GroupMembership, ModelAccess } from './models/access-group.js';
import { CompanyMembership } from './models/company-membership.js';
import { data } from './data.js';
import { views } from './views.js';

export const manifest = defineAddon({
  name: 'base',
  version: '1.0.0',
  models: [
    Country,
    CountryState,
    Currency,
    Language,
    Company,
    Bank,
    Partner,
    PartnerBank,
    PartnerCategory,
    PartnerCategoryLink,
    PartnerAddress,
    User,
    Tag,
    TagLink,
    Attachment,
    Activity,
    Sequence,
    AccessGroup,
    GroupMembership,
    ModelAccess,
    CompanyMembership,
    AuditLog,
  ],
  data,
  views,
  menus: [
    { model: 'base.partner', label: 'Partners', group: 'Workspace', sequence: 10 },
    { model: 'base.company', label: 'Companies', group: 'Organization', sequence: 20 },
    { model: 'base.user', label: 'Users', group: 'Organization', sequence: 30 },
    { model: 'base.activity', label: 'Activities', group: 'Workspace', sequence: 40 },
    { model: 'base.attachment', label: 'Attachments', group: 'Workspace', sequence: 50 },
    { model: 'base.tag', label: 'Tags', group: 'Workspace', sequence: 60 },
    { model: 'base.tag_link', group: 'Technical', sequence: 390, developmentOnly: true },
    { model: 'base.partner_address', group: 'Contacts', sequence: 110, developmentOnly: true },
    { model: 'base.partner_category', group: 'Contacts', sequence: 120, developmentOnly: true },
    {
      model: 'base.partner_category_link',
      group: 'Contacts',
      sequence: 130,
      developmentOnly: true,
    },
    { model: 'base.country', group: 'Localization', sequence: 210, developmentOnly: true },
    { model: 'base.country_state', group: 'Localization', sequence: 220, developmentOnly: true },
    { model: 'base.currency', group: 'Localization', sequence: 230, developmentOnly: true },
    { model: 'base.language', group: 'Localization', sequence: 240, developmentOnly: true },
    { model: 'base.bank', group: 'Finance', sequence: 310, developmentOnly: true },
    { model: 'base.partner_bank', group: 'Finance', sequence: 320, developmentOnly: true },
    { model: 'base.sequence', group: 'Technical', sequence: 410, developmentOnly: true },
    { model: 'base.access_group', group: 'Technical', sequence: 420, developmentOnly: true },
    { model: 'base.group_membership', group: 'Technical', sequence: 430, developmentOnly: true },
    { model: 'base.model_access', group: 'Technical', sequence: 440, developmentOnly: true },
    { model: 'base.company_membership', group: 'Technical', sequence: 450, developmentOnly: true },
    { model: 'base.audit_log', group: 'Technical', sequence: 460, developmentOnly: true },
  ],
});
