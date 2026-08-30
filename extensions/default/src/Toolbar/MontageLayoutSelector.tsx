// Split button per la Sottogriglia (Montage).
//  - ICONA (sinistra): attiva/disattiva la sottogriglia col layout CONSIGLIATO
//    (automatico in base al numero di istanze della serie, max 8) → `toggleMontage`.
//    Ri-clic = disattiva.
//  - FRECCETTA (destra): apre il selettore righe×colonne in stile "layout"
//    principale (sezione "Standard" + "Personalizzato"), che applica
//    `setMontageLayout`. Niente voce "off": si disattiva dall'icona stessa.
import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import { CommandsManager } from '@ohif/core';
import {
  Button,
  Icons,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  ToolButtonListDivider,
  utils,
} from '@ohif/ui-next';

import { LayoutSelector } from '../../../../platform/ui-next/src/components/LayoutSelector';

const cx = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(' ');

function MontageLayoutSelector({
  commandsManager,
  servicesManager,
  // Stato dalla valutazione del bottone (evaluate.cornerstone.montage):
  // isActive → sottogriglia attiva; disabled → serie non idonea (non-stack).
  isActive = false,
  disabled = false,
  disabledText,
  // Dimensioni massime della griglia "Personalizzato".
  rows = 4,
  columns = 4,
  ...props
}: {
  commandsManager: CommandsManager;
  servicesManager: any;
  isActive?: boolean;
  disabled?: boolean;
  disabledText?: string;
  rows?: number;
  columns?: number;
  [key: string]: any;
}) {
  const { customizationService } = servicesManager.services;

  // Preset "Standard": riusa gli stessi del selettore layout principale così le
  // icone sono identiche a quelle che l'utente già vede (e sicuramente esistono).
  const commonPresets = customizationService?.getCustomization('layoutSelector.commonPresets') || [
    { icon: 'layout-single', commandOptions: { numRows: 1, numCols: 1 } },
    { icon: 'layout-side-by-side', commandOptions: { numRows: 1, numCols: 2 } },
    { icon: 'layout-four-up', commandOptions: { numRows: 2, numCols: 2 } },
    { icon: 'layout-three-row', commandOptions: { numRows: 3, numCols: 1 } },
  ];

  const handleSelectionChange = useCallback(
    (commandOptions: { numRows?: number; numCols?: number }) => {
      const { numRows, numCols } = commandOptions;
      if (numRows && numCols) {
        commandsManager.run({
          commandName: 'setMontageLayout',
          commandOptions: { rows: numRows, cols: numCols },
        });
      }
    },
    [commandsManager]
  );

  const onToggle = useCallback(() => {
    if (disabled) {
      return;
    }
    commandsManager.run('toggleMontage');
  }, [commandsManager, disabled]);

  return (
    <div
      id="MontageLayout"
      data-cy="MontageLayout"
      className="inline-flex items-center"
    >
      {/* ICONA: attiva/disattiva con layout consigliato (auto) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={disabled ? 'cursor-not-allowed' : undefined}>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={onToggle}
              aria-label="Sottogriglia"
              className={cx(
                'h-10 w-10 bg-transparent !rounded-l-lg !rounded-r-none',
                utils.getToggledClassName(isActive),
                isActive && 'bg-background',
                disabled && 'cursor-not-allowed opacity-40'
              )}
            >
              <Icons.ByName
                name="tool-montage"
                className="h-7 w-7"
              />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div>
            {isActive
              ? 'Sottogriglia attiva (clic per disattivare)'
              : 'Sottogriglia: layout consigliato in base al numero di immagini (clic per attivare)'}
          </div>
          {disabled && disabledText && <div className="text-muted-foreground">{disabledText}</div>}
        </TooltipContent>
      </Tooltip>

      <ToolButtonListDivider />

      {/* FRECCETTA: selettore righe×colonne (Standard + Personalizzato) */}
      <LayoutSelector
        onSelectionChange={handleSelectionChange}
        {...props}
      >
        <LayoutSelector.Trigger>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Scegli righe × colonne"
            className={cx(
              'h-10 w-5 bg-transparent !rounded-l-none !rounded-r-lg',
              disabled && 'cursor-not-allowed opacity-40'
            )}
          >
            <Icons.ByName
              name="chevron-down"
              className="text-primary-active h-5 w-5"
            />
          </Button>
        </LayoutSelector.Trigger>
        <LayoutSelector.Content>
          {/* Sinistra - preset Standard */}
          <div className="bg-popover flex flex-col gap-2.5 rounded-lg p-2">
            <LayoutSelector.PresetSection
              className="montage-standard-layout"
              title="Standard"
            >
              {commonPresets.map((preset, index) => (
                <LayoutSelector.Preset
                  key={`montage-preset-${index}`}
                  icon={preset.icon}
                  commandOptions={preset.commandOptions}
                  isPreset={false}
                />
              ))}
            </LayoutSelector.PresetSection>
          </div>

          {/* Destra - griglia Personalizzato */}
          <div className="bg-muted flex flex-col gap-2.5 border-l-2 border-solid border-black p-2">
            <div className="montage-custom-layout">
              <div className="text-muted-foreground text-xs">Personalizzato</div>
              <LayoutSelector.GridSelector
                rows={rows}
                columns={columns}
              />
            </div>

            <LayoutSelector.HelpText>
              Seleziona righe × colonne. <br /> Clicca per applicare.
            </LayoutSelector.HelpText>
          </div>
        </LayoutSelector.Content>
      </LayoutSelector>
    </div>
  );
}

MontageLayoutSelector.propTypes = {
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object,
  isActive: PropTypes.bool,
  disabled: PropTypes.bool,
  disabledText: PropTypes.string,
  rows: PropTypes.number,
  columns: PropTypes.number,
};

export default MontageLayoutSelector;
