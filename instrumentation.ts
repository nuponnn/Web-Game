export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { adminDb } = await import("./app/lib/server/firebaseAdmin");
    const { LOCATIONS } = await import("./app/lib/server/data/locations");
    const { cleanAndValidateLocation } = await import("./app/lib/server/locations");

    const { ServerValue } = await import("firebase-admin/database");

    const existingSnap = await adminDb.ref("locations").once("value");
    const existing = existingSnap.val() as Record<string, { name?: string }> | null;
    const existingNames = new Set(
      Object.values(existing || {}).map((loc) => (loc.name || "").toLowerCase()),
    );

    const updates: Record<string, unknown> = {};
    let added = 0;
    for (const loc of LOCATIONS) {
      const clean = cleanAndValidateLocation(loc);
      if (existingNames.has(clean.name.toLowerCase())) continue;

      const newRef = adminDb.ref("locations").push();
      updates[`locations/${newRef.key}`] = {
        name: clean.name,
        roles: clean.roles,
        active: true,
        createdAt: ServerValue.TIMESTAMP,
        createdBy: "auto-seed",
      };
      added++;
    }

    if (added > 0) {
      await adminDb.ref().update(updates);
      console.log(`[instrumentation] Seeded ${added} locations`);
    } else {
      console.log("[instrumentation] Locations already seeded, skipping");
    }
  }
}
