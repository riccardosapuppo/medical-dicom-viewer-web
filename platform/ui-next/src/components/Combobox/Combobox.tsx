import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../Button/Button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../Command/Command';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover/Popover';

export type ComboboxItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ComboboxProps = {
  data?: ComboboxItem[];
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  buttonClassName?: string;
  contentClassName?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export function Combobox({
  data = [],
  placeholder = 'Select item...',
  value,
  onValueChange,
  searchValue,
  onSearchChange,
  buttonClassName,
  contentClassName,
  emptyLabel,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState('');
  const [internalSearch, setInternalSearch] = React.useState('');

  const currentValue = value ?? internalValue;
  const currentSearch = searchValue ?? internalSearch;

  const setValue = (nextValue: string) => {
    if (onValueChange) {
      onValueChange(nextValue);
    } else {
      setInternalValue(nextValue);
    }
  };

  const setSearch = (nextValue: string) => {
    if (onSearchChange) {
      onSearchChange(nextValue);
    } else {
      setInternalSearch(nextValue);
    }
  };

  const shouldFilter = !(onSearchChange || searchValue !== undefined);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-[200px] justify-between', buttonClassName)}
        >
          {currentValue
            ? data.find(item => item.value === currentValue)?.label
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[200px] p-0', contentClassName)}>
        <Command shouldFilter={shouldFilter}>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}...`}
            value={currentSearch}
            onValueChange={setSearch}
            onChange={event => setSearch(event.target.value)}
          />
          <CommandEmpty>
            {emptyLabel ?? `No ${placeholder.toLowerCase()} found.`}
          </CommandEmpty>
          <CommandList>
            <CommandGroup>
              {data.map(item => (
                <CommandItem
                  key={item.value}
                  value={shouldFilter ? `${item.value} ${item.label}` : item.value}
                  disabled={item.disabled}
                  onSelect={() => {
                    if (item.disabled) {
                      return;
                    }
                    setValue(item.value === currentValue ? '' : item.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      currentValue === item.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
