import type MonacoManager from "../shared-types/MonacoManager";

import { type CSSProperties } from "react";

type Props = {
  manager: MonacoManager;
  style?: CSSProperties;
  className?: string;
  height?: number | string;
};

export default function MonacoView({ manager, style, className, height = "100%" }: Props) {
  return (
    <div
      ref={manager.containerRef}
      className={className}
      style={{ width: "100%", height, ...style }}
    />
  );
}
