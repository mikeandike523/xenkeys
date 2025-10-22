
import { Button, Div, Span } from "style-props-html";

interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: NumberStepperProps) {
  const handleDecrement = () => {
    const newValue = value - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  const handleIncrement = () => {
    const newValue = value + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  return (
    <Div display="flex" flexDirection="row" alignItems="center" gap="0.5rem">
      <Span color="white">{label}</Span>
      <Div
        display="flex"
        flexDirection="row"
        alignItems="center"
        border="1px solid white"
        borderRadius="4px"
      >
        <Button onClick={handleDecrement} padding="0.25rem 0.5rem">
          &lt;
        </Button>
        <Span
          color="white"
          minWidth="2rem"
          textAlign="center"
          padding="0 0.25rem"
        >
          {value}
        </Span>
        <Button onClick={handleIncrement} padding="0.25rem 0.5rem">
          &gt;
        </Button>
      </Div>
    </Div>
  );
}
