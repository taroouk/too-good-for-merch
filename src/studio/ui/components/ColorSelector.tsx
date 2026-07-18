/* eslint-disable @next/next/no-img-element */
import type { GarmentColor } from "@prisma/client";

type ColorSelectorProps = {
  color: GarmentColor | null;
  currentColorLabel: string;
  customColourIcon: string;
  onSelectBlack: () => void;
  onSelectWhite: () => void;
  onRequestCustomColour: () => void;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ColorSelector({
  color,
  currentColorLabel,
  customColourIcon,
  onSelectBlack,
  onSelectWhite,
  onRequestCustomColour,
}: ColorSelectorProps) {
  return (
    <div className="studio-control-group">
      <div className="studio-control-heading">
        <div>
          <div className="studio-eyebrow">Colour</div>
          <div className="studio-control-caption">
            Current: {currentColorLabel}
          </div>
        </div>

        <span className="studio-step-number">02</span>
      </div>

      <div className="studio-colour-row">
        <button
          type="button"
          aria-label="Select black"
          onClick={onSelectBlack}
          className={cn(
            "studio-colour-dot",
            color === "BLACK" ? "studio-colour-dot-active" : "",
          )}
        >
          <span className="studio-colour-dot-core studio-colour-dot-core-black" />
        </button>

        <button
          type="button"
          aria-label="Select white"
          onClick={onSelectWhite}
          className={cn(
            "studio-colour-dot studio-colour-dot-white",
            color === "WHITE" ? "studio-colour-dot-active" : "",
          )}
        >
          <span className="studio-colour-dot-core studio-colour-dot-core-white" />
        </button>

        <button
          type="button"
          aria-label="Request custom colour"
          onClick={onRequestCustomColour}
          className="studio-colour-dot studio-colour-dot-custom"
        >
          <img
            src={customColourIcon}
            alt=""
            aria-hidden="true"
            className="studio-colour-custom-icon"
          />
        </button>
      </div>
    </div>
  );
}
