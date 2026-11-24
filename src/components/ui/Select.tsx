import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select option',
  ariaLabel,
  id,
}: {
  value: string;
  onValueChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger id={id} className="ui-select-trigger" aria-label={ariaLabel}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ui-select-chevron">
          <ChevronDown size={15} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          avoidCollisions
        >
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((opt) => (
              <SelectPrimitive.Item key={opt.value} value={opt.value} className="ui-select-item">
                <SelectPrimitive.ItemText>
                  <span className="ui-select-item-label">{opt.label}</span>
                </SelectPrimitive.ItemText>
                {opt.description && <span className="ui-select-item-desc">{opt.description}</span>}
                <SelectPrimitive.ItemIndicator className="ui-select-check">
                  <Check size={14} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
