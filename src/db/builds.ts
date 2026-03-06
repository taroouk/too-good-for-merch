// src/db/builds.ts
import {prisma} from "src/lib/prisma";

export async function listBuildsByUser(userId: string) {
  return prisma.build.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      draft: { select: { product: true, color: true, fabric: true, quantity: true } },
    },
  });
}

export async function createBuildForUser(userId: string, name?: string) {
  return prisma.build.create({
    data: {
      userId,
      name: name?.trim() ? name.trim() : "New Project",
      draft: { create: {} },
    },
    select: { id: true },
  });
}

export async function getBuildWithDraft(userId: string, buildId: string) {
  return prisma.build.findFirst({
    where: { id: buildId, userId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      draft: {
        select: {
          id: true,
          product: true,
          color: true,
          fabric: true,
          quantity: true,
          customNotes: true,
          primaryAssetId: true,
        },
      },
      assets: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
      },
      designs: {
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, name: true, updatedAt: true },
      },
    },
  });
}

export async function renameBuild(userId: string, buildId: string, name: string) {
  return prisma.build.updateMany({
    where: { id: buildId, userId },
    data: { name: name.trim().slice(0, 120) || "Untitled" },
  });
}