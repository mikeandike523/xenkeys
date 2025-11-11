import { css } from "@emotion/react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

type Props = {
  value: number;           // 0..100
  onChange: (v: number) => void;
};

export default function GainSlider({ value, onChange }: Props) {
  return (
    <div
      aria-label="Gain"
      css={css`
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 140px;
      `}
    >
      <span css={css`font-weight: bold; font-size: 0.9rem;`}>Gain</span>
      <div
        css={css`
          flex: 1;
          padding: 0 0.25rem;
        `}
      >
        <Slider
          min={0}
          max={100}
          value={value}
          onChange={(v) => typeof v === "number" && onChange(v)}
          aria-label="Gain"
        />
      </div>
    </div>
  );
}
