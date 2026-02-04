import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../db";
import type { AuthRequest } from "../middleware/auth";
import {
  geocodeUKPostcodeWithCache,
  normalizeUKPostcode,
  PostcodeNotFoundError,
} from "../services/geocodePostcode";

export type GeoWarning = "POSTCODE_NOT_FOUND" | "GEOCODE_FAILED";

function locationResponse(
  location: { id: string; displayName: string; destinationKey: string | null; address: string | null; notes: string | null; postcode: string | null; lat: number | null; lng: number | null; geoUpdatedAt: Date | null; createdAt: Date; updatedAt: Date },
  geoWarning?: GeoWarning
) {
  return {
    ok: true as const,
    location: {
      id: location.id,
      displayName: location.displayName,
      destinationKey: location.destinationKey,
      address: location.address,
      notes: location.notes,
      postcode: location.postcode,
      lat: location.lat,
      lng: location.lng,
      geoUpdatedAt: location.geoUpdatedAt,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
      ...(geoWarning != null && { geoWarning }),
    },
  };
}

const createDeliveryLocationSchema = z.object({
  displayName: z.string().trim().min(1),
  destinationKey: z.string().trim().optional(),
  address: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  postcode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const updateDeliveryLocationSchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  destinationKey: z.string().trim().optional().nullable(),
  address: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable(),
  postcode: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geoUpdatedAt: z.string().datetime().optional().nullable(),
});

export const deliveryLocationsRouter = Router();

deliveryLocationsRouter.get("/api/delivery-locations", async (_req: AuthRequest, res: Response) => {
  try {
    const locations = await prisma.deliveryLocation.findMany({
      orderBy: { displayName: "asc" },
    });
    res.json({ ok: true, locations });
  } catch (err) {
    console.error("List delivery locations error:", err);
    res.status(500).json({ ok: false, error: "Failed to list delivery locations" });
  }
});

deliveryLocationsRouter.post("/api/delivery-locations", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createDeliveryLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input: displayName and address required" });
      return;
    }

    const { displayName, destinationKey, address, notes, postcode: postcodeRaw, lat: latBody, lng: lngBody } = parsed.data;
    const normalizedPostcode =
      postcodeRaw != null && String(postcodeRaw).trim() !== ""
        ? normalizeUKPostcode(String(postcodeRaw).trim())
        : null;

    let geoLat: number | null = latBody ?? null;
    let geoLng: number | null = lngBody ?? null;
    let geoUpdatedAt: Date | null = latBody != null && lngBody != null ? new Date() : null;
    let geoWarning: GeoWarning | undefined;

    const shouldGeocode =
      normalizedPostcode != null &&
      normalizedPostcode !== "" &&
      (geoLat == null || geoLng == null);

    if (shouldGeocode) {
      try {
        const result = await geocodeUKPostcodeWithCache(normalizedPostcode, null);
        geoLat = result.lat;
        geoLng = result.lng;
        geoUpdatedAt = new Date();
      } catch (err) {
        geoLat = null;
        geoLng = null;
        geoUpdatedAt = null;
        geoWarning = err instanceof PostcodeNotFoundError ? "POSTCODE_NOT_FOUND" : "GEOCODE_FAILED";
      }
    }

    const location = await prisma.deliveryLocation.create({
      data: {
        displayName,
        destinationKey: destinationKey ?? null,
        address: address ?? null,
        notes: notes ?? null,
        postcode: normalizedPostcode,
        lat: geoLat,
        lng: geoLng,
        geoUpdatedAt,
      },
    });

    res.status(201).json(locationResponse(location, geoWarning));
  } catch (err) {
    console.error("Create delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to create delivery location" });
  }
});

deliveryLocationsRouter.patch("/api/delivery-locations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateDeliveryLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid input" });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.deliveryLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Delivery location not found" });
      return;
    }

    const updateData: {
      displayName?: string;
      destinationKey?: string | null;
      address?: string | null;
      notes?: string | null;
      postcode?: string | null;
      lat?: number | null;
      lng?: number | null;
      geoUpdatedAt?: Date | null;
    } = {};

    if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
    if (parsed.data.destinationKey !== undefined) updateData.destinationKey = parsed.data.destinationKey;
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    const postcodeSupplied = parsed.data.postcode !== undefined;
    const newPostcodeRaw = postcodeSupplied ? parsed.data.postcode : existing.postcode;
    const normalizedPostcode =
      newPostcodeRaw != null && String(newPostcodeRaw).trim() !== ""
        ? normalizeUKPostcode(String(newPostcodeRaw).trim())
        : null;

    if (postcodeSupplied) updateData.postcode = normalizedPostcode;

    const existingNormalized = existing.postcode ? normalizeUKPostcode(existing.postcode) : null;
    const postcodeChanged =
      normalizedPostcode !== existingNormalized ||
      (normalizedPostcode == null && existingNormalized != null) ||
      (normalizedPostcode != null && existingNormalized == null);
    const latLngMissing = existing.lat == null || existing.lng == null;
    const shouldGeocode =
      normalizedPostcode != null &&
      normalizedPostcode !== "" &&
      (latLngMissing || postcodeChanged);

    let geoWarning: GeoWarning | undefined;

    if (shouldGeocode) {
      try {
        const result = await geocodeUKPostcodeWithCache(normalizedPostcode, {
          postcode: existing.postcode,
          lat: existing.lat,
          lng: existing.lng,
        });
        updateData.lat = result.lat;
        updateData.lng = result.lng;
        updateData.geoUpdatedAt = new Date();
        if (result.normalized !== normalizedPostcode) updateData.postcode = result.normalized;
      } catch (err) {
        updateData.lat = null;
        updateData.lng = null;
        updateData.geoUpdatedAt = null;
        geoWarning = err instanceof PostcodeNotFoundError ? "POSTCODE_NOT_FOUND" : "GEOCODE_FAILED";
      }
    } else {
      if (parsed.data.lat !== undefined) updateData.lat = parsed.data.lat;
      if (parsed.data.lng !== undefined) updateData.lng = parsed.data.lng;
      if (parsed.data.geoUpdatedAt !== undefined) {
        updateData.geoUpdatedAt = parsed.data.geoUpdatedAt ? new Date(parsed.data.geoUpdatedAt) : null;
      }
      if (
        updateData.lat != null &&
        updateData.lng != null &&
        updateData.geoUpdatedAt === undefined &&
        parsed.data.geoUpdatedAt === undefined
      ) {
        updateData.geoUpdatedAt = new Date();
      }
    }

    const location = await prisma.deliveryLocation.update({
      where: { id },
      data: updateData,
    });

    res.json(locationResponse(location, geoWarning));
  } catch (err) {
    console.error("Update delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to update delivery location" });
  }
});

deliveryLocationsRouter.delete("/api/delivery-locations/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.deliveryLocation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Delivery location not found" });
      return;
    }

    await prisma.deliveryLocation.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error("Delete delivery location error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete delivery location" });
  }
});
