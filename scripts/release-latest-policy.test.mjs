import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReleaseVersions, planLatestPromotion } from './release-latest-policy.mjs';

test('first stable release can initialize latest while prereleases cannot', () => {
  assert.deepEqual(planLatestPromotion('v1.0.0', []), {
    advance: true,
    reason: 'first-stable-release',
    latest: null,
  });
  assert.deepEqual(planLatestPromotion('v1.1.0-rc.1', ['v1.0.0']), {
    advance: false,
    reason: 'prerelease',
    latest: null,
  });
});

test('only a strictly newer stable version advances latest', () => {
  assert.deepEqual(planLatestPromotion('v1.10.0', ['v1.9.9', 'v1.2.0']), {
    advance: true,
    reason: 'newer-stable-release',
    latest: 'v1.9.9',
  });
  assert.equal(planLatestPromotion('v1.9.8', ['v1.9.9']).reason, 'older-release');
  assert.equal(planLatestPromotion('v1.9.9', ['v1.9.9']).reason, 'already-current');
});

test('stable release versions outrank prereleases and prereleases order correctly', () => {
  assert.equal(compareReleaseVersions('v2.0.0', 'v2.0.0-rc.10'), 1);
  assert.equal(compareReleaseVersions('v2.0.0-rc.10', 'v2.0.0-rc.2'), 1);
  assert.equal(compareReleaseVersions('v2.0.0-rc.2', 'v2.0.0-rc.alpha'), -1);
});

test('build metadata does not change semantic precedence', () => {
  assert.equal(compareReleaseVersions('v1.2.3+build.42', '1.2.3'), 0);
});

test('invalid versions fail closed and no malformed stable tag is ignored', () => {
  assert.throws(() => planLatestPromotion('v01.2.3', []), /semantic version/u);
  assert.throws(() => planLatestPromotion('v1.1.0', ['v1.0']), /not semantic version/u);
});
