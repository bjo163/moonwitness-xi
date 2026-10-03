import { ref, seed } from '@moonwitness/orm';
import { Partner, PartnerAddress, PartnerCategory, PartnerCategoryLink } from './models/partner.js';
import { Company } from './models/company.js';
import { User } from './models/user.js';
import { Country } from './models/country.js';
import { CountryState } from './models/country-state.js';
import { Bank, PartnerBank } from './models/bank.js';
import { Currency } from './models/currency.js';
import { Language } from './models/language.js';
import { countries } from './countries.js';
import { countryStates } from './states.js';
import { AccessGroup, GroupMembership, ModelAccess } from './models/access-group.js';
import { Tag, TagLink } from './models/tag.js';
import { Attachment } from './models/attachment.js';
import { Activity } from './models/activity.js';
import { Sequence } from './models/sequence.js';
import { CompanyMembership } from './models/company-membership.js';

const countryMeta: Record<
  string,
  { phone_code?: string; code_alpha3?: string; vat_label?: string }
> = {
  ID: { phone_code: '+62', code_alpha3: 'IDN', vat_label: 'NPWP' },
  US: { phone_code: '+1', code_alpha3: 'USA', vat_label: 'EIN / SSN' },
  GB: { phone_code: '+44', code_alpha3: 'GBR', vat_label: 'VAT' },
  FR: { phone_code: '+33', code_alpha3: 'FRA', vat_label: 'TVA' },
  DE: { phone_code: '+49', code_alpha3: 'DEU', vat_label: 'USt-IdNr' },
  IT: { phone_code: '+39', code_alpha3: 'ITA', vat_label: 'Partita IVA' },
  ES: { phone_code: '+34', code_alpha3: 'ESP', vat_label: 'NIF / CIF' },
  NL: { phone_code: '+31', code_alpha3: 'NLD', vat_label: 'Btw-id' },
  JP: { phone_code: '+81', code_alpha3: 'JPN', vat_label: 'Corporate Number (法人番号)' },
  SG: { phone_code: '+65', code_alpha3: 'SGP', vat_label: 'UEN / GST' },
  MY: { phone_code: '+60', code_alpha3: 'MYS', vat_label: 'SST / BRN' },
  AU: { phone_code: '+61', code_alpha3: 'AUS', vat_label: 'ABN / ACN' },
  CA: { phone_code: '+1', code_alpha3: 'CAN', vat_label: 'BN / NE' },
  CN: { phone_code: '+86', code_alpha3: 'CHN', vat_label: 'USCC (统一代码)' },
  IN: { phone_code: '+91', code_alpha3: 'IND', vat_label: 'GSTIN / PAN' },
  BR: { phone_code: '+55', code_alpha3: 'BRA', vat_label: 'CNPJ / CPF' },
  MX: { phone_code: '+52', code_alpha3: 'MEX', vat_label: 'RFC' },
  SA: { phone_code: '+966', code_alpha3: 'SAU', vat_label: 'VAT / TIN' },
  AE: { phone_code: '+971', code_alpha3: 'ARE', vat_label: 'TRN' },
  TH: { phone_code: '+66', code_alpha3: 'THA', vat_label: 'Tax ID' },
  VN: { phone_code: '+84', code_alpha3: 'VNM', vat_label: 'Mã số thuế (MST)' },
  PH: { phone_code: '+63', code_alpha3: 'PHL', vat_label: 'TIN' },
};

export const data = [
  // 1. Countries (ISO 3166-1)
  ...countries.map(({ code, name }) =>
    seed(Country, `base.country_${code.toLowerCase()}`, {
      code,
      name,
      ...(countryMeta[code] ?? {}),
    })
  ),

  // 2. Real Country States / Provinces (ISO 3166-2: Indonesia 38 provinces, US 50 states, etc.)
  ...countryStates.map(({ countryCode, code, name, type }) =>
    seed(CountryState, `base.state_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, {
      code,
      name,
      country: ref(`base.country_${countryCode.toLowerCase()}`),
      ...(type ? { type } : {}),
    })
  ),

  // 3. Localization
  seed(Currency, 'base.currency_usd', { code: 'USD', name: 'US Dollar', symbol: '$' }),
  seed(Language, 'base.language_en_us', { code: 'en-US', name: 'English (US)' }),

  // 4. Default Company
  seed(Company, 'base.company_default', {
    name: 'MoonWitness',
    email: 'company@moonwitness.local',
    website: 'https://moonwitness.local',
    country: ref('base.country_us'),
    currency: ref('base.currency_usd'),
    language: ref('base.language_en_us'),
    timezone: 'UTC',
  }),

  // 5. Authoritative Real Banks (ID, US, GB, SG)
  seed(Bank, 'base.bank_bca', {
    name: 'Bank Central Asia (BCA)',
    bic: 'CENAIDJA',
    code: '014',
    country: ref('base.country_id'),
    website: 'https://www.bca.co.id',
  }),
  seed(Bank, 'base.bank_mandiri', {
    name: 'Bank Mandiri',
    bic: 'BMRIIDJA',
    code: '008',
    country: ref('base.country_id'),
    website: 'https://www.bankmandiri.co.id',
  }),
  seed(Bank, 'base.bank_bri', {
    name: 'Bank Rakyat Indonesia (BRI)',
    bic: 'BRINIDJA',
    code: '002',
    country: ref('base.country_id'),
    website: 'https://bri.co.id',
  }),
  seed(Bank, 'base.bank_bni', {
    name: 'Bank Negara Indonesia (BNI)',
    bic: 'BNINIDJA',
    code: '009',
    country: ref('base.country_id'),
    website: 'https://www.bni.co.id',
  }),
  seed(Bank, 'base.bank_jpmorgan', {
    name: 'JPMorgan Chase Bank',
    bic: 'CHASUS33',
    code: 'CHASE',
    country: ref('base.country_us'),
    website: 'https://www.jpmorganchase.com',
  }),
  seed(Bank, 'base.bank_bofa', {
    name: 'Bank of America',
    bic: 'BOFAUS3N',
    code: 'BOFA',
    country: ref('base.country_us'),
    website: 'https://www.bankofamerica.com',
  }),
  seed(Bank, 'base.bank_hsbc', {
    name: 'HSBC Bank',
    bic: 'HSBCGB2L',
    code: 'HSBC',
    country: ref('base.country_gb'),
    website: 'https://www.hsbc.com',
  }),
  seed(Bank, 'base.bank_dbs', {
    name: 'DBS Bank',
    bic: 'DBSSSGSG',
    code: 'DBS',
    country: ref('base.country_sg'),
    website: 'https://www.dbs.com',
  }),

  // 6. Partners
  seed(Partner, 'base.partner_system', {
    name: 'System User',
    email: 'system@moonwitness.local',
    company: ref('base.company_default'),
  }),
  seed(Partner, 'base.partner_superadmin', {
    name: 'Super Administrator',
    email: 'superadmin@moonwitness.local',
    company: ref('base.company_default'),
  }),
  seed(Partner, 'base.partner_acme', {
    name: 'Acme Studio',
    email: 'hello@acme.local',
    is_company: true,
    vat: 'ID-01.234.567.8-012.000',
    website: 'https://acme.local',
    country: ref('base.country_us'),
    state: ref('base.state_us_ca'),
    city: 'San Francisco',
    street: '123 Market Street',
    postal_code: '94105',
    is_customer: true,
  }),
  seed(Partner, 'base.partner_acme_contact', {
    name: 'Alice Smith',
    email: 'alice@acme.local',
    parent: ref('base.partner_acme'),
    job_title: 'Procurement Director',
    is_company: false,
    mobile: '+1-555-0199',
    country: ref('base.country_us'),
    state: ref('base.state_us_ca'),
    city: 'San Francisco',
    is_customer: true,
  }),
  seed(Partner, 'base.partner_northstar', {
    name: 'Northstar Labs',
    email: 'contact@northstar.local',
    is_company: true,
    website: 'https://northstar.local',
    is_supplier: true,
  }),
  seed(Partner, 'base.partner_meridian', {
    name: 'Meridian Works',
    email: 'team@meridian.local',
    is_company: true,
    is_customer: true,
  }),
  seed(Partner, 'base.partner_bluebird', {
    name: 'Bluebird Market',
    email: 'support@bluebird.local',
    is_company: true,
    is_customer: true,
  }),
  seed(Partner, 'base.partner_cedar', {
    name: 'Cedar House',
    email: 'hello@cedar.local',
    is_company: true,
  }),
  seed(Partner, 'base.partner_kite', {
    name: 'Kite and Co',
    email: 'contact@kite.local',
    is_company: true,
  }),
  seed(Partner, 'base.partner_openfield', {
    name: 'Open Field',
    email: 'team@openfield.local',
    is_company: true,
  }),
  seed(Partner, 'base.partner_riverstone', {
    name: 'Riverstone Group',
    email: 'info@riverstone.local',
    is_company: true,
  }),

  // 7. Partner Bank Accounts
  seed(PartnerBank, 'base.partner_bank_acme', {
    acc_number: '1234567890',
    sanitized_acc_number: '1234567890',
    acc_holder_name: 'Acme Studio Inc.',
    partner: ref('base.partner_acme'),
    bank: ref('base.bank_jpmorgan'),
    currency: ref('base.currency_usd'),
    is_primary: true,
  }),
  seed(PartnerBank, 'base.partner_bank_company_default', {
    acc_number: '9876543210',
    sanitized_acc_number: '9876543210',
    acc_holder_name: 'MoonWitness Global Inc.',
    partner: ref('base.partner_superadmin'),
    bank: ref('base.bank_bofa'),
    currency: ref('base.currency_usd'),
    company: ref('base.company_default'),
    is_primary: true,
  }),

  // 8. Categories
  seed(PartnerCategory, 'base.partner_category_customer', {
    code: 'customer',
    name: 'Customer',
    color: '#2563EB',
    description: 'Organizations or people that purchase products or services.',
  }),
  seed(PartnerCategory, 'base.partner_category_vendor', {
    code: 'vendor',
    name: 'Vendor',
    color: '#16A34A',
    description: 'Organizations that provide products or services.',
  }),
  seed(PartnerCategoryLink, 'base.partner_category_acme_customer', {
    partner: ref('base.partner_acme'),
    category: ref('base.partner_category_customer'),
  }),
  seed(PartnerCategoryLink, 'base.partner_category_northstar_vendor', {
    partner: ref('base.partner_northstar'),
    category: ref('base.partner_category_vendor'),
  }),

  // 9. Partner Address
  seed(PartnerAddress, 'base.partner_address_acme_headquarters', {
    partner: ref('base.partner_acme'),
    label: 'Headquarters',
    address_type: 'contact',
    street: '123 Market Street',
    city: 'San Francisco',
    state: ref('base.state_us_ca'),
    postal_code: '94105',
    country: ref('base.country_us'),
    is_primary: true,
  }),

  // 10. Users & Security Access Groups
  seed(User, 'base.user_system', {
    login: 'system',
    role: 'system',
    partner: ref('base.partner_system'),
  }),
  seed(User, 'base.user_superadmin', {
    login: 'superadmin',
    role: 'superadmin',
    partner: ref('base.partner_superadmin'),
  }),
  seed(AccessGroup, 'base.group_system', {
    code: 'system',
    name: 'System',
    description: 'Built-in full access role.',
  }),
  seed(AccessGroup, 'base.group_superadmin', {
    code: 'superadmin',
    name: 'Super Administrator',
    description: 'Built-in administration role.',
  }),
  seed(AccessGroup, 'base.group_user', {
    code: 'user',
    name: 'User',
    description: 'Default group for registered users.',
  }),

  // 11. Tags
  seed(Tag, 'base.tag_customer', {
    name: 'Customer',
    color: '#2563EB',
    description: 'Example tag for customer records.',
  }),
  seed(TagLink, 'base.tag_link_acme_customer', {
    tag: ref('base.tag_customer'),
    resource_model: Partner.modelName,
    resource_id: 3,
  }),

  // 12. Attachments & Activities
  seed(Attachment, 'base.attachment_acme_proposal', {
    name: 'acme-proposal.pdf',
    resource_model: Partner.modelName,
    resource_id: 3,
    mimetype: 'application/pdf',
    size_bytes: 0,
    storage_key: 'examples/acme-proposal.pdf',
    checksum: '0000000000000000000000000000000000000000000000000000000000000000',
  }),
  seed(Activity, 'base.activity_acme_follow_up', {
    summary: 'Example: follow up with Acme Studio',
    activity_type: 'call',
    state: 'planned',
    deadline: '2099-12-31',
    note: 'Seed example only; update or remove when using real activity data.',
    assigned_to: ref('base.user_superadmin'),
    resource_model: Partner.modelName,
    resource_id: 3,
  }),

  // 13. Auto-Numbering Sequences (with dynamic date format tokens)
  seed(Sequence, 'base.sequence_partner', {
    code: 'base.partner',
    name: 'Partner Reference Sequence',
    prefix: 'PART/%(year)s/',
    padding: 4,
    next_number: 1,
  }),
  seed(Sequence, 'base.sequence_sales_order', {
    code: 'sales.order',
    prefix: 'SO-',
    padding: 4,
    next_number: 1,
  }),

  // 14. Group & Company Memberships
  seed(GroupMembership, 'base.membership_superadmin', {
    user: ref('base.user_superadmin'),
    group: ref('base.group_superadmin'),
  }),
  seed(CompanyMembership, 'base.company_membership_superadmin_default', {
    user: ref('base.user_superadmin'),
    company: ref('base.company_default'),
    is_default: true,
  }),
  seed(CompanyMembership, 'base.company_membership_system_default', {
    user: ref('base.user_system'),
    company: ref('base.company_default'),
    is_default: true,
  }),
  seed(ModelAccess, 'base.access_user_partner_read', {
    group: ref('base.group_user'),
    model_name: Partner.modelName,
    read: true,
    create: false,
    write: false,
    unlink: false,
  }),
];
