"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  Bounds,
  Center,
  Decal,
  Environment,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Mesh, MeshStandardMaterial, Object3D, TextureLoader } from "three";
import type { GarmentColor, ProductType } from "@prisma/client";

type TryOn3DPreviewProps = {
  product: ProductType | null;
  color: GarmentColor | null;
  artworkUrl: string | null;
};

function getModelPath(product: ProductType | null) {
  return "/assets/3d/fitted-tshirt.glb";
}

function getGarmentColor(color: GarmentColor | null) {
  return color === "BLACK" ? "#050505" : "#ffffff";
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function isShirtMesh(object: Object3D) {
  const name = object.name.toLowerCase();

  return (
    name.includes("shirt") ||
    name.includes("tshirt") ||
    name.includes("tee") ||
    name.includes("top") ||
    name.includes("garment")
  );
}

function Model3D({ product, color, artworkUrl }: TryOn3DPreviewProps) {
  const { scene } = useGLTF(getModelPath(product));

  const textureUrl = artworkUrl || "/assets/transparent-pixel.png";
  const artworkTexture = useLoader(TextureLoader, textureUrl);

  const shirtMaterial = useMemo(() => {
    return new MeshStandardMaterial({
      color: getGarmentColor(color),
      roughness: 0.75,
      metalness: 0,
    });
  }, [color]);

  const shirtMesh = useMemo<Mesh | null>(() => {
    let selectedMesh: Mesh | null = null;

    scene.traverse((object) => {
      if (!isMesh(object)) return;

      if (!selectedMesh && isShirtMesh(object)) {
        selectedMesh = object;
      }
    });

    return selectedMesh;
  }, [scene]);

  useEffect(() => {
    scene.traverse((object) => {
      if (!isMesh(object)) return;

      object.castShadow = true;
      object.receiveShadow = true;

      if (isShirtMesh(object)) {
        object.material = shirtMaterial;
      }
    });
  }, [scene, shirtMaterial]);

  return (
    <Center top>
      <primitive object={scene} />

      {shirtMesh && artworkUrl && (
        <mesh
          geometry={shirtMesh.geometry}
          position={shirtMesh.position}
          rotation={shirtMesh.rotation}
          scale={shirtMesh.scale}
        >
          <meshStandardMaterial transparent opacity={0} />

          <Decal
            position={[0, 1.15, 0.25]}
            rotation={[0, 0, 0]}
            scale={[0.28, 0.28, 0.28]}
            map={artworkTexture}
          />
        </mesh>
      )}
    </Center>
  );
}

export default function TryOn3DPreview({
  product,
  color,
  artworkUrl,
}: TryOn3DPreviewProps) {
  return (
    <section className="min-w-0 rounded-[26px] bg-[#faf8f6] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-black">3D Try-On</h2>
        <p className="mt-1 text-sm text-black/55">
          Drag to rotate. Scroll to zoom.
        </p>
      </div>

      <div className="h-[620px] w-full overflow-hidden rounded-[22px] border border-black/10 bg-white">
        <Canvas camera={{ position: [0, 1.2, 7], fov: 28 }} shadows>
          <ambientLight intensity={0.9} />
          <directionalLight position={[4, 6, 6]} intensity={1.25} castShadow />

          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.15}>
              <Model3D product={product} color={color} artworkUrl={artworkUrl} />
            </Bounds>

            <Environment preset="studio" />
          </Suspense>

          <OrbitControls
            makeDefault
            target={[0, 1, 0]}
            enablePan={false}
            enableZoom
            enableRotate
            minDistance={2}
            maxDistance={12}
          />
        </Canvas>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-3 text-xs leading-5 text-black/60">
        3D preview auto-fits the GLB model inside the viewer. Drag to rotate.
      </div>
    </section>
  );
}