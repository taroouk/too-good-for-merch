"use client";

import { useState } from "react";

const PRODUCT_TYPES = ["FITTED T-SHIRT", "OVERSIZED T-SHIRT", "BESPOKE"];
const COLORS = ["WHITE", "BLACK", "GRAY"];
const FABRICS = ["170 GSM Cotton", "200 GSM Premium", "300 GSM Heavy"];

export default function StudioPage() {
  const [product, setProduct] = useState(PRODUCT_TYPES[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [fabric, setFabric] = useState(FABRICS[0]);
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="grid grid-cols-12 h-screen bg-gray-100">

      {/* LEFT PANEL */}
      <div className="col-span-3 bg-white border-r p-5 space-y-6 overflow-auto">
        <h1 className="text-xl font-bold">Customize</h1>

        {/* PRODUCT TYPE */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Product Type</h2>
          <div className="space-y-2">
            {PRODUCT_TYPES.map((p) => (
              <button
                key={p}
                onClick={() => setProduct(p)}
                className={`w-full p-3 rounded-xl border text-sm transition ${
                  product === p
                    ? "bg-black text-white"
                    : "hover:border-black"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* COLOR */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Color</h2>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`flex-1 p-2 rounded-xl border text-xs ${
                  color === c ? "bg-black text-white" : ""
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* FABRIC */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Fabric</h2>
          <select
            value={fabric}
            onChange={(e) => setFabric(e.target.value)}
            className="w-full border rounded-xl p-2"
          >
            {FABRICS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* QUANTITY */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Quantity</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-1 border rounded-lg"
            >
              -
            </button>
            <span className="flex-1 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3 py-1 border rounded-lg"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* CENTER PREVIEW */}
      <div className="col-span-6 flex items-center justify-center">
        <div className="bg-white shadow-xl rounded-3xl p-10">
          
          <div className="text-center mb-6">
            <h2 className="font-bold text-lg">Live Preview</h2>
            <p className="text-sm text-gray-500">
              {product} • {color} • {fabric}
            </p>
          </div>

          {/* T-SHIRT MOCK */}
          <div className="relative flex justify-center">
            <div
              className={`w-[260px] h-[320px] rounded-2xl flex items-center justify-center text-gray-400 border-2 ${
                color === "BLACK"
                  ? "bg-black text-white"
                  : color === "GRAY"
                  ? "bg-gray-300"
                  : "bg-white"
              }`}
            >
              T-SHIRT PREVIEW
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="col-span-3 bg-white border-l p-5 space-y-6">
        <h1 className="text-xl font-bold">Checkout</h1>

        {/* PRICE BOX */}
        <div className="bg-gray-100 rounded-2xl p-5 text-center">
          <p className="text-sm text-gray-500">Total Price</p>
          <h2 className="text-2xl font-bold">
            ${(8.02 * quantity).toFixed(2)}
          </h2>
        </div>

        {/* SUMMARY */}
        <div className="space-y-2 text-sm">
          <p>Product: {product}</p>
          <p>Color: {color}</p>
          <p>Fabric: {fabric}</p>
          <p>Qty: {quantity}</p>
        </div>

        {/* BUTTON */}
        <button className="w-full bg-black text-white py-3 rounded-xl hover:bg-gray-800 transition">
          Create Order
        </button>

        <button className="w-full border py-3 rounded-xl hover:border-black transition">
          Add to Wishlist
        </button>
      </div>
    </div>
  );
}