import { prisma } from "../db";
import { computePalletsFromRow } from "./backofficeScraper";

const fallbackPallets = (() => {
  const fromEnv = Number(process.env.PALLET_FALLBACK);
  return Number.isFinite(fromEnv) ? fromEnv : 1;
})();

export const getEffectivePallets = async (consignmentId: string): Promise<number> => {
  const consignment = await prisma.consignment.findUnique({
    where: { id: consignmentId },
    select: {
      palletsFromSite: true,
      customerKey: true,
      rawJson: true,
      palletOverride: { select: { pallets: true } },
    },
  });

  if (!consignment) {
    return fallbackPallets;
  }

  if (consignment.palletOverride) {
    return consignment.palletOverride.pallets;
  }

  if (consignment.palletsFromSite != null && consignment.palletsFromSite > 0) {
    return consignment.palletsFromSite;
  }

  // Recompute from stored backoffice row when pallets missing (e.g. scraped before rules or different columns)
  if (consignment.rawJson) {
    try {
      const row = JSON.parse(consignment.rawJson) as Record<string, string>;
      const computed = computePalletsFromRow(row);
      if (computed != null && computed > 0) return computed;
    } catch {
      // ignore parse errors
    }
  }

  if (consignment.customerKey) {
    const profile = await prisma.customerProfile.findUnique({
      where: { customerKey: consignment.customerKey },
      select: { defaultPallets: true },
    });

    if (profile) {
      return profile.defaultPallets;
    }
  }

  return fallbackPallets;
};
