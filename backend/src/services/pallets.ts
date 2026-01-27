import { prisma } from "../db";

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
      palletOverride: { select: { pallets: true } },
    },
  });

  if (!consignment) {
    return fallbackPallets;
  }

  if (consignment.palletOverride) {
    return consignment.palletOverride.pallets;
  }

  if (consignment.palletsFromSite !== null) {
    return consignment.palletsFromSite;
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
