import type { RefObject } from "react";
import type { FabricType } from "@prisma/client";

type FabricOption = {
  key: FabricType;
  name: string;
  gsm: string;
  desc: string;
};

type FabricSelectorProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  currentFabric: FabricOption;
  fabricOptions: FabricOption[];
  selectedFabric: FabricType | null;
  open: boolean;
  onToggleOpen: () => void;
  onSelectFabric: (fabric: FabricType) => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function FabricSelector({
  menuRef,
  currentFabric,
  fabricOptions,
  selectedFabric,
  open,
  onToggleOpen,
  onSelectFabric,
}: FabricSelectorProps) {
  return (
    <div className="studio-control-group">
      <div className="studio-control-heading">
        <div>
          <div className="studio-fabric-title-row">
            <span className="studio-eyebrow mb-0">Fabric</span>
          </div>

          <div className="studio-control-caption">
            Current: {currentFabric.gsm}
          </div>
        </div>

        <span className="studio-step-number">03</span>
      </div>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={onToggleOpen}
          className="studio-fabric-card"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="studio-fabric-swatch" />

          <span className="studio-fabric-content">
            <span className="studio-fabric-name">{currentFabric.name}</span>
            <span className="studio-fabric-gsm">{currentFabric.gsm}</span>
            <span className="studio-fabric-desc">{currentFabric.desc}</span>
          </span>

          <svg
            className={cn(
              "studio-fabric-arrow",
              open ? "rotate-180" : "",
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {open ? (
          <div className="studio-fabric-menu" role="listbox">
            {fabricOptions.map((fabric) => (
              <button
                key={fabric.key}
                type="button"
                onClick={() => onSelectFabric(fabric.key)}
                className={cn(
                  "studio-fabric-option",
                  selectedFabric === fabric.key
                    ? "studio-fabric-option-active"
                    : "",
                )}
              >
                <span className="studio-fabric-swatch studio-fabric-option-swatch" />

                <span className="studio-fabric-option-copy">
                  <span className="studio-fabric-option-name">
                    {fabric.name}
                  </span>

                  <span className="studio-fabric-option-desc">
                    {fabric.desc}
                  </span>
                </span>

                {selectedFabric === fabric.key ? (
                  <span className="studio-fabric-check">✓</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
