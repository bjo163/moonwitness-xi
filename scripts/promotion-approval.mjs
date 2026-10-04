export function hasFreshApproval({ reviews, headSha, owners }) {
  const ownerLogins = new Set([...owners].map((owner) => owner.toLowerCase()));
  const latestByOwner = new Map();
  const orderedReviews = [...reviews].sort((left, right) => {
    const leftTime = Date.parse(left.submitted_at ?? left.created_at ?? '');
    const rightTime = Date.parse(right.submitted_at ?? right.created_at ?? '');
    return leftTime - rightTime;
  });

  for (const review of orderedReviews) {
    const login = review.user?.login?.toLowerCase();
    if (!login || !ownerLogins.has(login) || review.state === 'PENDING') continue;
    if (review.commit_id?.toLowerCase() !== headSha.toLowerCase()) continue;
    latestByOwner.set(login, review.state);
  }

  return [...latestByOwner.values()].some((state) => state === 'APPROVED');
}

export function codeownerLogins(codeownersFile) {
  const owners = new Set();
  for (const line of codeownersFile.split(/\r?\n/)) {
    const [pattern, ...entries] = line.replace(/#.*/, '').trim().split(/\s+/);
    if (!pattern) continue;
    for (const entry of entries) {
      if (/^@[A-Za-z0-9-]+$/.test(entry)) owners.add(entry.slice(1));
    }
  }
  return owners;
}
