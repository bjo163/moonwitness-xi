import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_SUPERADMIN_PASSWORD } from './constants.js';

async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    })),
    `${label} should have no WCAG 2.1 A/AA violations`
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `${label} has unintended horizontal overflow (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px)`
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Login').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Enter the board' }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test('system roles can browse verified source and graph explanations read-only', async ({
  page,
}) => {
  await signIn(page, 'superadmin', E2E_SUPERADMIN_PASSWORD);
  const companySwitcher = page.getByRole('button', {
    name: 'Switch company. Current scope: Global Scope',
  });
  await expect(companySwitcher).toBeVisible();
  await expect(page.getByRole('link', { name: 'Knowledge explorer' })).toHaveCount(0);
  await companySwitcher.click();
  await page.getByRole('menuitem', { name: 'MoonWitness' }).click();
  await expect(page.getByRole('link', { name: 'Knowledge explorer' })).toBeVisible();

  await page.route('**/api/corpus/sources/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          publication: 'source_bytes',
          sourceId: 'mw:source:tanzil-quran-text',
          editionId: 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2',
          locale: 'ar',
          citation: 'Tanzil Quran Text, CC BY 3.0.',
          references: [],
          availablePassages: ['Q7:46'],
        },
      }),
    })
  );
  await page.route('**/api/corpus/passages/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          sourceId: 'mw:source:tanzil-quran-text',
          editionId: 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2',
          locator: 'Q7:46',
          text: 'A verified local passage excerpt.',
          sha256: 'a'.repeat(64),
          citation: 'Tanzil Quran Text, CC BY 3.0.',
        },
      }),
    })
  );
  await page.route('**/api/research/relations/**/explanation', (route) => {
    const requestedRelationId = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').at(-2) ?? ''
    );
    const isAlternative = requestedRelationId === 'mw:relation:alternative';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          release_digest: 'b'.repeat(64),
          explanation: {
            id: requestedRelationId,
            kind: 'ResearchRelation',
            schema_version: 1,
            content_revision: 1,
            predicate: isAlternative ? 'possibly_describes' : 'describes',
            subject_id: 'mw:assertion:e2e',
            object_id: isAlternative ? 'mw:entity:alternative' : 'mw:entity:e2e',
            scope: { kind: 'passage', reference_id: 'mw:passage:e2e' },
            epistemic_status: 'candidate',
            review_status: 'pending',
            interpretation_boundary: 'linked_evidence_only',
            supporting_evidence: [
              {
                evidence: {
                  id: 'mw:evidence:e2e',
                  assertion_id: 'mw:assertion:e2e',
                  direction: 'supporting',
                  selector: {
                    source_id: 'mw:source:tanzil-quran-text',
                    edition_id: 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2',
                    locator: 'Q7:46',
                    content_sha256: 'c'.repeat(64),
                  },
                },
                direction: 'supporting',
                source_id: 'mw:source:tanzil-quran-text',
                edition_id: 'mw:edition:tanzil-quran-text-v1.1-uthmani-txt2',
                locator: 'Q7:46',
                content_sha256: 'c'.repeat(64),
                citation: 'Tanzil Quran Text, CC BY 3.0.',
                excerpt: 'A cited excerpt.',
              },
            ],
            counterevidence: [],
            alternatives: isAlternative
              ? []
              : [
                  {
                    relation: {
                      id: 'mw:relation:alternative',
                      kind: 'ResearchRelation',
                      schema_version: 1,
                      content_revision: 1,
                      predicate: 'possibly_describes',
                      subject_id: 'mw:assertion:e2e',
                      object_id: 'mw:entity:alternative',
                      scope: { kind: 'passage', reference_id: 'mw:passage:e2e' },
                      epistemic_status: 'candidate',
                      review_status: 'pending',
                      interpretation_boundary: 'linked_evidence_only',
                    },
                    supporting_evidence: [],
                    counterevidence: [],
                  },
                ],
          },
        },
      }),
    });
  });

  const knowledgeLink = page.getByRole('link', { name: 'Knowledge explorer' });
  await knowledgeLink.focus();
  await expect(knowledgeLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Knowledge explorer' })).toBeVisible();
  await expect(page.getByText('A verified local passage excerpt.')).toBeVisible();
  const relationInput = page.getByLabel('Research relation ID');
  await relationInput.focus();
  await relationInput.pressSequentially('mw:relation:e2e');
  await relationInput.press('Enter');
  await expect(page.getByText('describes', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Interpretation boundary: linked evidence only. This view does not infer causation.'
    )
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open pinned source passage Q7:46' }).click();
  await expect(page.getByRole('heading', { name: 'Q7:46' })).toBeVisible();
  await expect(page.getByText('A verified local passage excerpt.')).toBeVisible();
  await page.getByRole('button', { name: 'possibly_describes' }).click();
  await expect(page.getByLabel('Research relation ID')).toHaveValue('mw:relation:alternative');
  await expect(page.getByText('possibly_describes', { exact: true })).toBeVisible();
  await expect(page.getByText('mw:entity:alternative', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoA11yViolations(page, 'knowledge/desktop/light');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/u);
  await expectNoA11yViolations(page, 'knowledge/desktop/dark');

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page, 'knowledge/mobile/dark');
  await expectNoA11yViolations(page, 'knowledge/mobile/dark');
});
