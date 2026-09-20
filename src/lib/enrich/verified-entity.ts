// Verified-entity enrichment: confirm and enrich a company against authoritative
// PUBLIC registries that are free AND safe to redistribute -
//   - GLEIF (global LEI, CC0)               - always available, no key
//   - UK Companies House (OGL v3, attribute) - needs COMPANIES_HOUSE_API_KEY
//   - SEC EDGAR (US public, public domain)   - always available, no key
//
// Free (no credit charge): the data costs nothing. Accuracy-first: each provider
// only returns a result on a strong legal-name match, so a same-name stranger is
// never attached. Results land under entity.enrichment.legal with field-level
// provenance and the attribution strings the licences require.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpError } from "@/lib/crm-operations";
import { recordProvenanceBulk, CONFIDENCE, type ProvenanceInput } from "@/lib/provenance";
import { gleifLookup } from "@/lib/providers/gleif";
import { companiesHouseLookup, isCompaniesHouseConfigured, CH_ATTRIBUTION } from "@/lib/providers/companies-house";
import { secEdgarLookup } from "@/lib/providers/sec-edgar";

export async function verifyEntity(userId: string, entityId: string) {
  const entity = await prisma.entity.findUnique({ where: { id: entityId } });
  if (!entity || entity.userId !== userId) throw new OpError("Entity not found", 404);

  const [gleif, ch, edgar] = await Promise.all([
    gleifLookup(entity.name).catch(() => null),
    isCompaniesHouseConfigured()
      ? companiesHouseLookup(entity.name).catch(() => null)
      : Promise.resolve(null),
    secEdgarLookup(entity.name).catch(() => null),
  ]);

  if (!gleif && !ch && !edgar) {
    throw new OpError(
      `No verified legal-entity record found for "${entity.name}" in GLEIF, Companies House, or SEC EDGAR.`,
      404,
    );
  }

  const existing =
    entity.enrichment && typeof entity.enrichment === "object" && !Array.isArray(entity.enrichment)
      ? (entity.enrichment as Record<string, unknown>)
      : {};

  const attribution: string[] = [];
  if (gleif) attribution.push("Legal entity data via GLEIF (CC0).");
  if (ch) attribution.push(CH_ATTRIBUTION);
  if (edgar) attribution.push("Registration/financial data from SEC EDGAR (public domain).");

  const legal = {
    gleif: gleif ?? undefined,
    companiesHouse: ch ?? undefined,
    secEdgar: edgar ?? undefined,
    attribution,
    verifiedAt: new Date().toISOString(),
  };

  const data: Prisma.EntityUncheckedUpdateInput = {
    status: "ENRICHED",
    enrichment: { ...existing, legal } as Prisma.InputJsonValue,
  };

  // Fill empty columns from the most authoritative source that has the value.
  const regAddress = ch?.address ?? gleif?.address ?? edgar?.address;
  const filledLocation = !entity.location && regAddress ? regAddress : undefined;
  if (filledLocation) data.location = filledLocation;
  const filledIndustry = !entity.industry && edgar?.sicDescription ? edgar.sicDescription : undefined;
  if (filledIndustry) data.industry = filledIndustry;

  const updated = await prisma.entity.update({ where: { id: entityId }, data });

  const rows: ProvenanceInput[] = [];
  if (gleif)
    rows.push({ recordType: "entity", recordId: entityId, field: "lei", source: "gleif", confidence: CONFIDENCE.gleif, value: gleif.lei });
  if (ch)
    rows.push({ recordType: "entity", recordId: entityId, field: "company_number", source: "companies_house", confidence: CONFIDENCE.companies_house, value: ch.companyNumber });
  if (edgar)
    rows.push({ recordType: "entity", recordId: entityId, field: "sec_cik", source: "sec_edgar", confidence: CONFIDENCE.sec_edgar, value: edgar.cik });
  if (filledLocation)
    rows.push({ recordType: "entity", recordId: entityId, field: "location", source: ch ? "companies_house" : gleif ? "gleif" : "sec_edgar", value: filledLocation });
  if (filledIndustry)
    rows.push({ recordType: "entity", recordId: entityId, field: "industry", source: "sec_edgar", confidence: CONFIDENCE.sec_edgar, value: filledIndustry });
  await recordProvenanceBulk(rows);

  return {
    id: updated.id,
    name: updated.name,
    verified: { gleif: Boolean(gleif), companiesHouse: Boolean(ch), secEdgar: Boolean(edgar) },
    legal,
  };
}
