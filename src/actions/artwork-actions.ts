// file: src/actions/artwork-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getUserId } from "src/studio/authz";
import { assertBuildAccess } from "src/studio/permissions";
import { saveArtworkForBuild, type PersistArtworkResult } from "src/lib/artwork/persist";
import { ArtworkSaveError } from "src/lib/artwork/save";

// The "Save T-Shirt" action in the Studio model. Persists the EXACT bytes
// of the current AI mockup as a stable, owner-scoped Artwork and points
// BuildDraft.savedArtworkId at it -- no re-render, no second record on a
// repeat save (upsert on sourceMockupId). `placement` is the current
// canvas transform { placement, x, y, scale, rotation }.
export async function actionSaveArtwork(
  buildId: string,
  placement?: unknown,
): Promise<PersistArtworkResult> {
  const userId = await getUserId();
  await assertBuildAccess(userId, buildId);

  const result = await saveArtworkForBuild(buildId, { ownerUserId: userId, placement });
  if (!result) {
    throw new ArtworkSaveError("Generate an AI mockup before saving your artwork.");
  }

  revalidatePath(`/studio/projects/${buildId}/builder`);
  return result;
}
