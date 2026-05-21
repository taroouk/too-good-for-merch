import { useEffect, useRef, useState } from "react";
import { Canvas, FabricImage } from "fabric";

export default function FabricMerchMockup() {
  const canvasElRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new Canvas(canvasElRef.current, {
      width: 900,
      height: 1100,
      backgroundColor: "#f5f5f5",
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;

    FabricImage.fromURL("/assets/mockups/tshirt-front.png", {
      crossOrigin: "anonymous",
    }).then((img) => {
      img.set({
        left: 0,
        top: 0,
        selectable: false,
        evented: false,
      });

      img.scaleToWidth(900);
      canvas.add(img);
      canvas.sendObjectToBack(img);
      canvas.renderAll();
    });

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  async function handleUploadDesign(event) {
    const file = event.target.files?.[0];
    if (!file || !fabricCanvasRef.current) return;

    const objectUrl = URL.createObjectURL(file);

    const img = await FabricImage.fromURL(objectUrl);
    img.set({
      left: 330,
      top: 360,
      cornerStyle: "circle",
      transparentCorners: false,
      borderColor: "#111",
      cornerColor: "#111",
    });

    img.scaleToWidth(240);

    fabricCanvasRef.current.add(img);
    fabricCanvasRef.current.setActiveObject(img);
    fabricCanvasRef.current.renderAll();
  }

  function exportPreview() {
    if (!fabricCanvasRef.current) return;

    const dataUrl = fabricCanvasRef.current.toDataURL({
      format: "png",
      quality: 1,
      multiplier: 2,
    });

    setPreviewUrl(dataUrl);
  }

  function deleteSelected() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;

    canvas.remove(activeObject);
    canvas.discardActiveObject();
    canvas.renderAll();
  }

  function resetCanvas() {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects();

    objects.forEach((object) => {
      if (object.selectable !== false) {
        canvas.remove(object);
      }
    });

    canvas.renderAll();
    setPreviewUrl(null);
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl border bg-neutral-100">
        <canvas ref={canvasElRef} />
      </div>

      <aside className="space-y-4 rounded-2xl border bg-white p-4">
        <div>
          <h2 className="text-xl font-semibold">Live Mockup</h2>
          <p className="text-sm text-gray-500">
            Upload your design and position it on the garment.
          </p>
        </div>

        <label className="block cursor-pointer rounded-xl bg-black px-4 py-3 text-center text-sm text-white">
          Upload Design
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUploadDesign}
            className="hidden"
          />
        </label>

        <button
          type="button"
          onClick={deleteSelected}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        >
          Delete Selected
        </button>

        <button
          type="button"
          onClick={resetCanvas}
          className="w-full rounded-xl border px-4 py-3 text-sm"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={exportPreview}
          className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm text-white"
        >
          Export Preview
        </button>

        {previewUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Exported preview:</p>
            <img
              src={previewUrl}
              alt="Exported merch preview"
              className="rounded-xl border"
            />
          </div>
        )}
      </aside>
    </section>
  );
}