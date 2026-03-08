/**
 * Utilities for copying XRAY media across encounters during
 * the imaging-only appointment workflow.
 *
 * Pure helper functions are exported so they can be unit-tested
 * independently of Prisma / database access.
 */

/**
 * Builds a deduplication key for a media row.
 * Two rows are considered duplicates when they share the same
 * type, filePath, and toothCode (null and "" are treated the same).
 *
 * @param {{ type: string, filePath: string, toothCode?: string | null }} media
 * @returns {string}
 */
export function buildMediaDedupeKey(media) {
  return `${media.type}::${media.filePath}::${media.toothCode ?? ""}`;
}

/**
 * Given the media already in the canonical encounter and the candidate
 * media rows from other encounters, return only the candidates that are
 * NOT already present in the canonical encounter.
 *
 * Processes candidates in order; if the same (type, filePath, toothCode)
 * appears more than once in `candidateMedia`, only the first occurrence
 * is included in the result (no intra-candidate duplicates either).
 *
 * Pure function – no database access; unit-testable.
 *
 * @param {Array<{ type: string, filePath: string, toothCode?: string | null }>} canonicalMedia
 * @param {Array<{ type: string, filePath: string, toothCode?: string | null }>} candidateMedia
 * @returns {Array<{ type: string, filePath: string, toothCode?: string | null }>}
 */
export function filterNewMedia(canonicalMedia, candidateMedia) {
  const seen = new Set(canonicalMedia.map(buildMediaDedupeKey));
  const result = [];
  for (const m of candidateMedia) {
    const key = buildMediaDedupeKey(m);
    if (!seen.has(key)) {
      result.push(m);
      seen.add(key);
    }
  }
  return result;
}

/**
 * Copy XRAY media from source encounters into the canonical encounter,
 * skipping rows that already exist (by type + filePath + toothCode).
 *
 * Only runs if there are source encounter IDs to look at.
 *
 * @param {number}   canonicalEncounterId
 * @param {number[]} sourceEncounterIds   – encounter IDs to copy FROM (must exclude canonical)
 * @param {import("@prisma/client").PrismaClient} prismaClient
 * @returns {Promise<number>} number of new media rows created
 */
export async function copyXrayMediaToCanonical(
  canonicalEncounterId,
  sourceEncounterIds,
  prismaClient
) {
  if (!sourceEncounterIds.length) return 0;

  const [sourceMedia, canonicalMedia] = await Promise.all([
    prismaClient.media.findMany({
      where: { encounterId: { in: sourceEncounterIds }, type: "XRAY" },
    }),
    prismaClient.media.findMany({
      where: { encounterId: canonicalEncounterId, type: "XRAY" },
      select: { type: true, filePath: true, toothCode: true },
    }),
  ]);

  const toCreate = filterNewMedia(canonicalMedia, sourceMedia);

  for (const m of toCreate) {
    await prismaClient.media.create({
      data: {
        encounterId: canonicalEncounterId,
        filePath: m.filePath,
        toothCode: m.toothCode ?? null,
        type: m.type,
      },
    });
  }

  return toCreate.length;
}
