"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";

// The mark beside a move in a price, a percentage or a place: up or down, filled,
// sitting on the line of type around it. It takes its colour from that type.
export default function MoveArrow({ up, size = 12 }: { up: boolean; size?: number }) {
  const Glyph = up ? CaretUpIcon : CaretDownIcon;
  return <Glyph size={size} weight="fill" className="inline align-[-1px]" role="img" aria-label={up ? "Up" : "Down"} />;
}
