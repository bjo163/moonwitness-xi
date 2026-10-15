export function findWorkspaceVersionMismatches(rootVersion, manifests) {
  return manifests.flatMap(({ path, manifest }) => {
    if (!manifest.name?.startsWith('@moonwitness/')) return [];
    if (manifest.version === rootVersion) return [];
    return [
      `${manifest.name} (${path}): ${manifest.version ?? '<missing>'} (expected ${rootVersion})`,
    ];
  });
}
