import React from 'react';
import {
  ToolButtonList,
  ToolButton,
  ToolButtonListDefault,
  ToolButtonListDropDown,
  ToolButtonListItem,
  ToolButtonListDivider,
} from '@ohif/ui-next';
import { useToolbar } from '@ohif/core/src';
import { useSystem } from '@ohif/core';
import { getShortcut } from './ToolButtonWithShortcut';

interface ToolButtonListWrapperProps {
  groupId: string;
  buttonSection: string;
  onInteraction?: (details: {
    groupId: string;
    itemId: string;
    commands?: Record<string, unknown>;
  }) => void;
}

/**
 * Wraps the ToolButtonList component to handle the OHIF toolbar button structure
 * @param props - Component props
 * @returns Component
 * // test
 */
export default function ToolButtonListWrapper({
  groupId,
  buttonSection,
}: ToolButtonListWrapperProps) {
  const { onInteraction, toolbarButtons } = useToolbar({
    buttonSection,
  });
  const { hotkeysManager } = useSystem() || ({} as any);

  if (!toolbarButtons?.length) {
    return null;
  }

  const primary =
    toolbarButtons.find(button => button.componentProps.isActive)?.componentProps ||
    toolbarButtons[0].componentProps;

  const items = toolbarButtons.map(button => button.componentProps);

  // Tooltip con scorciatoia da tastiera corrente (dinamica).
  const tooltipWithShortcut = (cp: any) => {
    try {
      const sc = getShortcut(cp, hotkeysManager);
      const base = cp.tooltip || cp.label;
      return sc && base ? `${base} (${sc})` : cp.tooltip;
    } catch (e) {
      return cp.tooltip;
    }
  };

  return (
    <ToolButtonList>
      <ToolButtonListDefault>
        <div
          data-cy={`${groupId}-split-button-primary`}
          data-tool={primary.id}
          data-active={primary.isActive}
        >
          <ToolButton
            {...primary}
            tooltip={tooltipWithShortcut(primary)}
            onInteraction={({ itemId }) =>
              onInteraction?.({ groupId, itemId, commands: primary.commands })
            }
            className={primary.className}
          />
        </div>
      </ToolButtonListDefault>
      <ToolButtonListDivider className={primary.isActive ? 'opacity-0' : 'opacity-100'} />
      <div id="SplitButton" data-cy={`${groupId}-split-button-secondary`}>
        <ToolButtonListDropDown>
          {items.map(item => {
            // Pass only props that ToolButtonListItem consumes. Spreading the
            // full button componentProps would leak non-DOM props (evaluate,
            // commands, isActive, options, etc.) onto the underlying div and
            // trigger React warnings.
            let shortcut = null;
            try {
              shortcut = getShortcut(item, hotkeysManager);
            } catch (e) {
              /* noop */
            }
            const itemLabel = item.label || item.tooltip || item.id;
            return (
              <ToolButtonListItem
                key={item.id}
                id={item.id}
                icon={item.icon}
                disabled={item.disabled}
                disabledText={item.disabledText}
                tooltip={tooltipWithShortcut(item)}
                className={item.className}
                data-cy={item.id}
                data-tool={item.id}
                data-active={item.isActive}
                onSelect={() =>
                  onInteraction?.({ groupId, itemId: item.id, commands: item.commands })
                }
              >
                <span className="pl-1">
                  {itemLabel}
                  {shortcut ? <span className="text-muted-foreground"> ({shortcut})</span> : null}
                </span>
              </ToolButtonListItem>
            );
          })}
        </ToolButtonListDropDown>
      </div>
    </ToolButtonList>
  );
}
