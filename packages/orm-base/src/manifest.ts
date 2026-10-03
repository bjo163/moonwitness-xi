import { defineAddon } from '@moonwitness/orm';
import { Partner, PartnerAddress, PartnerCategory, PartnerCategoryLink } from './models/partner.js';
import { Company } from './models/company.js';
import { User } from './models/user.js';
import { AuditLog } from './models/audit-log.js';
import { Country } from './models/country.js';
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
    Currency,
    Language,
    Company,
    Partner,
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
});
